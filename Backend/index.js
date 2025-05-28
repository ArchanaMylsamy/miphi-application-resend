

// Main serverless entry point
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('jsonwebtoken');
const { PassThrough } = require('stream');
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { Readable } = require('stream');
require('dotenv').config();
 
// Initialize Express
const app = express();
 
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
const JWT_SECRET = process.env.JWT_SECRET_KEY
// Initialize S3 client
const s3Client = new S3Client({
    region: process.env.AWS_REGION, // e.g., 'us-east-1'
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
  
 
// Configure multer for Vercel - using memory storage instead of disk storage
const storage = multer.memoryStorage();
const upload = multer({ storage });
 
// Initialize PostgreSQL pool
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});
 
// Helper function to execute queries
const queryPromise = async (text, params) => {
  return await pool.query(text, params).then(res => res.rows);
};
 
const initDB = async () => {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        mobile_number VARCHAR(20),
        password VARCHAR(255),
        country_code VARCHAR(20),
        role TEXT CHECK (role IN ('customer','employee','admin')),
        registered_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create products table
    await pool.query(`
     CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sales_order_number VARCHAR(50),
  product_name VARCHAR(255),
  part_number VARCHAR(100),
  serial_number VARCHAR(100),
  sold_to_party VARCHAR(255),
  shipped_to_customer_name VARCHAR(255),
  billing_date VARCHAR(255),
  billing_date_number VARCHAR(50), -- if it's a numeric representation of the date
  billing_type VARCHAR(50),
  net_quantity INT,
  net_value_in_local_currency DECIMAL(18,2),
  unit_price DECIMAL(18,2),
  net_tax DECIMAL(18,2),
  total_amount DECIMAL(18,2),
  purchase_order_number VARCHAR(100),
  delivery_number VARCHAR(100),
  material_details TEXT
);
    `);

    // Create product_registration table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_registration (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        product_name VARCHAR(255) NOT NULL,
        serial_number VARCHAR(255) UNIQUE NOT NULL,
        part_number VARCHAR(255)  NOT NULL,
        invoice_receipt TEXT,
        registered_for_claim TEXT CHECK (registered_for_claim IN ('yes','no')) DEFAULT 'no',
        registered_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create customers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        customerName VARCHAR(255) NOT NULL,
        customerLocation VARCHAR(255) NOT NULL,
        category TEXT CHECK (category IN ('MSME/Educational_Institutions','Datacentres')) NOT NULL,
        participantName VARCHAR(255) NOT NULL,
        participantEmail VARCHAR(255) NOT NULL,
        baseModelSize TEXT CHECK (baseModelSize IN ('>=3B','7B','13B','34B','70B','180B','450B','700B')) NOT NULL,
        isCustom TEXT CHECK (isCustom IN ('Yes','No')) NOT NULL,
        onHuggingFace TEXT CHECK (onHuggingFace IN ('Yes','No')) NOT NULL,
        hfLink VARCHAR(512) NOT NULL,
        architecture VARCHAR(255) NOT NULL,
        workloads TEXT CHECK (workloads IN ('Finetuning','Inference','Both')) NOT NULL,
        infraType TEXT CHECK (infraType IN ('On-premise','Private Cloud','No Existing AI Infrastructure')) NOT NULL,
        motherboard VARCHAR(255),
        processor VARCHAR(255),
        dram VARCHAR(255),
        gpus VARCHAR(255),
        os VARCHAR(255),
        submitted_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create warranty_status table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS warranty_status (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        product_id INT REFERENCES product_registration(id) ON DELETE CASCADE,
        customer_remarks VARCHAR(255),
        claim_status TEXT CHECK (claim_status IN ('Pending','Approved','Rejected')) DEFAULT 'Pending',
        submitted_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Insert the admin user with password 'admin123'
    const adminPassword = await bcrypt.hash('admin123', 10); // Hash the password
    await pool.query(`
      INSERT INTO users (name, email, password, role)
      VALUES ('Admin', 'admin@example.com', $1, 'admin')
      ON CONFLICT (email) DO NOTHING
    `, [adminPassword]);

    console.log("✅ CockroachDB tables initialized and admin user created successfully.");
  } catch (err) {
    console.error("❌ Error during DB initialization:", err.stack);
  }
};

