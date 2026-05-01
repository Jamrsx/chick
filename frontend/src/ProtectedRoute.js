import React from "react";
import { Navigate } from "react-router-dom";

// Simple auth check (can be replaced with real auth logic)
const isAuthenticated = () => {
  return localStorage.getItem("isLoggedIn") === "true";
};

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    // Not logged in → redirect to login page
    return <Navigate to="/" replace />;
  }
  return children;
}

export default ProtectedRoute;