<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\User;
use App\Models\StaffDeduction;
use App\Models\StaffIncentive;
use App\Models\Branch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class AttendanceController extends Controller
{
    public function index(Request $request)
    {
        $query = Attendance::with(['user', 'branch']);
        
        if ($request->has('date')) {
            $query->whereDate('date', $request->date);
        }
        
        if ($request->has('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }
        
        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }
        
        $attendance = $query->orderBy('date', 'desc')->get();
        
        return response()->json($attendance);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'branch_id' => 'required|exists:branches,id',
            'date' => 'required|date',
            'time_in' => 'nullable|date_format:H:i',
            'time_out' => 'nullable|date_format:H:i',
        ]);
        
        DB::beginTransaction();
        
        try {
            $attendance = Attendance::updateOrCreate(
                [
                    'user_id' => $validated['user_id'],
                    'date' => $validated['date'],
                ],
                [
                    'branch_id' => $validated['branch_id'],
                    'time_in' => $validated['time_in'] ?? null,
                    'time_out' => $validated['time_out'] ?? null,
                    'is_late' => false,
                    'late_minutes' => 0,
                    'status' => 'present',
                ]
            );
            
            DB::commit();
            
            return response()->json($attendance, 201);
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Attendance store failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to save attendance', 'error' => $e->getMessage()], 500);
        }
    }

    public function timeIn(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'branch_id' => 'required|exists:branches,id',
            'date' => 'required|date',
            'time_in' => 'required|date_format:H:i',
        ]);
        
        $date = $validated['date'];
        
        DB::beginTransaction();
        
        try {
            // Check if attendance already exists for this date
            $existingAttendance = Attendance::where('user_id', $validated['user_id'])
                ->whereDate('date', $date)
                ->first();
            
            if ($existingAttendance && $existingAttendance->time_in) {
                DB::rollBack();
                return response()->json([
                    'error' => 'You have already timed in for today.',
                    'attendance' => $existingAttendance
                ], 422);
            }
            
            // Parse time in WITH the date to ensure correct comparison
            $timeIn = Carbon::parse($date . ' ' . $validated['time_in']);
            
            // Set cutoff time to 8:00 AM for late checking (using same date)
            $cutoff = Carbon::parse($date . ' 08:00');
            $isLate = $timeIn->gt($cutoff);
            $lateMinutes = $isLate ? $cutoff->diffInMinutes($timeIn) : 0;
            
            // Determine status based on late minutes
            $status = 'present';
            if ($isLate) {
                if ($lateMinutes <= 15) {
                    $status = 'late_15';
                } elseif ($lateMinutes <= 30) {
                    $status = 'late_30';
                } elseif ($lateMinutes <= 60) {
                    $status = 'late_60';
                } else {
                    $status = 'late';
                }
            }
            
            $attendance = Attendance::updateOrCreate(
                [
                    'user_id' => $validated['user_id'],
                    'date' => $date,
                ],
                [
                    'branch_id' => $validated['branch_id'],
                    'time_in' => $validated['time_in'],
                    'is_late' => $isLate,
                    'late_minutes' => $lateMinutes,
                    'status' => $status,
                    'hours_worked' => null, // Will be calculated on time out
                ]
            );
            
            DB::commit();
            
            \Log::info('Time in recorded successfully', ['attendance_id' => $attendance->id]);
            
            return response()->json([
                'message' => 'Time in recorded successfully',
                'attendance' => $attendance,
                'is_late' => $isLate,
                'late_minutes' => $lateMinutes,
                'time_display' => $timeIn->format('g:i A')
            ], 201);
            
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Time in failed: ' . $e->getMessage(), ['request' => $validated]);
            return response()->json(['message' => 'Failed to record time in', 'error' => $e->getMessage()], 500);
        }
    }

    public function timeOut(Request $request, $id = null)
    {
        // Better validation with clear error messages
        if ($id) {
            // When ID is provided in URL
            $validator = validator($request->all(), [
                'time_out' => 'required|date_format:H:i',
            ], [
                'time_out.required' => 'Time out is required',
                'time_out.date_format' => 'Time out must be in 24-hour format (HH:MM)'
            ]);
        } else {
            // When no ID in URL, need user_id and date
            $validator = validator($request->all(), [
                'user_id' => 'required|exists:users,id',
                'time_out' => 'required|date_format:H:i',
                'date' => 'required|date',
            ], [
                'user_id.required' => 'User ID is required',
                'user_id.exists' => 'User not found',
                'time_out.required' => 'Time out is required',
                'time_out.date_format' => 'Time out must be in 24-hour format (HH:MM)',
                'date.required' => 'Date is required',
                'date.date' => 'Invalid date format'
            ]);
        }
        
        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }
        
        $validated = $validator->validated();
        
        DB::beginTransaction();
        
        try {
            // If ID is provided, use it directly
            if ($id) {
                $attendance = Attendance::find($id);
                
                if (!$attendance) {
                    DB::rollBack();
                    return response()->json([
                        'message' => 'Attendance record not found',
                        'error' => "No attendance record found with ID: {$id}"
                    ], 404);
                }
            } else {
                // Otherwise find by user_id and date
                $date = $validated['date'];
                
                $attendance = Attendance::where('user_id', $validated['user_id'])
                    ->whereDate('date', $date)
                    ->first();
                
                if (!$attendance) {
                    DB::rollBack();
                    return response()->json([
                        'message' => 'No attendance record found',
                        'error' => 'No attendance record found for this user on the specified date. Please time in first.'
                    ], 404);
                }
            }
            
            // Check if already timed out
            if ($attendance->time_out) {
                DB::rollBack();
                return response()->json([
                    'message' => 'Already timed out',
                    'error' => 'You have already timed out for this attendance record.',
                    'attendance' => $attendance
                ], 422);
            }
            
            // Check if time in exists
            if (!$attendance->time_in) {
                DB::rollBack();
                return response()->json([
                    'message' => 'Not timed in yet',
                    'error' => 'Please time in first before timing out.'
                ], 422);
            }
            
            // Parse times WITH the date from attendance
            $date = $attendance->date;
            $timeOut = Carbon::parse($date . ' ' . $validated['time_out']);
            $timeIn = Carbon::parse($date . ' ' . $attendance->time_in);
            
            // Handle overnight shifts (if time out is next day)
            if ($timeOut->lt($timeIn)) {
                $timeOut->addDay();
            }
            
            // Calculate hours worked
            $minutesWorked = $timeIn->diffInMinutes($timeOut);
            $hoursWorked = round($minutesWorked / 60, 2);
            
            // Update attendance
            $attendance->time_out = $validated['time_out'];
            
            // Update status based on late status
            if (strpos($attendance->status, 'late') !== false) {
                $attendance->status = 'completed_late';
            } else {
                $attendance->status = 'completed';
            }
            
            $attendance->hours_worked = $hoursWorked;
            $attendance->save();
            
            DB::commit();
            
            \Log::info('Time out recorded successfully', [
                'attendance_id' => $attendance->id,
                'hours_worked' => $hoursWorked
            ]);
            
            return response()->json([
                'message' => 'Time out recorded successfully',
                'attendance' => $attendance->load('user', 'branch'),
                'hours_worked' => $hoursWorked,
                'time_display' => $timeOut->format('g:i A'),
                'minutes_worked' => $minutesWorked
            ], 200);
            
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Time out failed: ' . $e->getMessage(), ['request' => $request->all()]);
            return response()->json([
                'message' => 'Failed to record time out', 
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getPayroll(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'branch_id' => 'nullable|exists:branches,id',
        ]);
        
        $query = Attendance::with(['user.branchAssignments', 'branch'])
            ->whereDate('date', $validated['date']);
        
        if ($request->has('branch_id')) {
            $query->where('branch_id', $validated['branch_id']);
        }
        
        $attendance = $query->get();
        
        $payroll = [];
        
        foreach ($attendance as $record) {
            // Get active branch assignment for daily rate
            $assignment = $record->user->branchAssignments()
                ->where('branch_id', $record->branch_id)
                ->where('is_active', true)
                ->first();
                
            $dailyRate = $assignment ? $assignment->daily_rate : 500;
            
            // Calculate hours worked
            $hoursWorked = $record->hours_worked ?? 0;
            if ($hoursWorked == 0 && $record->time_in && $record->time_out) {
                $date = $record->date;
                $timeIn = Carbon::parse($date . ' ' . $record->time_in);
                $timeOut = Carbon::parse($date . ' ' . $record->time_out);
                
                // Handle overnight shifts (if time out is next day)
                if ($timeOut->lt($timeIn)) {
                    $timeOut->addDay();
                }
                
                $minutesWorked = $timeIn->diffInMinutes($timeOut);
                $hoursWorked = round($minutesWorked / 60, 2);
            }
            
            // Format time for display (extract only time part)
            $timeInDisplay = $record->time_in ? Carbon::parse($record->time_in)->format('g:i A') : null;
            $timeOutDisplay = $record->time_out ? Carbon::parse($record->time_out)->format('g:i A') : null;
            
            // Calculate earnings
            $dailyEarnings = 0;
            if ($hoursWorked > 0) {
                if ($hoursWorked <= 8) {
                    $dailyEarnings = ($hoursWorked / 8) * $dailyRate;
                } else {
                    $overtimeHours = $hoursWorked - 8;
                    $overtimeRate = ($dailyRate / 8) * 1.25;
                    $dailyEarnings = $dailyRate + ($overtimeHours * $overtimeRate);
                }
            }
            
            // Get deductions for the month
            $month = Carbon::parse($validated['date'])->month;
            $year = Carbon::parse($validated['date'])->year;
            
            $deductions = StaffDeduction::where('user_id', $record->user_id)
                ->where('month', $month)
                ->where('year', $year)
                ->first();
            
            $incentives = StaffIncentive::where('user_id', $record->user_id)
                ->where('month', $month)
                ->where('year', $year)
                ->first();
            
            // Calculate daily deductions and incentives
            $dailyDeductions = 0;
            if ($deductions) {
                $dailyDeductions += ($deductions->sss / 22);
                $dailyDeductions += ($deductions->philhealth / 22);
                $dailyDeductions += ($deductions->pagibig / 22);
                $dailyDeductions += ($deductions->cash_advance / 22);
            }
            
            // Late deductions (₱5 per minute)
            if ($record->is_late && $record->late_minutes > 0) {
                $dailyDeductions += $record->late_minutes * 5;
            }
            
            $dailyIncentives = 0;
            if ($incentives && $incentives->perfect_attendance && !$record->is_late) {
                $dailyIncentives += 500 / 22;
            }
            
            // Add commission if any
            if ($incentives && $incentives->commission > 0) {
                $dailyIncentives += $incentives->commission / 22;
            }
            
            $netPay = $dailyEarnings - $dailyDeductions + $dailyIncentives;
            
            // Handle branch name with fallback
            $branchName = 'N/A';
            if ($record->branch) {
                $branchName = $record->branch->name;
            } elseif ($record->branch_id) {
                $branch = Branch::find($record->branch_id);
                $branchName = $branch ? $branch->name : 'N/A';
            }
            
            $payroll[] = [
                'attendance_id' => $record->id,
                'staff_name' => $record->user->firstname . ' ' . $record->user->lastname,
                'branch' => $branchName,
                'branch_id' => $record->branch_id,
                'time_in' => $timeInDisplay,
                'time_out' => $timeOutDisplay,
                'time_in_raw' => $record->time_in,
                'time_out_raw' => $record->time_out,
                'hours_worked' => $hoursWorked,
                'daily_rate' => $dailyRate,
                'daily_earnings' => round($dailyEarnings, 2),
                'deductions' => round($dailyDeductions, 2),
                'incentives' => round($dailyIncentives, 2),
                'net_pay' => round($netPay, 2),
                'is_late' => $record->is_late,
                'late_minutes' => $record->late_minutes,
                'status' => $record->status,
            ];
        }
        
        return response()->json($payroll);
    }

    // Helper method to get attendance for a specific user on current date
    public function getCurrentAttendance(Request $request)
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
        ]);
        
        $today = Carbon::now()->toDateString();
        
        $attendance = Attendance::where('user_id', $request->user_id)
            ->whereDate('date', $today)
            ->first();
        
        return response()->json($attendance);
    }
}