// Verify Token Middleware
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
 
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }
 
  const token = authHeader.split(' ')[1];
 
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Token verification failed:', err);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
 
    req.user = user;
    next();
  });
}
 
function verifyAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied: Admins only' });
  }
}
 
// Initialize DB on first load
let dbInitialized = false;
const initializeApp = async () => {
  if (!dbInitialized) {
    await initDB();
    dbInitialized = true;
  }
};
 
// Endpoints\

// Login Endpoint
app.post('/login', async (req, res) => {
  await initializeApp();
  //console.log(req.body);
  const { email, password } = req.body;
 
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
 
  try {
    const [user] = await queryPromise('SELECT *  FROM users WHERE email = $1', [email]);

 
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
 
   // console.log('Attempting login for:', user);
 
    const storedPasswordHash = user.password;
    const match = await bcrypt.compare(password, storedPasswordHash);
   // console.log('Password match result:', match);
 
    if (!match) {
    //  console.log("Password does not match");
      return res.status(401).json({ error: "Invalid password." });
    }
 
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const user_details = {
       "name" : user.name,
       "email" : user.email,
       "role" : user.role,
       "phone_number" : user.mobile_number

    }
 
    res.json({ message: "Login successful", token, user });
 
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
 
app.post('/update_password', verifyToken,  async (req, res) => {
  await initializeApp();
  const { new_password } = req.body;
  const email = req.user?.email; // Use token-authenticated email

  if (!email || !new_password) {
    return res.status(400).json({ error: "Email and new password are required." });
  }

  try {
    const users = await queryPromise('SELECT id FROM users WHERE email = $1', [email]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const hashedNewPassword = await bcrypt.hash(new_password, saltRounds);
    await queryPromise('UPDATE users SET password = $1 WHERE email = $2', [hashedNewPassword, email]);

    res.json({ message: "Password updated successfully." });

  } catch (err) {
    console.error("Error updating password:", err);
    res.status(500).json({ error: "Server error" });
  }
});

 
app.get('/user_registrations/:email', verifyToken, async (req, res) => {
  await initializeApp();
  const { email } = req.params;
  const tokenEmail = req.user?.email;

  // Uncomment this if you want to restrict access based on logged-in user
  // if (email !== tokenEmail) {
  //   return res.status(403).json({ message: "Access denied. Email mismatch." });
  // }

  try {
    // Get user info by email
    const userResult = await queryPromise(`SELECT * FROM users WHERE email = $1`, [email]);

    if (userResult.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = userResult[0];

    // Fetch product registrations using user_id
    const registrations = await queryPromise(`
      SELECT
        u.name AS user_name,
        u.email,
        u.id,
        u.mobile_number,
        pr.product_name,
        pr.serial_number,
        pr.part_number,
        pr.invoice_receipt,
        pr.registered_at
      FROM users u
      JOIN product_registration pr ON u.id = pr.user_id
      WHERE u.id = $1
    `, [user.id]);

    if (registrations.length === 0) {
      return res.status(404).json({ message: "No registrations found for this user." });
    }

    res.json({ registrations });

  } catch (err) {
    console.error("Error fetching registrations:", err);
    res.status(500).json({ error: "Server error" });
  }
});

 
app.get('/registered_users', async (req, res) => {
  await initializeApp();
  try {
    const registrations = await queryPromise(`
      SELECT 
        pr.id AS registration_id,
        pr.product_name,
        pr.serial_number,
        pr.invoice_receipt,
        pr.registered_at,
        pr.part_number,
        u.id AS id,
        u.name AS name,
        u.email,
        u.mobile_number,
        u.country_code
      FROM product_registration pr
      JOIN users u ON pr.user_id = u.id
      ORDER BY pr.registered_at DESC
    `, []);

    if (registrations.length === 0) {
      return res.status(404).json({ message: "No products registered for warranty." });
    }

    res.json({ registrations });

  } catch (err) {
    console.error("Error fetching registrations:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get('/registered_warranty_claims', verifyToken , verifyAdmin,  async (req, res) => {
  await initializeApp();
  try {
    const registrations = await queryPromise(`
      SELECT 
        ws.id AS claim_id,
        ws.claim_status,
        ws.customer_remarks,
        ws.submitted_at AS claim_updated_at,
        pr.id AS product_registration_id,
        pr.product_name,
        pr.serial_number,
        pr.invoice_receipt,
        pr.registered_at,
        u.country_code,
        u.id AS user_id,
        u.name AS user_name,
        u.email,
        u.mobile_number
       
      FROM warranty_status ws
      JOIN product_registration pr ON ws.product_id = pr.id
      JOIN users u ON pr.user_id = u.id
      ORDER BY ws.submitted_at DESC
    `, []);

    if (registrations.length === 0) {
      return res.status(404).json({ message: "No Warranty Claims Available" });
    }

    res.json({ registrations });

  } catch (err) {
    console.error("Error fetching warranty claims:", err);
    res.status(500).json({ error: "Server error" });
  }
});

 
app.get('/shipped_products', verifyToken, verifyAdmin, async (req, res) => {
  await initializeApp();
  try {
    const registrations = await queryPromise(`
      SELECT * FROM products
    `, []);
 
    if (registrations.length === 0) {
      return res.status(404).json({ message: "No Products Available" });
    }
 
    res.json({ registrations });
 
  } catch (err) {
    console.error("Error fetching registrations:", err);
    res.status(500).json({ error: "Server error" });
  }
});
 
app.post('/warranty', verifyToken, async (req, res) => {
  await initializeApp();
  const { email, serial_number, customer_remarks } = req.body;

  if (!email || !serial_number) {
    return res.status(400).json({ error: 'Email and serial number are required.' });
  }

  try {
    // Get user ID
    const users = await queryPromise('SELECT id FROM users WHERE email = $1', [email]);
    const user = users[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Get product ID registered by this user
    const products = await queryPromise(
      'SELECT id FROM product_registration WHERE user_id = $1 AND serial_number = $2',
      [user.id, serial_number]
    );
    const product = products[0];

    if (!product) {
      return res.status(404).json({ error: 'Product not found for this user.' });
    }

    // Check if a warranty claim already exists
    const existing = await queryPromise(
      'SELECT id FROM warranty_status WHERE product_id = $1 AND user_id = $2',
      [product.id, user.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Warranty already claimed for this product.' });
    }

    // Insert warranty claim
    const insertQuery = `
      INSERT INTO warranty_status (user_id, product_id, customer_remarks)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    const [inserted] = await queryPromise(insertQuery, [user.id, product.id, customer_remarks]);

    // Update product_registration to set registered_for_claim = 'yes'
    await queryPromise(
      'UPDATE product_registration SET registered_for_claim = $1 WHERE id = $2',
      ['yes', product.id]
    );

    res.status(201).json({ message: 'Warranty claim submitted successfully.', id: inserted.id });

  } catch (err) {
    console.error("Error inserting warranty record:", err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});


 
app.post('/warranty_status', verifyToken, verifyAdmin, async (req, res) => {
  await initializeApp();
  const { serial_number, claim_status } = req.body;

  if (!serial_number || !claim_status) {
    return res.status(400).json({ error: "Serial number and claim status are required." });
  }

  try {
    // Get product_id from serial_number
    const products = await queryPromise(
      'SELECT id FROM product_registration WHERE serial_number = $1',
      [serial_number]
    );
    const product = products[0];

    if (!product) {
      return res.status(404).json({ error: "Product not found." });
    }

    // Check if a warranty record exists for this product
    const warranties = await queryPromise(
      'SELECT * FROM warranty_status WHERE product_id = $1',
      [product.id]
    );
    if (warranties.length === 0) {
      return res.status(404).json({ error: "Warranty record not found for this serial number." });
    }

    // Update claim status
    await queryPromise(
      'UPDATE warranty_status SET claim_status = $1 WHERE product_id = $2',
      [claim_status, product.id]
    );

    res.json({ message: "Claim status updated successfully." });

  } catch (err) {
    console.error("Error updating claim status:", err);
    res.status(500).json({ error: err.message });
  }
});

 
app.get("/get_warranty/:serial_number", verifyToken, async (req, res) => {
  await initializeApp();
  try {
    const { serial_number } = req.params;

    const result = await queryPromise(
      `
      SELECT 
        ws.id AS warranty_id,
        ws.claim_status,
        ws.customer_remarks,
        ws.submitted_at,
        pr.serial_number,
        pr.product_name,
        pr.registered_for_claim,
        u.name AS user_name,
        u.email,
        u.mobile_number,
        u.country_code
      FROM warranty_status ws
      JOIN product_registration pr ON ws.product_id = pr.id
      JOIN users u ON ws.user_id = u.id
      WHERE pr.serial_number = $1
      `,
      [serial_number]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: "Warranty record not found." });
    }

    res.status(200).json(result[0]); // Return first match (serial_number should be unique)
  } catch (err) {
    console.error("Error fetching warranty record:", err);
    res.status(500).json({ error: err.message });
  }
});

 
app.get('/products', verifyToken, verifyAdmin, async (req, res) => {
  await initializeApp();
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
 
app.delete('/products/:serial_number', verifyToken, verifyAdmin, async (req, res) => {
  await initializeApp();
  const { serial_number } = req.params;
 
  if (!serial_number) {
    return res.status(400).json({ error: 'Serial number is required' });
  }
 
  try {
    const checkResult = await pool.query(
      'SELECT * FROM products WHERE serial_number = $1',
      [serial_number]
    );
 
    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const result = await pool.query(
      'DELETE FROM products WHERE serial_number = $1 RETURNING *',
      [serial_number]
    );
 
    res.status(200).json({
      message: 'Product deleted successfully',
      deleted_product: result.rows[0]
    });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ error: 'Server error while deleting product' });
  }
});
 
app.get('/download/invoice/:serial_number', async (req, res) => {
  await initializeApp();
  try {
    const { serial_number } = req.params;
 
    const rows = await queryPromise(
      'SELECT invoice_receipt, product_name FROM product_registration WHERE serial_number = $1',
      [serial_number]
    );
 
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
 
    const invoice = rows[0];
        const key = invoice.invoice_receipt;
    
        const command = new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: key
        });
    
        const data = await s3Client.send(command);
    
        // Set headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${invoice.invoice_receipt}.pdf"`
        );
    
        // Pipe the stream
        const stream = data.Body instanceof Readable ? data.Body : Readable.from(data.Body);
        stream.pipe(res).on('error', (err) => {
          console.error('Stream error:', err);
          res.status(500).json({ error: 'Failed to stream file' });
        });
  } catch (err) {
    console.error('Error downloading file:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/product_registration', upload.single('invoice_receipt'), async (req, res) => {
  await initializeApp();

  const {
    name, email, mobile_number,
    product_name, serial_number, country_code , part_number
  } = req.body;
  // console.log(req.body);
  const productNames = Array.isArray(product_name) ? product_name : [product_name];
  const serialNumbers = Array.isArray(serial_number) ? serial_number : [serial_number];
  const partNumbers = Array.isArray(part_number) ? part_number : [part_number];

  if (productNames.length !== serialNumbers.length) {
    return res.status(400).json({ error: "Mismatched product and serial number counts." });
  }

    if (productNames.length !== partNumbers.length) {
    return res.status(400).json({ error: "Mismatched product and part number counts." });
  }

  let s3Key = null;
  let generatedPassword = null;
  let userId;

  try {
    // Check if user exists
  

    // Validate products
    for (let i = 0; i < productNames.length; i++) {
      const productResult = await pool.query(
        'SELECT * FROM products WHERE product_name = $1 AND serial_number = $2',
        [productNames[i], serialNumbers[i]]
      );

      const product = productResult.rows[0];
      console.log(product)

      if (!product) {
        return res.status(400).json({
          error: `Product not found: "${productNames[i]}" - "${serialNumbers[i]}"`
        });
      }

       const productStatus = await pool.query(
        'SELECT * FROM product_registration WHERE product_name = $1 AND serial_number = $2',
        [productNames[i], serialNumbers[i]]
      );

       const product_status = productStatus.rows[0];
       console.log(product_status);

      if (product_status) {
        return res.status(400).json({
          error: `Warranty Registration is already done for "${productNames[i]}" - "${serialNumbers[i]}"`
        });
      }
    }

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    if (!userResult.rows.length) {
      generatedPassword = crypto.randomBytes(6).toString('hex');
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      await pool.query(
        'INSERT INTO users (name, email, mobile_number, password, role , country_code ) VALUES ($1, $2, $3, $4, $5 , $6)',
        [name, email, mobile_number, hashedPassword, "customer" , country_code]
      );

      const newUserResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      userId = newUserResult.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }

    // Upload file to S3 (if any)
    if (req.file) {
      const fileName = `invoices/${Date.now()}_${userId}_${serialNumbers[0]}`;
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: process.env.AWS_S3_BUCKET,
          Key: fileName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype
        }
      });
      await upload.done();
      s3Key = fileName;
    }

    // Insert registrations
    const insertPromises = productNames.map((pname, i) => {
      return pool.query(
        `INSERT INTO product_registration
         (user_id, product_name, serial_number, part_number, invoice_receipt)
         VALUES ($1, $2, $3, $4 , $5)`,
        [userId, pname, serialNumbers[i], partNumbers[i], s3Key]
      );
    });

    // // Update product registration status
    // const updatePromises = productNames.map((pname, i) => {
    //   return pool.query(
    //     'UPDATE products SET registered_status = $1 WHERE product_name = $2 AND serial_number = $3',
    //     ['YES', pname, serialNumbers[i]]
    //   );
    // });

    await Promise.all([...insertPromises]);

    res.json({
      message: "Product(s) registered successfully",
      inserted: productNames.length,
      receipt: s3Key,
      ...(generatedPassword && { temp_password: generatedPassword })
    });

  } catch (err) {
    console.error("Error during product registration:", err);
    res.status(500).json({ error: err.message });
  }
});

 

app.post('/update_temp_password', verifyToken, async (req, res) => {
  await initializeApp();
  const { email } = req.body;
 
  try {
    // Check if user exists
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const existingUser = userResult.rows[0];
 
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found.' });
    }
 
    // Generate and hash a temporary password
    const generatedPassword = crypto.randomBytes(6).toString('hex');
    const hashedPassword = await bcrypt.hash(generatedPassword, saltRounds);
 
    // Update user's password
    await pool.query(
      'UPDATE users SET password = $1 WHERE email = $2',
      [hashedPassword, email]
    );
 
    res.json({
      message: 'Temporary password updated successfully.',
      temp_password: generatedPassword
    });
 
  } catch (err) {
    console.error("Error updating temporary password:", err);
    res.status(500).json({ error: err.message });
  }
});
 
app.post('/customers', async (req, res) => {
  await initializeApp();
  try {
    const {
      customerName,
      customerLocation,
      category,
      participants,
      baseModelSize,
      isCustom,
      onHuggingFace,
      hfLink,
      architecture,
      workloads,
      infraType,
      motherboard,
      processor,
      dram,
      gpus,
      os
    } = req.body;
 
    // Validate participants
    if (!participants || typeof participants !== 'string') {
      return res.status(400).json({ error: 'Participants field is required and must be a string.' });
    }
 
    const firstEntry = participants.split(';')[0].trim();
    const parts = firstEntry.split(/\s*[-–]\s*/);
    const namePart = parts[0]?.trim();
    const emailPart = parts[1]?.trim();
 
    if (!emailPart || !emailPart.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/)) {
      return res.status(400).json({ error: 'Please use "Name – valid@email.com" in Participants.' });
    }
 
    // Convert booleans to 'Yes'/'No'
    const isCustomStr = isCustom ? 'Yes' : 'No';
    const onHuggingFaceStr = onHuggingFace ? 'Yes' : 'No';
 
    // Validate ENUM values
    const validCategories = ['MSME/Educational_Institutions', 'Datacentres'];
    const validModelSizes = ['>=3B', '7B', '13B', '34B', '70B', '180B', '450B', '700B'];
    const validWorkloads = ['Finetuning', 'Inference', 'Both'];
    const validInfraTypes = ['On-premise', 'Private Cloud', 'No Existing AI Infrastructure'];
 
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
    }
 
    if (!validModelSizes.includes(baseModelSize)) {
      return res.status(400).json({ error: `Invalid baseModelSize. Must be one of: ${validModelSizes.join(', ')}` });
    }
 
    if (!validWorkloads.includes(workloads)) {
      return res.status(400).json({ error: `Invalid workload. Must be one of: ${validWorkloads.join(', ')}` });
    }
 
    if (!validInfraTypes.includes(infraType)) {
      return res.status(400).json({ error: `Invalid infraType. Must be one of: ${validInfraTypes.join(', ')}` });
    }
 
    const sql = `
    INSERT INTO customers (
      customerName,
      customerLocation,
      category,
      participantName,
      participantEmail,
      baseModelSize,
      isCustom,
      onHuggingFace,
      hfLink,
      architecture,
      workloads,
      infraType,
      motherboard,
      processor,
      dram,
      gpus,
      os
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
    ) RETURNING id
    `;
   
    const params = [
      customerName,
      customerLocation,
      category,
      namePart,
      emailPart,
      baseModelSize,
      isCustomStr,
      onHuggingFaceStr,
      hfLink,
      architecture,
      workloads,
      infraType,
      motherboard,
      processor,
      dram,
      gpus,
      os
    ];
 
    const result = await queryPromise(sql, params);
    res.json({ message: "Customer inserted successfully", id: result[0]?.id || null });
 
  } catch (err) {
    console.error('❌ DB error:', err);
    res.status(500).json({ error: err.message });
  }
});
 
app.post('/products',  async (req, res) => {
  await initializeApp();
  
  const { 
    sales_order_number, 
    product_name, 
    part_number, 
    serial_number, 
    sold_to_party, 
    shipped_to_customer_name, 
    billing_date, 
    billing_date_number, 
    billing_type, 
    net_quantity, 
    net_value_in_local_currency, 
    unit_price, 
    net_tax, 
    total_amount, 
    purchase_order_number, 
    delivery_number, 
    material_details 
  } = req.body;

  if (!product_name || !serial_number || !sales_order_number) {
    return res.status(400).json({ error: 'Sales order number, product name, and serial number are required.' });
  }

  try {
    const insertQuery = `
      INSERT INTO products (
        sales_order_number, 
        product_name, 
        part_number, 
        serial_number, 
        sold_to_party, 
        shipped_to_customer_name, 
        billing_date, 
        billing_date_number, 
        billing_type, 
        net_quantity, 
        net_value_in_local_currency, 
        unit_price, 
        net_tax, 
        total_amount, 
        purchase_order_number, 
        delivery_number, 
        material_details
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
    `;
    await pool.query(insertQuery, [
      sales_order_number, 
      product_name, 
      part_number, 
      serial_number, 
      sold_to_party, 
      shipped_to_customer_name, 
      billing_date, 
      billing_date_number, 
      billing_type, 
      net_quantity, 
      net_value_in_local_currency, 
      unit_price, 
      net_tax, 
      total_amount, 
      purchase_order_number, 
      delivery_number, 
      material_details
    ]);

    res.json({ message: '✅ Product inserted successfully.' });
  } catch (err) {
    console.error('❌ Error inserting product:', err);
    res.status(500).json({ error: 'Server error while inserting product.' });
  }
});

 
// Health check route
app.get('/health', async (req, res) => {
  await initializeApp();
  res.send('OK');
});
 
PORT = 3002
app.listen(PORT, () => {
  initializeApp();
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
// Export the Express API as a Vercel serverless function
module.exports = app;