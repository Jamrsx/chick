<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\StaffController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\StaffAssignmentController;
use App\Http\Controllers\Api\DeductionIncentiveController;
use App\Http\Controllers\Api\FaceEnrollmentController;

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
    Route::post('/products/{id}/toggle-received', [ProductController::class, 'toggleReceived']);
    Route::get('/products/low-stock/all', [ProductController::class, 'getLowStock']);
    
    // Staff
    Route::apiResource('staff', StaffController::class);
    
    // Staff Assignments - Add these routes
    Route::get('/staff-assignments', [StaffAssignmentController::class, 'index']);
    Route::get('/staff/{userId}/assignment', [StaffAssignmentController::class, 'getUserAssignment']);
    
    // Staff Deductions and Incentives
    Route::get('/staff/{userId}/deductions/{month}/{year}', [DeductionIncentiveController::class, 'getDeductions']);
    Route::get('/staff/{userId}/incentives/{month}/{year}', [DeductionIncentiveController::class, 'getIncentives']);
    Route::post('/staff/{userId}/deductions', [DeductionIncentiveController::class, 'storeDeductions']);
    Route::post('/staff/{userId}/incentives', [DeductionIncentiveController::class, 'storeIncentives']);
    Route::get('/deductions-incentives/all', [DeductionIncentiveController::class, 'getAllForMonth']);
    
    // Face enrollment (attendance)
    Route::get('/face/status', [FaceEnrollmentController::class, 'status']);
    Route::post('/face/enroll', [FaceEnrollmentController::class, 'enroll']);
    Route::post('/face/verify', [FaceEnrollmentController::class, 'verify']);
    Route::post('/face/reset', [FaceEnrollmentController::class, 'reset']);

    // Attendance
    Route::get('/attendance', [AttendanceController::class, 'index']);
    Route::post('/attendance/time-in', [AttendanceController::class, 'timeIn']);
    Route::put('/attendance/{id}/time-out', [AttendanceController::class, 'timeOut']);
    Route::get('/attendance/payroll/report', [AttendanceController::class, 'getPayroll']);
    
    // Sales - Custom routes MUST come before apiResource
    Route::get('/sales/product-incentives', [SaleController::class, 'getProductIncentives']);
    Route::get('/sales/product-incentives/daily', [SaleController::class, 'getDailyProductIncentives']);
    Route::get('/sales/summary/overview', [SaleController::class, 'getSalesSummary']);
    Route::apiResource('sales', SaleController::class);
});
