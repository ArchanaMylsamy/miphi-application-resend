import { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate } from 'react-router-dom';
import {
  Search, FileText, Download, Calendar, Package, Tag, User, Mail, Phone,
  Settings, LogOut, ChevronDown, Bell, Menu, X, ShieldCheck, Key, Info,
  AlertTriangle, ListChecks, PlusCircle, Edit3, Trash2, CheckSquare, Send // Added icons for admin
} from "lucide-react";
import { UserContext } from "../../context/UserContext";
import Swal from 'sweetalert2';

export default function ProductRegistrationsCRM() {
  const { user, setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin'; // Check for admin role

  // --- Common State ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(isAdmin ? "allRegistrations" : "registrations"); // Default page based on role
  const [isSubmitting, setIsSubmitting] = useState(false);
  const userEmail = user?.email;
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // --- User-Specific State ---
  const [registrations, setRegistrations] = useState([]);
  const [selectedRegistrationForClaim, setSelectedRegistrationForClaim] = useState(null);

  // --- Admin-Specific State ---
  const [allRegistrations, setAllRegistrations] = useState([]); // For admin view of all registrations
  const [warrantyReports, setWarrantyReports] = useState([]); // For admin warranty reports
  const [allProducts, setAllProducts] = useState([]); // For admin to manage products
  const [editingWarranty, setEditingWarranty] = useState(null); // For admin to edit a warranty report
  const [newProductForm, setNewProductForm] = useState({ name: '', category: '', description: '' });

  // Add window resize listener
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      if (window.innerWidth >= 640 && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
      if (window.innerWidth >= 1024 && !isSidebarOpen) {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobileMenuOpen, isSidebarOpen]);

  // Initial setup - set sidebar state based on screen size
  useEffect(() => {
    setIsSidebarOpen(window.innerWidth >= 1024);
  }, []);

  const fetchRegistrations = useCallback(async () => {
    // Ensure state setters like setRegistrations, setLoading, etc., are stable
    // or include them in the dependency array if they can change.
    // For this example, assuming they are passed in or stable from closure.

    if (!isAdmin && !userEmail) {
        setRegistrations([]);
        // setLoading(false); // Might be handled by a broader loading strategy
        // setError("User email not available for fetching registrations.");
        return;
    }
    // Only fetch if admin is on allRegistrations page or user is on their registrations page
    if (isAdmin && currentPage !== 'allRegistrations') return;
    if (!isAdmin && currentPage !== 'registrations') return;

    try {
        setLoading(true);
        const token = sessionStorage.getItem('token');
        if(!token) {
            setError("No token found. Please log in again.");
            return;
        }
        const url = isAdmin
            ? `https://miphi-application.vercel.app/registered_users/` // ADMIN: Endpoint for all registrations
            : `https://miphi-application.vercel.app/user_registrations/${userEmail}`; // USER: Endpoint for specific user's registrations

        const response = await fetch(url,{
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
          },
        });
        if (!response.ok) {
            throw new Error(
                `API error (registrations): ${response.status} ${response.statusText}`
            );
        }
        const data = await response.json();
        

        // This line is from your snippet.
        // Please double-check: if your admin endpoint https://miphi-application.vercel.app/registered_users/
        // returns {"registrations": [...]}, then for isAdmin true, it should be data.registrations
        const fetchedData = isAdmin ? data.registrations : data.registrations;
        
        const fetchedItems = fetchedData || [];

        if (fetchedItems.length > 0) {
            if (isAdmin) {
                // ADMIN PATH: No warranty check, use the fetched data directly.
                console.log("Fetched all registrations for admin:", fetchedItems);
                setAllRegistrations(fetchedItems);
            } else {
                // USER PATH: Perform warranty check for each registration.
                const itemsWithWarranty = await Promise.all(
                    fetchedItems.map(async (reg) => {
                        try {
                            if (!reg.serial_number) {
                                return { ...reg, warrantyStatus: "N/A (No S/N)", hasWarrantyRecord: null };
                            }
                            const token = sessionStorage.getItem('token');
                            if(!token) {
                              setError("No token found. Please log in again.");
                              return { ...reg, warrantyStatus: "N/A (No Token)", hasWarrantyRecord: null };
                            }
                            const warrantyResponse = await fetch(
                                `https://miphi-application.vercel.app/get_warranty/${reg.serial_number}`,
                                {
                                    method: 'GET',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`,
                                    }, 
                                }
                            );
                            if (warrantyResponse.ok) {
                                const warrantyData = await warrantyResponse.json();
                                // Added a check for warrantyData itself for robustness
                                if (warrantyData && warrantyData.length > 0) {
                                    const statusMessage = warrantyData[0]?.claim_status;
                                    return { ...reg, warrantyStatus: statusMessage, warrantyRecord: warrantyData[0], hasWarrantyRecord: true };
                                } else {
                                    return { ...reg, warrantyStatus: "Not Claimed", hasWarrantyRecord: false };
                                }
                            } else if (warrantyResponse.status === 404) {
                                return { ...reg, warrantyStatus: "Not Claimed", hasWarrantyRecord: false };
                            } else {
                                console.warn(`Error fetching warranty for S/N ${reg.serial_number}: ${warrantyResponse.status} ${warrantyResponse.statusText}`);
                                return { ...reg, warrantyStatus: "Status Unavailable", hasWarrantyRecord: null };
                            }
                        } catch (warrantyErr) {
                            console.error(`Exception fetching warranty for S/N ${reg.serial_number}:`, warrantyErr);
                            return { ...reg, warrantyStatus: "Error Fetching Status", hasWarrantyRecord: null };
                        }
                    })
                );
                setRegistrations(itemsWithWarranty);
            }
        } else {
            // No items fetched
            if (isAdmin) {
                setAllRegistrations([]);
            } else {
                setRegistrations([]);
            }
        }
        setError(null);
    } catch (err) {
        console.error("Error fetching registration data:", err);
        setError(err.message);
        if (isAdmin) {
            setAllRegistrations([]);
        } else {
            setRegistrations([]);
        }
    } finally {
        setLoading(false);
    }
}, [userEmail, isAdmin, currentPage /*, setRegistrations, setAllRegistrations, setLoading, setError (if not stable) */]);

  const fetchWarrantyReports = useCallback(async () => {
    if (!isAdmin || currentPage !== 'warrantyReports') return; // Only for admin on warrantyReports page
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      if(!token) {
        setError("No token found. Please log in again.");
        return;
      }
      const response = await fetch(`https://miphi-application.vercel.app/registered_warranty_claims/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        }
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      setWarrantyReports(data.registrations || []); // Adjust based on API response
      setError(null);
    } catch (err) {
      console.error("Error fetching warranty reports:", err);
      setError(err.message);
      setWarrantyReports([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, currentPage]);

  const fetchAllProducts = useCallback(async () => {
    if (!isAdmin || currentPage !== 'manageProducts') return; // Only for admin on manageProducts page
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      if(!token) {
        setError("No token found. Please log in again.");
        return;
      }
      const response = await fetch(`https://miphi-application.vercel.app/shipped_products/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        }
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      console.log("Fetched all products:", data.registrations);
      setAllProducts(data.registrations || []); // Adjust based on API response
      setError(null);
    } catch (err) {
      console.error("Error fetching products:", err);
      setError(err.message);
      setAllProducts([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, currentPage]);

  useEffect(() => {
    if (isAdmin) {
        if (currentPage === 'allRegistrations') fetchRegistrations();
        else if (currentPage === 'warrantyReports') fetchWarrantyReports();
        else if (currentPage === 'manageProducts') fetchAllProducts();
    } else { // Regular user
        if (userEmail && currentPage === 'registrations') {
            fetchRegistrations();
        } else if (!userEmail && currentPage === 'registrations') {
            setRegistrations([]);
            setLoading(false);
        }
    }
  }, [userEmail, isAdmin, currentPage, fetchRegistrations, fetchWarrantyReports, fetchAllProducts]);

  const handleLogout = (e) => {
    e.preventDefault();

    Swal.fire({
      title: 'Are you sure you want to logout?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Logout',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('token');
        navigate('/'); // redirect to home or login page
      }
    });
  };
  // --- Filter Registrations (adapts for admin/user) ---
  const itemsToFilter = isAdmin ? allRegistrations : registrations;
  const filteredItems = Array.isArray(itemsToFilter)
    ? itemsToFilter.filter(
        (reg) =>
          reg.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          reg.serial_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (isAdmin && reg.user_email?.toLowerCase().includes(searchTerm.toLowerCase())) // Admin can search by user email
      )
    : [];

  // --- Format Date Utility --- 
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("en-US", {
        year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      }).format(date);
    } catch (e) { return "Invalid Date"; }
  };

  // --- Download Invoice Action --- ( 그대로 사용 )
  const downloadInvoice = async (productName, serialNumber) => {
    try {
      console.log(`Downloading invoice for: ${productName} (S/N: ${serialNumber})`);
      const token = sessionStorage.getItem('token');
      if(!token) {
        setError("No token found. Please log in again.");
        return;
      }
      const apiUrl = `https://miphi-application.vercel.app/download/invoice/${serialNumber}`;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Failed to download invoice: ${response.status}` }));
        throw new Error(errorData.error);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${productName}-invoice.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading invoice:', error);
      Swal.fire('Error', `Error downloading invoice: ${error.message}`, 'error');
    }
  };
  
  // --- Handle Warranty Claim Click (for user) ---
  const handleClaimClick = (registration) => {
    setSelectedRegistrationForClaim(registration);
    setCurrentPage("warrantyClaim");
    setIsMobileMenuOpen(false);
  };

  // --- Handle Sidebar Navigation ---
  const handleSidebarNavClick = (page) => {
    setCurrentPage(page);
    if (page !== 'warrantyClaim' && !isAdmin) { // For user
      setSelectedRegistrationForClaim(null);
    }
    if (isAdmin && page !== 'warrantyReportsEdit') { // Example for admin if an edit sub-page exists
        setEditingWarranty(null);
    }
    // Reset search term when changing pages
    setSearchTerm("");
    if (windowWidth < 1024) {
      setIsMobileMenuOpen(false);
    }
  };

  // --- Toggle Sidebar --- ( 그대로 사용 )
  const toggleSidebar = () => {
    if (windowWidth < 640) { // On small screens, this toggles the mobile menu
      setIsMobileMenuOpen(!isMobileMenuOpen);
    } else { // On larger screens, this toggles the main sidebar
      setIsSidebarOpen(!isSidebarOpen);
    }
  };
  
  // --- User Info Card Component --- (can be used by user, or adapted for admin if needed)
  const UserInfoCard = ({ userInfoFromReg, userFromContext, userEmail }) => {
    const displayUser = userFromContext || {
      name: userInfoFromReg?.user_name,
      email: userEmail, // Ensure this is correctly sourced
      mobile_number: userInfoFromReg?.mobile_number // Corrected from mobile
    };
  
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-slate-200">
        <h2 className="text-2xl font-semibold mb-6 text-slate-800 flex items-center">
          <User className="mr-3 text-indigo-600" size={28} />
          Your Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="flex items-start p-4 bg-slate-50 rounded-lg">
            <User className="mr-3 text-indigo-500 mt-1 flex-shrink-0" size={20} />
            <div>
              <p className="text-sm text-slate-500 font-medium">Name</p>
              <p className="font-semibold text-slate-700 text-lg">
                {displayUser.name || 'N/A'}
              </p>
            </div>
          </div>
          <div className="flex items-start p-4 bg-slate-50 rounded-lg">
            <Mail className="mr-3 text-indigo-500 mt-1 flex-shrink-0" size={20} />
            <div>
              <p className="text-sm text-slate-500 font-medium">Email</p>
              <p className="font-semibold text-slate-700 text-lg">
                {displayUser.email || 'N/A'}
              </p>
            </div>
          </div>
          <div className="flex items-start p-4 bg-slate-50 rounded-lg">
            <Phone className="mr-3 text-indigo-500 mt-1 flex-shrink-0" size={20} />
            <div>
              <p className="text-sm text-slate-500 font-medium">Phone</p>
              <p className="font-semibold text-slate-700 text-lg">
                {displayUser.mobile_number || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- Sidebar Component (Modified for Admin) ---
  const Sidebar = () => {
    const commonItems = [ { icon: Settings, label: "Settings", page: "settings" }];
    const userItems = [
      { icon: FileText, label: "My Registrations", page: "registrations" },
      { icon: ShieldCheck, label: "Warranty Claim", page: "warrantyClaim" },
      ...commonItems
    ];
    const adminItems = [
      { icon: FileText, label: "All Registrations", page: "allRegistrations" },
      { icon: ListChecks, label: "Warranty Reports", page: "warrantyReports" },
      { icon: Package, label: "Manage Products", page: "manageProducts" },
      ...commonItems
    ];
    const navItems = isAdmin ? adminItems : userItems;

    // Determine sidebar classes based on state and windowWidth
    let sidebarVisibilityClasses = "";
    let sidebarWidthClasses = "";

    if (windowWidth < 1024) { // Mobile/Tablet view
      sidebarVisibilityClasses = isMobileMenuOpen ? "translate-x-0" : "-translate-x-full";
      sidebarWidthClasses = "w-64"; // Mobile menu is always full width when open
    } else { // Desktop view
      sidebarVisibilityClasses = "translate-x-0"; // Always visible on desktop
      sidebarWidthClasses = isSidebarOpen ? "w-64" : "w-20"; // Collapsible width
    }

    return (
    <div className="flex flex-col"> {/* Container for overlay and aside */}
      {/* Mobile Menu Overlay - shown when mobile menu is open */}
      {isMobileMenuOpen && windowWidth < 1024 && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)} // Close on overlay click
        ></div>
      )}
      <aside 
        className={`fixed top-0 left-0 z-40 h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white 
                   flex-shrink-0 flex flex-col shadow-2xl transition-all duration-300 ease-in-out
                   ${sidebarVisibilityClasses} ${sidebarWidthClasses}`}
      >
        <div className={`flex items-center justify-between p-6 border-b border-slate-700 
                       ${(!isSidebarOpen && windowWidth >= 1024) ? "justify-center p-4" : ""}
                       ${(windowWidth < 1024 && isMobileMenuOpen) ? "justify-between" : "" }`} // Ensure X is visible on mobile
        >
          <a href="#" className="flex items-center space-x-2" onClick={() => handleSidebarNavClick(isAdmin ? 'allRegistrations' : 'registrations')}>
            {/* Show full logo if sidebar is open OR if it's the mobile menu (which is always "open" in terms of content display) */}
            <Package size={(isSidebarOpen || windowWidth < 1024) ? 32 : 24} className="text-indigo-400" />
            {(isSidebarOpen || windowWidth < 1024) && <span className="text-2xl font-bold">ProductVault</span>}
          </a>
          {/* Mobile X button - only visible and needed when mobile menu is open */}
          {windowWidth < 1024 && isMobileMenuOpen && (
            <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
              <X size={24} />
            </button>
          )}
        </div>
        <nav className="flex-grow p-4 space-y-1">
          {navItems.map((item) => (
            <a
              key={item.page}
              href="#"
              onClick={(e) => { e.preventDefault(); handleSidebarNavClick(item.page); }}
              className={`flex items-center 
                         ${(isSidebarOpen || windowWidth < 1024) ? "space-x-3 px-4" : "justify-center"} 
                         py-3 rounded-lg hover:bg-slate-700 transition-colors duration-150 
                         ${currentPage === item.page ? "bg-indigo-600 text-white shadow-md" : "text-slate-300 hover:text-white"}`}
              title={item.label}
            >
              <item.icon size={20} className="flex-shrink-0"/>
              {(isSidebarOpen || windowWidth < 1024) && <span>{item.label}</span>}
            </a>
          ))}
        </nav>
        <div
      className={`p-6 border-t border-slate-700 
                 ${(!isSidebarOpen && windowWidth >= 1024) ? "flex justify-center p-4" : ""}`}
    >
      <a
        href="#"
        className={`flex items-center 
                   ${(isSidebarOpen || windowWidth < 1024) ? "space-x-3 px-4" : "justify-center"} 
                   py-3 rounded-lg text-slate-300 hover:bg-slate-700 hover:text-white transition-colors duration-150`}
        onClick={handleLogout}
        title="Logout"
      >
        <LogOut size={20} className="flex-shrink-0" />
        {(isSidebarOpen || windowWidth < 1024) && <span>Logout</span>}
      </a>
    </div>
      </aside>
    </div>
    )
  };

  // --- TopBar Component (Modified for Admin) ---
  const TopBar = () => {
    let title = "Dashboard";
    if (isAdmin) {
        switch(currentPage) {
            case 'allRegistrations': title = 'All Product Registrations'; break;
            case 'warrantyReports': title = 'Warranty Reports Management'; break;
            case 'manageProducts': title = 'Manage Products'; break;
            case 'settings': title = 'Admin Settings'; break;
            default: title = 'Admin Dashboard';
        }
    } else {
        switch(currentPage) {
            case 'registrations': title = 'My Product Registrations'; break;
            case 'warrantyClaim': title = 'Warranty Claim'; break;
            case 'settings': title = 'User Settings'; break;
            default: title = 'User Dashboard';
        }
    }

    return (
    <header className="bg-white shadow-md sticky top-0 z-20 transition-all duration-300"> {/* Lowered z-index for TopBar */}
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <button
              onClick={toggleSidebar}
              className="text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 mr-3"
            >
              <span className="sr-only">Toggle sidebar</span>
              <Menu size={24} />
            </button>
          </div>
          <div className="flex-1 flex justify-center items-center">
            <h1 className="text-xl font-semibold text-slate-800 px-2 truncate">
              {title}
            </h1>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="relative">
              <button className="flex items-center space-x-2 p-1 rounded-full">
                {/* <span className="hidden sm:inline text-sm font-medium text-slate-700">{user?.name || userEmail?.split('@')[0] || 'User'}</span> */}
                <img
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-full object-cover border-2 border-indigo-200"
                  src={
                    user?.avatar ||
                    `https://ui-avatars.com/api/?name=${
                      encodeURIComponent(user?.name || userEmail?.split('@')[0] || (isAdmin ? 'Admin' : 'User'))
                    }&background=6b7280&color=fff`
                  }
                  alt="User avatar"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
    )
  };

  // --- Footer Component --- ( 그대로 사용 )
  const Footer = () => (
    <footer className="py-6 text-center text-sm text-slate-500 bg-slate-50 border-t border-slate-200">
      <p>&copy; {new Date().getFullYear()} MiPhi SemiConductors Private Limited. All rights reserved.</p>
    </footer>
  );

  // --- Warranty Claim Form Component (for User) --- ( 그대로 사용 )
  const WarrantyClaimForm = ({ prefillData }) => {
    const [formData, setFormData] = useState({
      product_name: '', serial_number: '', message: '',
    });
  
    useEffect(() => {
      if (prefillData) {
        setFormData({
          product_name: prefillData.product_name || '',
          serial_number: prefillData.serial_number || '',
          message: '',
        });
      } else {
        setFormData({ product_name: '', serial_number: '',  message: '' });
      }
    }, [prefillData]);
  
    const handleChange = (e) => {
      const { name, value } = e.target;
      setFormData(prev => ({ ...prev, [name]: value }));
    };
   const handleLogout = (e) => {
    e.preventDefault();

    Swal.fire({
      title: 'Are you sure you want to logout?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Logout',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('token');
        navigate('/'); // redirect to home or login page
      }
    });
  };
    const handleSubmit = async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      Swal.fire({
        title: 'Submitting...', text: 'Please wait while we submit your warranty claim.',
        allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }
      });
  
      try {
        const currentEmail = user?.email || '';
        const claimData = {
          email: currentEmail,
          serial_number: formData.serial_number,
          customer_remarks: formData.message
        };
        const token = sessionStorage.getItem('token');
        if(!token) {
          setError("No token found. Please log in again.");
          return;
        }
        const response = await fetch('https://miphi-application.vercel.app/warranty', {
          method: 'POST', 
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(claimData),
        });
        const result = await response.json();
    
        if (!response.ok) {
          throw new Error(result.error || 'Failed to submit warranty claim');
        }
        Swal.fire({
          icon: 'success', title: 'Claim Submitted!', text: 'Your warranty claim was submitted successfully.',
          timer: 2000, showConfirmButton: false
        });
        fetchRegistrations(); // Re-fetch to update warranty status on the user's registration list
        setTimeout(() => {
          setFormData({ product_name: '', serial_number: '', message: '' });
          setSelectedRegistrationForClaim(null);
          setCurrentPage('registrations');
        }, 2000);
    
      } catch (error) {
        console.error("Error submitting warranty claim:", error);
        Swal.fire({ icon: 'error', title: 'Submission Failed', text: `Error: ${error.message}` });
      } finally {
        setIsSubmitting(false);
      }
    };
    
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-slate-200 max-w-3xl mx-auto">
        <h2 className="text-2xl font-semibold mb-6 text-slate-800 flex items-center">
          <ShieldCheck className="mr-3 text-indigo-600" size={28} />
          Submit Warranty Claim
        </h2>
        {prefillData && (
          <div className="bg-indigo-50 border-l-4 border-indigo-500 text-indigo-700 p-4 mb-6 rounded-md" role="alert">
            <div className="flex items-center">
              <Info className="mr-2" size={20} />
              <p className="font-semibold text-sm">Details pre-filled for "{prefillData.product_name}".</p>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="product_name_claim" className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
            <input type="text" name="product_name" id="product_name_claim" value={formData.product_name} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-slate-50 cursor-not-allowed" readOnly />
          </div>
          <div>
            <label htmlFor="serial_number_claim" className="block text-sm font-medium text-slate-700 mb-1">Serial Number</label>
            <input type="text" name="serial_number" id="serial_number_claim" value={formData.serial_number} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-slate-50 cursor-not-allowed" readOnly />
          </div>
          <div>
            <label htmlFor="message_claim" className="block text-sm font-medium text-slate-700 mb-1">Reason for Claim / Message</label>
            <textarea name="message" id="message_claim" rows="4" value={formData.message} onChange={handleChange} required placeholder="Describe the issue with the product..." className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"></textarea>
          </div>
          <div>
            <button type="submit" disabled={isSubmitting} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60">
              {isSubmitting ? 'Submitting...' : 'Submit Claim'}
            </button>
          </div>
        </form>
      </div>
    );
  };

  // --- Settings Section Component --- ( 그대로 사용, can be enhanced for admin later )
  const SettingsSection = () => {
    const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
    const [message, setMessage] = useState({ type: '', text: '' });
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  
    const handleChange = (e) => {
      const { name, value } = e.target;
      setPasswordForm(prev => ({ ...prev, [name]: value }));
      setMessage({ type: '', text: '' });
    };
  
    const handlePasswordChange = async (e) => {
      e.preventDefault();
      setMessage({ type: '', text: '' });
      if (!user || !user.email) {
        setMessage({ type: 'error', text: 'User email not found. Please log in again.' });
        return;
      }
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setMessage({ type: 'error', text: 'New passwords do not match.' }); return;
      }
      if (passwordForm.newPassword.length < 8) {
        setMessage({ type: 'error', text: 'New password must be at least 8 characters long.' }); return;
      }
      setIsUpdatingPassword(true);
      try {
        const token = sessionStorage.getItem('token');
        if(!token) {
          setError("No token found. Please log in again.");
          return;
        }
        const response = await fetch('https://miphi-application.vercel.app/update_password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ email: user.email, new_password: passwordForm.newPassword }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Server error: ${response.status}`);
        
        Swal.fire({ icon: 'success', title: 'Success!', text: result.message || 'Password updated successfully!', timer: 2000, showConfirmButton: false });
        setPasswordForm({ newPassword: '', confirmPassword: '' });
        // setMessage({ type: 'success', text: result.message || 'Password updated successfully!' }); // Swal handles this
      } catch (error) {
        console.error("Error updating password:", error);
        // setMessage({ type: 'error', text: error.message || 'Failed to update password.' }); // Swal handles this
        Swal.fire({ icon: 'error', title: 'Error!', text: error.message || 'Failed to update password.' });
      } finally {
        setIsUpdatingPassword(false);
      }
    };
  
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-slate-200 max-w-2xl mx-auto">
        <h2 className="text-2xl font-semibold mb-6 text-slate-800 flex items-center">
          <Settings className="mr-3 text-indigo-600" size={28} /> Account Settings
        </h2>
        <div className="mb-8 pb-6 border-b border-slate-200">
          <h3 className="text-xl font-semibold text-slate-700 mb-4 flex items-center"><Key className="mr-2 text-slate-500" size={20}/> Change Password</h3>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label htmlFor="newPasswordSet"className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
              <input type="password" name="newPassword" id="newPasswordSet" value={passwordForm.newPassword} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="confirmPasswordSet"className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
              <input type="password" name="confirmPassword" id="confirmPasswordSet" value={passwordForm.confirmPassword} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>
            {message.text && !isUpdatingPassword && ( // Show local message only if not using Swal or if error before Swal
              <div className={`p-3 rounded-md text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border-green-400' : 'bg-red-50 text-red-700 border-red-400'} border`} role="alert">
                {message.text}
              </div>
            )}
            <div>
              <button type="submit" disabled={isUpdatingPassword}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isUpdatingPassword ? (
                  <><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Updating...</>
                ) : ( 'Change Password' )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // --- ADMIN: All Registrations View Component (Placeholder) ---
  const AllRegistrationsView = () => {
    const [searchTerm, setSearchTerm] = useState('');
    
    // Filter items based only on serial number
    const filteredItems = searchTerm
      ? allRegistrations.filter(reg => 
          (reg.serial_number || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
      : allRegistrations;
  
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-slate-200">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between">
          <div className="relative flex items-center w-full sm:w-auto mb-4 sm:mb-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={18}/>
              <input
                type="text"
                placeholder="Search by serial number..."
                className="w-full md:w-96 pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
          </div>
          <p className="text-slate-600 text-sm whitespace-nowrap">
              Showing <span className="font-semibold text-indigo-600">{filteredItems.length}</span> of <span className="font-semibold text-indigo-600">{allRegistrations.length}</span> total registrations
          </p>
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 pb-6 border-b border-slate-200">
          <div>
              <h2 className="text-2xl font-semibold text-slate-800">All User Registrations</h2>
              <p className="text-sm text-slate-500 mt-1">View and manage all product registrations across users.</p>
          </div>
        </div>
  
        {allRegistrations.length === 0 && !searchTerm ? (
          <div className="text-center py-12">
              <Package className="mx-auto mb-6 text-slate-400" size={64} />
              <h2 className="text-2xl font-semibold text-slate-700 mb-2">No Registrations Found</h2>
              <p className="text-slate-500 max-w-md mx-auto">There are currently no product registrations in the system.</p>
          </div>
        ) : filteredItems.length === 0 && searchTerm ? (
          <div className="text-center py-12">
              <Search className="mx-auto mb-6 text-slate-400" size={64} />
              <h2 className="text-2xl font-semibold text-slate-700 mb-2">No Matching Serial Number</h2>
              <p className="text-slate-500 mb-6 max-w-md mx-auto">Your search for serial number "{searchTerm}" did not match any registrations.</p>
              <button
                  className="px-6 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium transition-colors focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                  onClick={() => setSearchTerm("")}
              > Clear Search </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User Name</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User Email</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Mobile</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Details</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Serial Number</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Registered On</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Invoice PDF</th>
  
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredItems.map((reg, index) => (
                  <tr key={index} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">{reg.name || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">{reg.email || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">{reg.mobile_number || 'N/A'}</td>
  
                      <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-slate-700">
                              
                                  <Package className="flex-shrink-0 mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors" size={24} />
                                  {reg.product_name || "General"}
                          </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-slate-700">
                              <Tag className="flex-shrink-0 mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors" size={18} />
                              {reg.serial_number || "N/A"}
                          </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-slate-700">
                              <Calendar className="flex-shrink-0 mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors" size={18} />
                              {formatDate(reg.registered_at)}
                          </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap ">
                          <div className="flex items-center ">
                              <button onClick={() => downloadInvoice(reg.product_name, reg.serial_number)} disabled={!reg.invoice_receipt} className="inline-flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs" title={!reg.invoice_receipt ? "Invoice not available" : "Download Invoice"}>
                                  <Download className="mr-1.5" size={14} /> Invoice
                              </button>
                          </div>
                      </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };
// --- ADMIN: Warranty Reports View Component (Placeholder) ---
const WarrantyReportsView = () => {
  const [selectedReportIds, setSelectedReportIds] = useState([]);
  const [groupUpdateStatus, setGroupUpdateStatus] = useState('');
  const [reportSearchTerm, setReportSearchTerm] = useState('');

  // Single warranty update function
const handleUpdateStatus = async (serialNumber, newStatus) => {
setIsSubmitting(true);
Swal.fire({ title: 'Updating Status...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
try {
    const token = sessionStorage.getItem('token');
    if(!token) {
        setError("No token found. Please log in again.");
        return;     
    }
    // Updated to match your backend API
    const response = await fetch(`https://miphi-application.vercel.app/warranty_status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
            serial_number: serialNumber, 
            claim_status: newStatus 
        }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to update status.`);
    }
    Swal.fire('Success', 'Warranty status updated successfully!', 'success');
    fetchWarrantyReports(); // Refresh the list
} catch (error) {
    console.error("Error updating warranty status:", error);
    Swal.fire('Error', `Failed to update status: ${error.message}`, 'error');
} finally {
    setIsSubmitting(false);
}
};

// Group update function
const handleGroupUpdate = async () => {
if (selectedReportIds.length === 0 || !groupUpdateStatus) {
    Swal.fire('Warning', 'Please select reports and a status for group update.', 'warning');
    return;
}
setIsSubmitting(true);
Swal.fire({ title: 'Updating Selected Reports...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
try {
    const token = sessionStorage.getItem('token');
    if(!token) {
        setError("No token found. Please log in again.");
        return;
    }
    // Process each selected report individually since your backend doesn't support batch updates
    const updatePromises = selectedReportIds.map(serialNumber => 
        fetch(`https://miphi-application.vercel.app/warranty_status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ 
                serial_number: serialNumber, 
                claim_status: groupUpdateStatus 
            }),
        })
    );
    
    const results = await Promise.allSettled(updatePromises);
    const failures = results.filter(r => r.status === 'rejected').length;
    
    if (failures > 0) {
        Swal.fire('Partial Success', `Updated ${results.length - failures} out of ${results.length} reports. ${failures} updates failed.`, 'warning');
    } else {
        Swal.fire('Success', 'Selected warranty statuses updated!', 'success');
    }
    
    fetchWarrantyReports(); // Refresh
    setSelectedReportIds([]);
    setGroupUpdateStatus('');
} catch (error) {
    console.error("Error in group update:", error);
    Swal.fire('Error', `Group update failed: ${error.message}`, 'error');
} finally {
    setIsSubmitting(false);
}
};
  const toggleSelectReport = (serialNumber) => {
      setSelectedReportIds(prev => 
          prev.includes(serialNumber) ? prev.filter(sn => sn !== serialNumber) : [...prev, serialNumber]
      );
  };
  
  // Updated to filter only by serial number
  const filteredReports = reportSearchTerm 
      ? warrantyReports.filter(report => 
          report.serial_number.toLowerCase().includes(reportSearchTerm.toLowerCase())
        )
      : warrantyReports;

  const warrantyStatusOptions = ["Pending", "Approved", "Rejected"];


  return (
      <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-slate-200">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between">
          <div className="relative flex items-center w-full sm:w-auto mb-4 sm:mb-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18}/>
                    <input 
                        type="text" 
                        placeholder="Search by serial number..."
                        value={reportSearchTerm}
                        onChange={(e) => setReportSearchTerm(e.target.value)}
                        className="w-full md:w-96 pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
          </div>
          <p className="text-slate-600 text-sm whitespace-nowrap">
              Showing <span className="font-semibold text-indigo-600">{filteredReports.length}</span> of <span className="font-semibold text-indigo-600">{warrantyReports.length}</span> total registrations
          </p>
        </div>
          <h2 className="text-2xl font-semibold mb-2 text-slate-800">Warranty Claim Reports</h2>
          <p className="text-sm text-slate-500 mb-6">Review and update the status of all warranty claims.</p>

          <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              
              {selectedReportIds.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <select 
                          value={groupUpdateStatus} 
                          onChange={(e) => setGroupUpdateStatus(e.target.value)}
                          className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm h-full"
                      >
                          <option value="">Set Status for Selected ({selectedReportIds.length})</option>
                          {warrantyStatusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                      </select>
                      <button 
                          onClick={handleGroupUpdate}
                          disabled={isSubmitting || !groupUpdateStatus}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center text-sm h-full disabled:opacity-50"
                      >
                         <CheckSquare size={16} className="mr-2"/> Apply to Selected
                      </button>
                  </div>
              )}
          </div>


          {filteredReports.length === 0 ? (
               <div className="text-center py-12">
                  <ListChecks className="mx-auto mb-6 text-slate-400" size={64} />
                  <h2 className="text-2xl font-semibold text-slate-700 mb-2">
                      {reportSearchTerm ? 'No Matching Reports' : 'No Warranty Reports Found'}
                  </h2>
                  <p className="text-slate-500 max-w-md mx-auto">
                      {reportSearchTerm ? `Your search for "${reportSearchTerm}" did not find any reports.` : 'There are currently no warranty claims to display.'}
                  </p>
                  {reportSearchTerm && <button onClick={() => setReportSearchTerm('')} className="mt-4 px-4 py-2 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">Clear Search</button>}
              </div>
          ) : (
          <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                      <tr>
                          <th scope="col" className="px-2 py-4 text-center">
                              <input type="checkbox" className="form-checkbox h-4 w-4 text-indigo-600 border-slate-300 rounded" 
                               onChange={(e) => {
                                  if (e.target.checked) {
                                      setSelectedReportIds(filteredReports.map(r => r.serial_number));
                                  } else {
                                      setSelectedReportIds([]);
                                  }
                               }}
                               checked={selectedReportIds.length > 0 && selectedReportIds.length === filteredReports.length}
                               title="Select all visible"
                              />
                          </th>
                          <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Serial Number</th>
                          <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User Email</th>
            
                          <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Status</th>
                          <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[200px]">Update Status</th>
                          <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Remarks</th>
                      </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                      {filteredReports.map((report) => (
                          <tr key={report.serial_number} className={`${selectedReportIds.includes(report.serial_number) ? 'bg-indigo-50' : 'hover:bg-slate-50'} transition-colors`}>
                              <td className="px-2 py-4 text-center">
                                  <input type="checkbox" className="form-checkbox h-4 w-4 text-indigo-600 border-slate-300 rounded"
                                      checked={selectedReportIds.includes(report.serial_number)}
                                      onChange={() => toggleSelectReport(report.serial_number)}
                                  />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-medium text-slate-900">{report.serial_number}</div>
                                  <div className="text-xs text-slate-500">{report.product_name}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{report.email}</td>

                              <td className="px-6 py-4 whitespace-nowrap">
                                 <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                  ${report.claim_status?.toLowerCase().includes('approved') ? 'bg-green-100 text-green-800' : 
                                   report.claim_status?.toLowerCase().includes('rejected') ? 'bg-red-100 text-red-800' :
                                   report.claim_status?.toLowerCase().includes('pending') ? 'bg-yellow-100 text-yellow-800' :
                                   'bg-slate-100 text-slate-800'}`}>
                                  {report.claim_status || 'N/A'}
                                 </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                  <div className="flex items-center gap-2">
                                      <select 
                                          defaultValue={report.claim_status}
                                          onChange={(e) => handleUpdateStatus(report.serial_number, e.target.value)}
                                          disabled={isSubmitting}
                                          className="block w-full pl-3 pr-8 py-2 text-sm border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                      >
                                          {warrantyStatusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                                      </select>
                                      {/* A save button might be better if changes are not instant */}
                                  </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate" title={report.customer_remarks}>
                                  {report.customer_remarks || 'No remarks'}
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
          )}
      </div>
  );
};
// --- ADMIN: Manage Products View Component (Placeholder) ---
const ManageProductsView = () => {
  const [productForm, setProductForm] = useState({ product_name: '', serial_number : '' });
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleProductFormChange = (e) => {
      const { name, value } = e.target;
      setProductForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAddProduct = async (e) => {
      e.preventDefault();
      setIsAddingProduct(true);
      Swal.fire({ title: 'Adding Product...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
          const token = sessionStorage.getItem('token');
          if(!token) {
              setError("No token found. Please log in again.");
              return;       
          }
          // ADMIN: API call to add a new product
          const response = await fetch(`https://miphi-application.vercel.app/products`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify(productForm),
          });
          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || `Failed to add product.`);
          }
          Swal.fire('Success', 'Product added successfully!', 'success');
          fetchAllProducts(); // Refresh the list
          setProductForm({ product_name: '', serial_number: '' }); // Reset form
      } catch (error) {
          console.error("Error adding product:", error);
          Swal.fire('Error', `Failed to add product: ${error.message}`, 'error');
      } finally {
          setIsAddingProduct(false);
      }
  };

  const handleDeleteProduct = async (serialNumber) => {
      Swal.fire({
          title: 'Are you sure?', 
          text: "You won't be able to revert this!", 
          icon: 'warning',
          showCancelButton: true, 
          confirmButtonColor: '#d33', 
          cancelButtonColor: '#3085d6', 
          confirmButtonText: 'Yes, delete it!'
      }).then(async (result) => {
          if (result.isConfirmed) {
              setIsSubmitting(true);
              try {
                  const token = sessionStorage.getItem('token');
                  if(!token) {
                      setError("No token found. Please log in again.");
                      return; 
                  }
                  // Updated to use serial number for deletion
                  const response = await fetch(`https://miphi-application.vercel.app/products/${serialNumber}`, {
                      method: 'DELETE',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                      }
                  });
                  if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.error || `Failed to delete product.`);
                  }
                  Swal.fire('Deleted!', 'Product has been deleted.', 'success');
                  fetchAllProducts(); // Refresh list
              } catch (error) {
                  console.error("Error deleting product:", error);
                  Swal.fire('Error', `Failed to delete product: ${error.message}`, 'error');
              } finally {
                  setIsSubmitting(false);
              }
          }
      });
  };

  // New function for group deletion
  const handleGroupDelete = async () => {
      if (selectedProductIds.length === 0) {
          Swal.fire('Warning', 'Please select products to delete.', 'warning');
          return;
      }

      Swal.fire({
          title: 'Delete Multiple Products?',
          text: `You are about to delete ${selectedProductIds.length} products. This cannot be undone!`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          cancelButtonColor: '#3085d6',
          confirmButtonText: 'Yes, delete them!'
      }).then(async (result) => {
          if (result.isConfirmed) {
              setIsSubmitting(true);
              Swal.fire({ 
                  title: 'Deleting Products...', 
                  allowOutsideClick: false, 
                  didOpen: () => Swal.showLoading() 
              });

              try {
                  const token = sessionStorage.getItem('token');
                  if(!token) {
                      setError("No token found. Please log in again.");
                      return;
                  }
                  // Process each selected product individually
                  const deletePromises = selectedProductIds.map(serialNumber => 
                      fetch(`https://miphi-application.vercel.app/products/${serialNumber}`, {
                          method: 'DELETE',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                          }
                      })
                  );
                  
                  const results = await Promise.allSettled(deletePromises);
                  const failures = results.filter(r => r.status === 'rejected').length;
                  
                  if (failures > 0) {
                      Swal.fire(
                          'Partial Success', 
                          `Deleted ${results.length - failures} out of ${results.length} products. ${failures} deletions failed.`, 
                          'warning'
                      );
                  } else {
                      Swal.fire('Success', 'All selected products were deleted!', 'success');
                  }
                  
                  fetchAllProducts(); // Refresh the list
                  setSelectedProductIds([]); // Clear selection
              } catch (error) {
                  console.error("Error in group deletion:", error);
                  Swal.fire('Error', `Group deletion failed: ${error.message}`, 'error');
              } finally {
                  setIsSubmitting(false);
              }
          }
      });
  };

  // Toggle product selection for group actions
  const toggleSelectProduct = (serialNumber) => {
      setSelectedProductIds(prev => 
          prev.includes(serialNumber) ? prev.filter(sn => sn !== serialNumber) : [...prev, serialNumber]
      );
  };

  // Filter products by serial number
  const filteredSystemProducts = productSearchTerm 
      ? allProducts.filter(product => 
          product.serial_number.toLowerCase().includes(productSearchTerm.toLowerCase())
        )
      : allProducts;

  console.log(allProducts);
  
  return (
      <div className="space-y-8">
          {/* Add New Product Form */}
          <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-slate-200">
              <h2 className="text-2xl font-semibold mb-1 text-slate-800 flex items-center">
                  <PlusCircle className="mr-3 text-indigo-600" size={28}/> Add New Product
              </h2>
              <p className="text-sm text-slate-500 mb-6">Define new products that can be registered by users.</p>
              <form onSubmit={handleAddProduct} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                          <label htmlFor="product_name_manage" className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
                          <input type="text" name="product_name" id="product_name_manage" value={productForm.product_name} onChange={handleProductFormChange} required className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
                      </div>
                      <div>
                          <label htmlFor="serial_number_manage" className="block text-sm font-medium text-slate-700 mb-1">Serial Number</label>
                          <input type="text" name="serial_number" id="serial_number_manage" value={productForm.serial_number} onChange={handleProductFormChange} placeholder="e.g.,SN123" className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
                      </div>
                  </div>
                  
                  <div>
                      <button type="submit" disabled={isAddingProduct} className="w-full sm:w-auto flex justify-center items-center py-2.5 px-6 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60">
                          {isAddingProduct ? 'Adding...' : 'Add Product'}
                      </button>
                  </div>
              </form>
          </div>

          {/* View All Products Table */}
          <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-slate-200">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between">
                        <div className="relative flex items-center w-full sm:w-auto mb-4 sm:mb-0">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18}/>
                        <input 
                            type="text"
                            placeholder="Search by serial number..."
                            value={productSearchTerm}
                            onChange={(e) => setProductSearchTerm(e.target.value)}
                            className="w-full md:w-96 pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        </div>
                        <p className="text-slate-600 text-sm whitespace-nowrap">
                            Showing <span className="font-semibold text-indigo-600">{filteredSystemProducts.length}</span> of <span className="font-semibold text-indigo-600">{allProducts.length}</span> registrations
                        </p>
                    </div>
               <h2 className="text-2xl font-semibold mb-1 text-slate-800 flex items-center">
                  <Package className="mr-3 text-indigo-600" size={28}/> Existing Products
              </h2>
              <p className="text-sm text-slate-500 mb-6">View and manage all products available in the system.</p>
               
              <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="relative flex items-center w-full md:w-auto">
                      
                  </div>
                  
                  {/* Show group delete button when items are selected */}
                  {selectedProductIds.length > 0 && (
                      <button 
                          onClick={handleGroupDelete}
                          disabled={isSubmitting}
                          className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center text-sm disabled:opacity-50"
                      >
                          <Trash2 size={16} className="mr-2"/> Delete Selected ({selectedProductIds.length})
                      </button>
                  )}
              </div>

              
              
              {filteredSystemProducts.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                      {productSearchTerm ? `No products found for "${productSearchTerm}".` : "No products added to the system yet."}
                  </div>
              ) : (
              <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                          <tr>
                              <th scope="col" className="px-2 py-3 text-center">
                                  <input 
                                      type="checkbox" 
                                      className="form-checkbox h-4 w-4 text-indigo-600 border-slate-300 rounded"
                                      onChange={(e) => {
                                          if (e.target.checked) {
                                              setSelectedProductIds(filteredSystemProducts.map(p => p.serial_number));
                                          } else {
                                              setSelectedProductIds([]);
                                          }
                                      }}
                                      checked={selectedProductIds.length > 0 && selectedProductIds.length === filteredSystemProducts.length}
                                      title="Select all visible"
                                  />
                              </th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Serial Number</th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Registered Status</th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                          {filteredSystemProducts.map((product) => (
                              <tr key={product.id || product.product_name} className={`${selectedProductIds.includes(product.serial_number) ? 'bg-indigo-50' : 'hover:bg-slate-50'} transition-colors`}>
                                  <td className="px-2 py-4 text-center">
                                      <input 
                                          type="checkbox" 
                                          className="form-checkbox h-4 w-4 text-indigo-600 border-slate-300 rounded"
                                          checked={selectedProductIds.includes(product.serial_number)}
                                          onChange={() => toggleSelectProduct(product.serial_number)}
                                      />
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{product.product_name}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{product.serial_number}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{product.registered_status}</td>
                                 
                                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm space-x-2">
                                      <button 
                                          onClick={() => handleDeleteProduct(product.serial_number)} 
                                          title="Delete Product" 
                                          className="text-red-600 hover:text-red-800 p-1 disabled:opacity-50" 
                                          disabled={isSubmitting}
                                      > 
                                          <Trash2 size={18}/> 
                                      </button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
              )}
          </div>
      </div>
  );
};

  // --- Main Component Render ---
  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar />
      <div 
        className={`flex-grow flex flex-col transition-all duration-300
                  ${(isSidebarOpen && windowWidth >= 1024) ? "lg:pl-64" : (windowWidth >= 1024 ? "lg:pl-20" : "pl-0")}`}
      >
        <TopBar />
        <main className="flex-grow p-4 sm:p-6 lg:p-8">
          {loading && (
            <div className="flex justify-center items-center h-[calc(100vh-10rem)]">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600"></div>
              <p className="ml-4 text-xl text-slate-600 font-semibold">Loading Data...</p>
            </div>
          )}

          {error && (
            <div className="max-w-4xl mx-auto">
              <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 shadow-md">
                <h3 className="text-xl font-semibold text-red-700 mb-2">Oops! Something went wrong.</h3>
                <p className="text-red-600 mb-4">We encountered an error: {error}</p>
                <button
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium transition-colors focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  onClick={() => window.location.reload()}
                > Try Again </button>
              </div>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* ---- USER-SPECIFIC VIEWS ---- */}
              {!isAdmin && currentPage === "registrations" && (
                <>
                  {registrations.length > 0 && <UserInfoCard userInfoFromReg={registrations[0]} userFromContext={user} userEmail={userEmail} />}
                  <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-slate-200">
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between">
                        <div className="relative flex items-center w-full sm:w-auto mb-4 sm:mb-0">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={18}/>
                            <input
                                type="text" placeholder="Search by serial number..."
                                className="w-full md:w-80 pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow text-sm"
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <p className="text-slate-600 text-sm whitespace-nowrap">
                            Showing <span className="font-semibold text-indigo-600">{filteredItems.length}</span> of <span className="font-semibold text-indigo-600">{registrations.length}</span> registrations
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 pb-6 border-b border-slate-200">
                        <div>
                            <h2 className="text-2xl font-semibold text-slate-800">My Registered Products</h2>
                            <p className="text-sm text-slate-500 mt-1">Manage your product registrations and their warranty status.</p>
                        </div>
                    </div>
                    {registrations.length === 0 ? (
                        <div className="text-center py-12">
                            <Package className="mx-auto mb-6 text-slate-400" size={64} />
                            <h2 className="text-2xl font-semibold text-slate-700 mb-2">No Registrations Yet</h2>
                            <p className="text-slate-500 max-w-md mx-auto">No product registrations found for <span className="font-medium">{userEmail}</span>.</p>
                        </div>
                    ) : filteredItems.length === 0 && searchTerm ? (
                         <div className="text-center py-12">
                            <Search className="mx-auto mb-6 text-slate-400" size={64} />
                            <h2 className="text-2xl font-semibold text-slate-700 mb-2">No Matching Registrations</h2>
                            <p className="text-slate-500 mb-6 max-w-md mx-auto">Your search for "{searchTerm}" did not match any registrations.</p>
                            <button className="px-6 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium" onClick={() => setSearchTerm("")}> Clear Search </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[860px] divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Details</th>
                                        <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Serial Number</th>
                                        <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Registered On</th>
                                        <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Warranty Status</th>
                                        <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {filteredItems.map((reg, index) => (
                                    <tr key={index} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="flex-shrink-0 h-12 w-12 flex items-center justify-center bg-indigo-100 rounded-lg mr-4 group-hover:bg-indigo-200 transition-colors">
                                                    <Package className="text-indigo-600" size={24} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-900">{reg.product_name || "N/A"}</div>
                                                    <div className="text-xs text-slate-500">{reg.product_category || "General"}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center text-sm text-slate-700">
                                                <Tag className="flex-shrink-0 mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors" size={18} />
                                                {reg.serial_number || "N/A"}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center text-sm text-slate-700">
                                                <Calendar className="flex-shrink-0 mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors" size={18} />
                                                {formatDate(reg.registered_at)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm"> {/* Copied from original with minor style adjustments */}
                                            {(() => {
                                                const status = reg.warrantyStatus; const hasRecord = reg.hasWarrantyRecord;
                                                if (hasRecord === false) { return (<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300" title="No warranty claim initiated for this product."><Info size={14} className="mr-1 text-slate-500" /> Not Claimed</span>); }
                                                else if (hasRecord === true) {
                                                    let badgeClass = "bg-sky-100 text-sky-700 border-sky-300"; let icon = <ShieldCheck size={14} className="mr-1 text-sky-600" />; let displayStatus = typeof status === 'string' ? status : "Claimed";
                                                    if (typeof status === 'string') { const lowerStatus = status.toLowerCase(); if (lowerStatus.includes("pending")) { badgeClass = "bg-yellow-100 text-yellow-700 border-yellow-300"; icon = <Info size={14} className="mr-1 text-yellow-600" />; } else if (lowerStatus.includes("approved")) { badgeClass = "bg-emerald-100 text-emerald-700 border-emerald-300"; icon = <ShieldCheck size={14} className="mr-1 text-emerald-600" />; } else if (lowerStatus.includes("rejected")) { badgeClass = "bg-red-100 text-red-700 border-red-300"; icon = <AlertTriangle size={14} className="mr-1 text-red-600" />; }}
                                                    return (<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeClass}`} title={`Warranty Status: ${displayStatus}`}>{icon} {displayStatus}</span> );
                                                } else {
                                                    let titleText = "Could not retrieve warranty status."; let displayText = "Unavailable"; if (status === "N/A (No S/N)") { titleText = "Warranty status check N/A: Serial number missing for this registration."; displayText = "N/A (No S/N)"; } else if (status === "Status Unavailable") { titleText = "Warranty status is temporarily unavailable for this product."; } else if (status === "Error Fetching Status") { titleText = "An error occurred while fetching warranty status for this product."; }
                                                    return (<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-300" title={titleText}><AlertTriangle size={14} className="mr-1 text-orange-500" /> {displayText}</span>);
                                                }
                                            })()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap ">
                                            <div className="flex items-center space-x-3">
                                                <button onClick={() => downloadInvoice(reg.product_name, reg.serial_number)} disabled={!reg.invoice_receipt} className="inline-flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs" title={!reg.invoice_receipt ? "Invoice not available" : "Download Invoice"}>
                                                    <Download className="mr-1.5" size={14} /> Invoice
                                                </button>
                                                <button onClick={() => handleClaimClick(reg)} className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors text-xs" title="File or view warranty claim">
                                                    <ShieldCheck className="mr-1.5" size={14} /> Claim
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                  </div>
                </>
              )}
              {!isAdmin && currentPage === "warrantyClaim" && (
                <WarrantyClaimForm prefillData={selectedRegistrationForClaim} />
              )}

              {/* ---- ADMIN-SPECIFIC VIEWS ---- */}
              {isAdmin && currentPage === "allRegistrations" && <AllRegistrationsView />}
              {console.log(warrantyReports)}
              {isAdmin && currentPage === "warrantyReports" && <WarrantyReportsView />}
              {isAdmin && currentPage === "manageProducts" && <ManageProductsView />}
              
              {/* ---- COMMON VIEWS (Settings) ---- */}
              {currentPage === "settings" && <SettingsSection />}
            </>
          )}
        </main>
        <Footer />
      </div>
    </div>
  );
}