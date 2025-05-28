import React, { useState, useEffect ,useContext} from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
// Import your background image
import backgroundImage from '../../assets/miphi_app.webp';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  Alert
} from '@mui/material';
import { UserContext } from '../../context/UserContext'; // Import UserContext
const Login = () => {
  const navigate = useNavigate();
  const { setUser } = useContext(UserContext); // Access setUser from context
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);

  // New states for login timer
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [loginTimerExpiry, setLoginTimerExpiry] = useState(null);
  const [remainingLoginTimer, setRemainingLoginTimer] = useState(0);

  const [viewportDimensions, setViewportDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Forgot Password State
  const [openForgotPassword, setOpenForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [openPasswordResetConfirmation, setOpenPasswordResetConfirmation] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordError, setForgotPasswordError] = useState('');
  const [isPasswordResetLoading, setIsPasswordResetLoading] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setViewportDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({ ...prev, [name]: value }));
    setError('');
  };
  const handleForgotPasswordOpen = () => {
    setOpenForgotPassword(true);
    setForgotPasswordError('');
  };

  const handleForgotPasswordClose = () => {
    setOpenForgotPassword(false);
    setForgotPasswordEmail('');
    setForgotPasswordError('');
  };

  const handleForgotPassword = async () => {
    // Validate email
    if (!forgotPasswordEmail) {
      setForgotPasswordError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotPasswordEmail)) {
      setForgotPasswordError('Please enter a valid email address');
      return;
    }

    setIsPasswordResetLoading(true);
    setForgotPasswordError('');

    try {
      const response = await fetch(`/api/forget-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotPasswordEmail }),
      });

      const data = await response.json();

      if (response.ok) {

        // Close the forgot password dialog
        handleForgotPasswordClose();

        // Open the confirmation dialog
        setOpenPasswordResetConfirmation(true);
      } else {
        setForgotPasswordError(data.message || 'Unable to send password reset link. Please try again.');
      }
    } catch (error) {
      setForgotPasswordError('Unable to connect to the server. Please try again later.');
    } finally {
      setIsPasswordResetLoading(false);
    }
  };

  const handlePasswordResetConfirmationClose = () => {
    setOpenPasswordResetConfirmation(false);
  };

  useEffect(() => {
    const storedLoginTimerExpiry = localStorage.getItem('loginTimerExpiry');
    const storedLoginAttempts = localStorage.getItem('loginAttempts');

    if (storedLoginTimerExpiry) {
      const remainingTime = parseInt(storedLoginTimerExpiry) - Date.now();

      if (remainingTime > 0) {
        // If timer is still active, start the countdown
        startLoginTimer(remainingTime);
        setLoginAttempts(parseInt(storedLoginAttempts || '0'));
      } else {
        // Clear expired timer
        localStorage.removeItem('loginTimerExpiry');
        localStorage.removeItem('loginAttempts');
        setLoginAttempts(0);
      }
    }
  }, []);



  // New function to start login timer
  const startLoginTimer = (duration) => {
    setLoginTimerExpiry(Date.now() + duration);
    setRemainingLoginTimer(Math.ceil(duration / 1000));

    const timer = setInterval(() => {
      setRemainingLoginTimer((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(timer);
          localStorage.removeItem('loginTimerExpiry');
          localStorage.removeItem('loginAttempts');
          setLoginTimerExpiry(null);
          setRemainingLoginTimer(0);
          setLoginAttempts(0);
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);
  };

  // Modify handleSubmit to incorporate login timer logic
  const handleSubmit = async (e) => {
    e.preventDefault();

    const storedLoginTimerExpiry = localStorage.getItem('loginTimerExpiry');
    if (storedLoginTimerExpiry && parseInt(storedLoginTimerExpiry) > Date.now()) {
      const remainingTime = Math.ceil((parseInt(storedLoginTimerExpiry) - Date.now()) / 1000);
      setError(`Too many login attempts. Please try again in ${Math.floor(remainingTime / 60)} minutes and ${remainingTime % 60} seconds.`);
      return;
    }

    if (!credentials.email || !credentials.password) {
      setError('Please fill in all fields');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const credentialsToSend = {
        ...credentials,
        email: credentials.email.toLowerCase(),
      };
      
      const response = await fetch('https://miphi-application.vercel.app/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentialsToSend),
      });

      const data = await response.json();

      if (response.ok) {
        // --- MODIFIED SECTION TO HANDLE COMPLETE USER DATA ---
        let userToStoreInContext = null;

        if (data.user && typeof data.user === 'object') {
          // API returned a user object. Assume it contains email, name, mobile_number.
          userToStoreInContext = { ...data.user }; // Create a new object to avoid direct mutation if needed

          // Ensure email from API or credentials is lowercased for consistency
          if (userToStoreInContext.email && typeof userToStoreInContext.email === 'string') {
            userToStoreInContext.email = userToStoreInContext.email.toLowerCase();
          } else {
            // If data.user doesn't have an email or it's not a string, use the one from credentials.
            userToStoreInContext.email = credentials.email.toLowerCase();
          }
        } else {
          // Fallback: If API doesn't return a user object, or it's not an object,
          // just store the email. You might want to log a warning here if data.user is expected.
          userToStoreInContext = { email: credentials.email.toLowerCase() };
        }

        // Now, userToStoreInContext should have email and potentially name, mobile_number if provided by API.
        setUser(userToStoreInContext);
        // The useEffect in UserProvider will automatically sync this userToStoreInContext to sessionStorage.
        // --- END OF MODIFIED SECTION ---

        // Successful login - reset attempts and store the new token
        localStorage.removeItem('loginAttempts');
        localStorage.removeItem('loginTimerExpiry');
        sessionStorage.setItem('token', data.token); // Token is managed separately

        // The explicit sessionStorage.setItem('user', JSON.stringify(data.user));
        // is no longer needed here for the user object, as UserContext handles it.

        setIsAnimating(true);
        setTimeout(() => {
          navigate('/products');
        }, 2000);
      } else {
        // Increment login attempts if login fails
        const currentAttempts = (parseInt(localStorage.getItem('loginAttempts') || '0') + 1);
        setLoginAttempts(currentAttempts);
        localStorage.setItem('loginAttempts', currentAttempts.toString());
        if (currentAttempts >= 5) {
          const timerDuration = 30 * 1000; // 30 seconds for testing, adjust as needed
          const expiryTime = Date.now() + timerDuration;
          localStorage.setItem('loginTimerExpiry', expiryTime.toString());
          startLoginTimer(timerDuration);
          // The error message for lockout is now handled by renderLoginTimer or the initial check
        } else {
          setError(data.message || 'Login failed. Please check your credentials.');
        }
      }
    } catch (error) {
      setError('Unable to connect to the server. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Render remaining login timer if active
  const renderLoginTimer = () => {
    if (remainingLoginTimer > 0) {
      const minutes = Math.floor(remainingLoginTimer / 60);
      const seconds = remainingLoginTimer % 60;
      return (
        <div className="text-red-100 px-4 py-3 rounded-xl text-sm text-center">
          Too many login attempts. Please try again in {seconds} seconds.
        </div>
      );
    }
    return null;
  };
  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent form submission
      handleSubmit(event); // Manually trigger the submit handler
    }
  };
  useEffect(() => {
    const style = document.createElement('style');
    const containerWidth = 448;
    const containerHeight = 400;

    const scaleX = viewportDimensions.width / containerWidth;
    const scaleY = viewportDimensions.height / containerHeight;
    const maxScale = Math.max(scaleX, scaleY) * 1.1;

    style.textContent = `
      @keyframes sequentialAnimation {
        0% {
          transform: perspective(2000px) rotateY(0deg) scale(1);
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
          backdrop-filter: blur(10px);
        }
        40% {
          transform: perspective(2000px) rotateY(180deg) scale(1);
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
          backdrop-filter: blur(10px);
        }
        50% {
          transform: perspective(2000px) rotateY(360deg) scale(1);
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
          backdrop-filter: blur(10px);
        }
        60% {
          transform: perspective(2000px) rotateY(360deg) scale(1);
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
          backdrop-filter: blur(10px);
        }
        100% {
          transform: perspective(2000px) rotateY(360deg) scale(${maxScale});
          border-radius: 0px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
          backdrop-filter: blur(10px);
        }
      }

      .container-animate {
        animation: sequentialAnimation 2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        transform-style: preserve-3d;
        backface-visibility: visible;
      }

      @keyframes contentFadeOut {
        0% {
          opacity: 1;
          transform: translateZ(0) scale(1);
        }
        45% {
          opacity: 0;
          transform: translateZ(-100px) scale(0.9);
        }
        100% {
          opacity: 0;
          transform: translateZ(-200px) scale(0.8);
        }
      }

      .content-fade {
        animation: contentFadeOut 0.8s ease-out forwards;
      }

      @keyframes backgroundZoom {
        0% {
          transform: scale(1);
        }
        100% {
          transform: scale(1.1);
        }
      }

      .background-animate {
        animation: backgroundZoom 10s ease-in-out infinite alternate;
      }
    `;

    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, [viewportDimensions]);
  const handleForgotPasswordClick = () => {
    setOpenForgotPassword(true);
  }
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        position: 'relative',
      }}
    >

      {/* Background with parallax effect */}
      <div
        className="absolute inset-0 background-animate"
        style={{
          background: `linear-gradient(rgba(17, 24, 39, 0), rgba(17, 24, 39, 1)), url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          zIndex: -1,
        }}
      />
      {/* Forgot Password Dialog */}
      <Dialog
        open={openForgotPassword}
        onClose={handleForgotPasswordClose}
        PaperProps={{
          style: {
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0))',
            backdropFilter: 'blur(10px)',
            color: 'white',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.18)'
          }
        }}
      >
        <DialogTitle>Reset Your Password</DialogTitle>
        <DialogContent>
          <DialogContentText style={{ color: 'rgba(255,255,255,0.7)' }}>
            Enter your email address and we'll send a temporary password.
          </DialogContentText>

          <TextField
            autoFocus
            margin="dense"
            label="Email Address"
            type="email"
            fullWidth
            variant="outlined"
            value={forgotPasswordEmail}
            onChange={(e) => setForgotPasswordEmail(e.target.value)}
            InputProps={{
              style: {
                color: 'white',
                borderColor: 'rgba(255, 255, 255, 0.18)'
              }
            }}
            InputLabelProps={{
              style: { color: 'rgba(255,255,255,0.7)' }
            }}
          />

          {forgotPasswordError && (
            <Alert severity="error" className="mt-2">
              {forgotPasswordError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleForgotPasswordClose}
            style={{ color: 'white' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleForgotPassword}
            disabled={isPasswordResetLoading}
            style={{ color: 'white' }}
          >
            {isPasswordResetLoading ? 'Sending...' : 'Send Temporary Password'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Password Reset Confirmation Dialog */}
      <Dialog
        open={openPasswordResetConfirmation}
        onClose={handlePasswordResetConfirmationClose}
        PaperProps={{
          style: {
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0))',
            backdropFilter: 'blur(10px)',
            color: 'white',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.18)'
          }
        }}
      >
        <DialogTitle>Temporary Password Sent</DialogTitle>
        <DialogContent>
          <DialogContentText style={{ color: 'rgba(255,255,255,0.7)' }}>
            A temporary password has been sent to {forgotPasswordEmail}.
            Please check your email and use the temporary password to log in.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handlePasswordResetConfirmationClose}
            style={{ color: 'white' }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>
      {/* Main content */}
      <div className="relative perspective-[2000px] z-10">
        <div
          className={`relative w-full max-w-md p-8 ${isAnimating ? 'container-animate' : ''}`}
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.11))',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
            transformStyle: 'preserve-3d',
            transformOrigin: 'center center',
            backfaceVisibility: 'visible',
            WebkitBackfaceVisibility: 'visible'
          }}
        >
          <div
            className={`space-y-8 ${isAnimating ? 'content-fade' : ''}`}
            style={{
              transformStyle: 'preserve-3d',
              backfaceVisibility: 'visible',
              WebkitBackfaceVisibility: 'visible'
            }}
          >
            {/* Logo */}
            <div className="bg-gray-200 shadow-lg rounded-2xl p-6 max-w-xl mx-auto mt-10 text-center">
              <h1 className="text-2xl font-semibold text-gray-800 mb-4">
              ProductVault 
              </h1>
              <p className="text-gray-600">
                View all the products you've registered using your email and easily claim warranty support whenever needed.
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div
                className="text-red-100 px-4 py-3 rounded-xl text-sm animate-shake"
                style={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0))',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(239, 68, 68, 0.18)',
                }}
              >
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                {/* Email input */}
                <input
                  type="email"
                  name="email"
                  value={credentials.email}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown} // Add keydown event handler
                  disabled={isLoading || isAnimating}
                  required
                  className="w-full px-4 py-3 rounded-xl text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-white/30"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.48))',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: '1px solid rgb(99, 99, 99)'
                  }}
                  placeholder="Email"
                />
                {/* Password input with toggle */}
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={credentials.password}
                    onChange={handleInputChange}
                    disabled={isLoading || isAnimating}
                    required
                    
                    className="w-full px-4 py-3 rounded-xl text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-white/30"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.48))',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      border: '1px solid rgb(99, 99, 99)'
                    }}
                    placeholder="Password"
                  />
                  <div
    className="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer"
    onClick={() => setShowPassword((prev) => !prev)}
  >
    {showPassword ? (
      <EyeOff className="w-5 h-5 text-white" />
    ) : (
      <Eye className="w-5 h-5 text-white" />
    )}
  </div>
                </div>

              </div>
              {/* Forgot Password Link */}
              <div className="text-right">
                <a
                  onClick={handleForgotPasswordClick}
                  className="text-white/70 hover:text-white/90 text-sm duration-300 cursor-pointer" // Added cursor-pointer
                >
                  Forgot Password?
                </a>
              </div>

              {/* Submit button */}
              <button
                type="submit"

                disabled={isLoading || isAnimating || remainingLoginTimer > 0}
                className="w-full px-4 py-3 rounded-xl text-white font-medium transition-all relative overflow-hidden hover:bg-white/10"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.48))',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgb(99, 99, 99)'
                }}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
            {remainingLoginTimer > 0 && renderLoginTimer()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;