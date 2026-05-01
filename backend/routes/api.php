<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\StaffController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\StaffAssignmentController; // Add this

// PUBLIC ROUTES
Route::post('/login', [AuthController::class, 'login']);

// PROTECTED ROUTES
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::put('/me', [AuthController::class, 'updateProfile']);
    
    // Branches
    Route::apiResource('branches', BranchController::class);
    Route::get('/branches/{id}/sales', [BranchController::class, 'getSales']);
    Route::get('/branches/{id}/attendance', [BranchController::class, 'getAttendance']);
    Route::get('/branches/{id}/dashboard', [BranchController::class, 'getDashboardData']);
    
    // Products
    Route::apiResource('products', ProductController::class);
    Route::post('/products/{id}/restock', [ProductController::class, 'restock']);
    Route::get('/products/low-stock/all', [ProductController::class, 'getLowStock']);
    
    // Staff
    Route::apiResource('staff', StaffController::class);
    
    // Staff Assignments - Add these routes
    Route::get('/staff-assignments', [StaffAssignmentController::class, 'index']);
    Route::get('/staff/{userId}/assignment', [StaffAssignmentController::class, 'getUserAssignment']);
    
    // Attendance
    Route::get('/attendance', [AttendanceController::class, 'index']);
    Route::post('/attendance/time-in', [AttendanceController::class, 'timeIn']);
    Route::put('/attendance/{id}/time-out', [AttendanceController::class, 'timeOut']);
    Route::get('/attendance/payroll/report', [AttendanceController::class, 'getPayroll']);
    
    // Sales
    Route::apiResource('/sales', SaleController::class);
    Route::get('/sales/summary/overview', [SaleController::class, 'getSalesSummary']);
});
