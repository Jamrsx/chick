import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Dashboard from "./Dashboard/Dashboard";
import BranchDetails from "./BranchDetails/BranchDetails";
import Login from "./login/Login";
import Attendance from "./Attendance/AttendanceSheet";
import ProtectedRoute from "./ProtectedRoute";
import ProductList from "./Product/ProductList";
import StaffList from "./Staff/Staff";
import EmployeeTracker from "./Employee/EmployeeTracker";

import Layout from "./Dashboard/Layout";
import "antd/dist/reset.css";





function App() {
  return (
    <Routes>

      {/* Public */}
      <Route path="/" element={<Login />} />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/branch/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <BranchDetails />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <Layout>
              <Attendance />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/products"
        element={
          <ProtectedRoute>
            <Layout>
              <ProductList />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/staff"
        element={
          <ProtectedRoute>
            <Layout>
              <StaffList />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/employee-tracker"
        element={
          localStorage.getItem("role") === "admin" ? (
            <ProtectedRoute>
              <Layout>
                <EmployeeTracker />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />

    </Routes>
  );
}

export default App;