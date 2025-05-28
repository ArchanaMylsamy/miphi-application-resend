// src/App.js
import React, { useContext } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import Login from './pages/Login/Login';
import Products from './pages/Product/Product';
import { UserContext, UserProvider } from './context/UserContext';

// ProtectedRoute component
const ProtectedRoute = ({ children }) => {
  console.log('UserContext:', UserContext); // Debug: Check if UserContext is defined
  const context = useContext(UserContext);
  console.log('Context value:', context); // Debug: Check the context value
  const { user } = context;
  const token = sessionStorage.getItem('token');

  if (!user && !token) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/products"
            element={
              <ProtectedRoute>
                <Products />
              </ProtectedRoute>
            }
          />
        </Routes>
      </UserProvider>
    </BrowserRouter>
  );
}

export default App;