<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\UserFaceTemplate;
use App\Models\StaffAssignment;
use App\Services\FaceTemplateMatcher;
use App\Models\StaffDeduction;
use App\Models\StaffIncentive;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

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

        return response()->json($attendance, 201);
    }

    public function timeIn(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'branch_id' => 'required|exists:branches,id',
            'date' => 'nullable|date',
            'time_in' => 'required|string',
            'face_embedding' => 'nullable|array|min:64|max:256',
            'face_embedding.*' => 'numeric',
        ]);

        $authUser = $request->user();
        if ((int) $validated['user_id'] !== (int) $authUser->id) {
            return response()->json(['message' => 'Unauthorized attendance action.', 'error' => 'user_id mismatch'], 403);
        }

        // Staff attendance: enrolled face template required + embedding must match
        $authRole = strtolower((string) ($authUser->role ?? ''));
        if ($authRole === 'staff') {
            $template = UserFaceTemplate::where('user_id', $authUser->id)
                ->where('is_active', true)
                ->first();
            if (! $template) {
                return response()->json([
                    'message' => 'Register your face first before time in/out.',
                    'code' => 'FACE_NOT_ENROLLED',
                ], 422);
            }
            if ((int) ($template->embedding_dim ?? 0) < 64) {
                return response()->json([
                    'message' => 'Old face template detected. Please register again for high-accuracy face recognition.',
                    'code' => 'FACE_TEMPLATE_WEAK',
                ], 422);
            }
            if (! is_array($request->input('face_embedding')) || count($request->input('face_embedding')) < 8) {
                return response()->json([
                    'message' => 'Face verification required.',
                    'code' => 'FACE_EMBEDDING_REQUIRED',
                ], 422);
            }
            $probe = array_map('floatval', $request->input('face_embedding'));
            if (count($probe) < 64) {
                return response()->json([
                    'message' => 'High-accuracy face descriptor required. Please keep the app open and try again.',
                    'code' => 'FACE_STRONG_EMBEDDING_REQUIRED',
                ], 422);
            }
            if (count($probe) !== count($template->embedding)) {
                return response()->json([
                    'message' => 'Face template outdated. Please re-register your face.',
                    'code' => 'FACE_DIM_MISMATCH',
                ], 422);
            }
            $threshold = FaceTemplateMatcher::threshold();
            $similarity = FaceTemplateMatcher::cosineSimilarity($template->embedding, $probe);
            if ($similarity < $threshold) {
                \Log::warning('[ATTENDANCE] Face mismatch on time-in', ['user_id' => $authUser->id]);

                return response()->json([
                    'message' => 'Face not recognized. Time in denied.',
                    'code' => 'FACE_MISMATCH',
                    'similarity' => $similarity,
                    'threshold' => $threshold,
                ], 422);
            }
        }

        $assignment = StaffAssignment::where('user_id', $validated['user_id'])
            ->where('branch_id', $validated['branch_id'])
            ->where('is_active', true)
            ->first();

        if (!$assignment) {
            return response()->json([
                'message' => 'No active branch assignment found.',
                'error' => 'This staff member is not assigned to the selected branch.',
            ], 422);
        }

        $date = $validated['date'] ?? now()->toDateString();

        $existingAttendance = Attendance::where('user_id', $validated['user_id'])
            ->whereDate('date', $date)
            ->first();

        if ($existingAttendance && $existingAttendance->time_in) {
            return response()->json([
                'message' => 'Time in already recorded for today.',
                'error' => 'You cannot time in again until the next day.',
                'attendance' => $existingAttendance,
            ], 409);
        }

        // Check if user is late (after 8:00 AM)
        $timeIn = \Carbon\Carbon::parse($date . ' ' . $validated['time_in']);
        $cutoff = \Carbon\Carbon::parse($date . ' 08:00');
        $isLate = $timeIn->gt($cutoff);
        $lateMinutes = $isLate ? $cutoff->diffInMinutes($timeIn) : 0;

        $attendance = Attendance::updateOrCreate(
            [
                'user_id' => $validated['user_id'],
                'date' => $date,
            ],
            [
                'branch_id' => $validated['branch_id'],
                'time_in' => $timeIn->format('H:i:s'),
                'is_late' => $isLate,
                'late_minutes' => $lateMinutes,
                'status' => $isLate ? 'late' : 'present',
            ]
        );

        // Optional debug for mobile UI (non-breaking if ignored)
        if (isset($similarity, $threshold)) {
            return response()->json([
                'attendance' => $attendance,
                'similarity' => $similarity,
                'threshold' => $threshold,
            ]);
        }

        return response()->json($attendance);
    }

    public function timeOut(Request $request, $id)
    {
        try {
            $validated = $request->validate([
                'time_out' => 'required|string',
                'face_embedding' => 'nullable|array|min:64|max:256',
                'face_embedding.*' => 'numeric',
            ]);

            $attendance = Attendance::findOrFail($id);

            $authUser = $request->user();
            if ((int) $attendance->user_id !== (int) $authUser->id) {
                return response()->json(['message' => 'Unauthorized attendance action.', 'error' => 'not your record'], 403);
            }

            $authRole = strtolower((string) ($authUser->role ?? ''));
            if ($authRole === 'staff') {
                $template = UserFaceTemplate::where('user_id', $authUser->id)
                    ->where('is_active', true)
                    ->first();
                if (! $template) {
                    return response()->json([
                        'message' => 'Register your face first before time in/out.',
                        'code' => 'FACE_NOT_ENROLLED',
                    ], 422);
                }
                if ((int) ($template->embedding_dim ?? 0) < 64) {
                    return response()->json([
                        'message' => 'Old face template detected. Please register again for high-accuracy face recognition.',
                        'code' => 'FACE_TEMPLATE_WEAK',
                    ], 422);
                }
                if (! is_array($request->input('face_embedding')) || count($request->input('face_embedding')) < 8) {
                    return response()->json([
                        'message' => 'Face verification required.',
                        'code' => 'FACE_EMBEDDING_REQUIRED',
                    ], 422);
                }
                $probe = array_map('floatval', $request->input('face_embedding'));
                if (count($probe) < 64) {
                    return response()->json([
                        'message' => 'High-accuracy face descriptor required. Please keep the app open and try again.',
                        'code' => 'FACE_STRONG_EMBEDDING_REQUIRED',
                    ], 422);
                }
                if (count($probe) !== count($template->embedding)) {
                    return response()->json([
                        'message' => 'Face template outdated. Please re-register your face.',
                        'code' => 'FACE_DIM_MISMATCH',
                    ], 422);
                }
                $threshold = FaceTemplateMatcher::threshold();
                $similarity = FaceTemplateMatcher::cosineSimilarity($template->embedding, $probe);
                if ($similarity < $threshold) {
                    \Log::warning('[ATTENDANCE] Face mismatch on time-out', ['user_id' => $authUser->id]);

                    return response()->json([
                        'message' => 'Face not recognized. Time out denied.',
                        'code' => 'FACE_MISMATCH',
                        'similarity' => $similarity,
                        'threshold' => $threshold,
                    ], 422);
                }
            }

            if (!$attendance->time_in) {
                return response()->json([
                    'message' => 'Time in is required before time out.',
                    'error' => 'Please time in first.',
                ], 422);
            }

            if ($attendance->time_out) {
                return response()->json([
                    'message' => 'Time out already recorded for today.',
                    'error' => 'You cannot time out again for the same attendance record.',
                    'attendance' => $attendance,
                ], 409);
            }

            $timeIn = \Carbon\Carbon::parse($attendance->time_in);
            $timeOut = \Carbon\Carbon::parse($timeIn->toDateString() . ' ' . $validated['time_out']);

            if ($timeOut->lt($timeIn)) {
                $timeOut->addDay();
            }

            $minutesWorked = $timeIn->diffInMinutes($timeOut);
            $hoursWorked = round($minutesWorked / 60, 2);
            $status = $attendance->is_late ? 'completed_late' : 'completed';

            $attendance->update([
                'time_out' => $timeOut->format('H:i:s'),
                'hours_worked' => $hoursWorked,
                'status' => $status,
            ]);

            if (isset($similarity, $threshold)) {
                return response()->json([
                    'attendance' => $attendance,
                    'similarity' => $similarity,
                    'threshold' => $threshold,
                ]);
            }

            return response()->json($attendance);
        } catch (\Exception $e) {
            \Log::error('TimeOut error: ' . $e->getMessage(), [
                'id' => $id,
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json([
                'message' => 'Failed to record time out',
                'error' => $e->getMessage(),
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

        // Bulk-load deductions & incentives for the month (avoid N+1 inside loop).
        $month = Carbon::parse($validated['date'])->month;
        $year = Carbon::parse($validated['date'])->year;
        $userIds = $attendance->pluck('user_id')->unique()->filter()->values();

        $deductionsByUser = StaffDeduction::whereIn('user_id', $userIds)
            ->where('month', $month)
            ->where('year', $year)
            ->get()
            ->keyBy('user_id');

        $incentivesByUser = StaffIncentive::whereIn('user_id', $userIds)
            ->where('month', $month)
            ->where('year', $year)
            ->get()
            ->keyBy('user_id');

        foreach ($attendance as $record) {
            $assignment = $record->user->branchAssignments->first();
            $dailyRate = $assignment ? $assignment->daily_rate : 500;

            // Calculate hours worked
            if ($record->time_in && $record->time_out) {
                $timeIn = \Carbon\Carbon::parse($record->time_in);
                $timeOut = \Carbon\Carbon::parse($record->time_out);
                $hoursWorked = $timeIn->diffInHours($timeOut);
            } else {
                $hoursWorked = 0;
            }

            // Calculate earnings
            if ($hoursWorked <= 8) {
                $dailyEarnings = ($hoursWorked / 8) * $dailyRate;
            } else {
                $overtimeHours = $hoursWorked - 8;
                $overtimeRate = ($dailyRate / 8) * 1.25;
                $dailyEarnings = $dailyRate + ($overtimeHours * $overtimeRate);
            }

            // Get deductions for the month
            $deductions = $deductionsByUser->get($record->user_id);
            $incentives = $incentivesByUser->get($record->user_id);

            // Calculate daily deductions and incentives
            $dailyDeductions = 0;
            if ($deductions) {
                $dailyDeductions += ($deductions->sss / 22);
                $dailyDeductions += ($deductions->philhealth / 22);
                $dailyDeductions += ($deductions->pagibig / 22);
                $dailyDeductions += ($deductions->cash_advance / 22);
            }

            // Late deductions
            if ($record->is_late) {
                $dailyDeductions += $record->late_minutes * 5;
            }

            $dailyIncentives = 0;
            if ($incentives && $incentives->perfect_attendance && !$record->is_late) {
                $dailyIncentives += 500 / 22;
            }

            $netPay = $dailyEarnings - $dailyDeductions + $dailyIncentives;

            $payroll[] = [
                'attendance_id' => $record->id,
                'user_id' => $record->user_id,
                'user' => [
                    'id' => $record->user->id,
                    'firstname' => $record->user->firstname,
                    'lastname' => $record->user->lastname,
                ],
                'staff_name' => $record->user->firstname . ' ' . $record->user->lastname,
                'branch' => $record->branch,
                'branch_id' => $record->branch_id,
                'time_in' => $record->time_in,
                'time_out' => $record->time_out,
                'hours_worked' => $hoursWorked,
                'daily_rate' => $dailyRate,
                'daily_earnings' => $dailyEarnings,
                'deductions' => $dailyDeductions,
                'incentives' => $dailyIncentives,
                'net_pay' => $netPay,
                'is_late' => $record->is_late,
                'late_minutes' => $record->late_minutes,
            ];
        }

        return response()->json($payroll);
    }

    /**
     * Monthly payroll report endpoint to avoid "one request per day".
     * Params:
     *  - month: YYYY-MM
     *  - branch_id: optional
     */
    public function getPayrollMonthly(Request $request)
    {
        $validated = $request->validate([
            'month' => ['required', 'regex:/^\d{4}-\d{2}$/'],
            'branch_id' => 'nullable|exists:branches,id',
        ]);

        $monthStr = $validated['month'];
        $start = Carbon::createFromFormat('Y-m', $monthStr)->startOfMonth()->toDateString();
        $end = Carbon::createFromFormat('Y-m', $monthStr)->endOfMonth()->toDateString();
        $monthNum = (int) Carbon::createFromFormat('Y-m', $monthStr)->month;
        $yearNum = (int) Carbon::createFromFormat('Y-m', $monthStr)->year;

        $query = Attendance::with(['user.branchAssignments', 'branch'])
            ->whereDate('date', '>=', $start)
            ->whereDate('date', '<=', $end);

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $validated['branch_id']);
        }

        $attendance = $query->get();

        $userIds = $attendance->pluck('user_id')->unique()->filter()->values();
        $deductionsByUser = StaffDeduction::whereIn('user_id', $userIds)
            ->where('month', $monthNum)
            ->where('year', $yearNum)
            ->get()
            ->keyBy('user_id');

        $incentivesByUser = StaffIncentive::whereIn('user_id', $userIds)
            ->where('month', $monthNum)
            ->where('year', $yearNum)
            ->get()
            ->keyBy('user_id');

        $payroll = [];
        foreach ($attendance as $record) {
            $assignment = $record->user->branchAssignments->first();
            $dailyRate = $assignment ? $assignment->daily_rate : 500;

            // Calculate hours worked (keep same logic as daily endpoint to avoid behavior changes)
            if ($record->time_in && $record->time_out) {
                $timeIn = Carbon::parse($record->time_in);
                $timeOut = Carbon::parse($record->time_out);
                $hoursWorked = $timeIn->diffInHours($timeOut);
            } else {
                $hoursWorked = 0;
            }

            // Calculate earnings
            if ($hoursWorked <= 8) {
                $dailyEarnings = ($hoursWorked / 8) * $dailyRate;
            } else {
                $overtimeHours = $hoursWorked - 8;
                $overtimeRate = ($dailyRate / 8) * 1.25;
                $dailyEarnings = $dailyRate + ($overtimeHours * $overtimeRate);
            }

            $deductions = $deductionsByUser->get($record->user_id);
            $incentives = $incentivesByUser->get($record->user_id);

            // Calculate daily deductions and incentives
            $dailyDeductions = 0;
            if ($deductions) {
                $dailyDeductions += ($deductions->sss / 22);
                $dailyDeductions += ($deductions->philhealth / 22);
                $dailyDeductions += ($deductions->pagibig / 22);
                $dailyDeductions += ($deductions->cash_advance / 22);
            }

            if ($record->is_late) {
                $dailyDeductions += $record->late_minutes * 5;
            }

            $dailyIncentives = 0;
            if ($incentives && $incentives->perfect_attendance && !$record->is_late) {
                $dailyIncentives += 500 / 22;
            }

            $netPay = $dailyEarnings - $dailyDeductions + $dailyIncentives;

            $payroll[] = [
                'attendance_id' => $record->id,
                'user_id' => $record->user_id,
                'user' => [
                    'id' => $record->user->id,
                    'firstname' => $record->user->firstname,
                    'lastname' => $record->user->lastname,
                ],
                'staff_name' => $record->user->firstname . ' ' . $record->user->lastname,
                'branch' => $record->branch,
                'branch_id' => $record->branch_id,
                'date' => $record->date,
                'time_in' => $record->time_in,
                'time_out' => $record->time_out,
                'hours_worked' => $hoursWorked,
                'daily_rate' => $dailyRate,
                'daily_earnings' => $dailyEarnings,
                'deductions' => $dailyDeductions,
                'incentives' => $dailyIncentives,
                'net_pay' => $netPay,
                'is_late' => $record->is_late,
                'late_minutes' => $record->late_minutes,
            ];
        }

        return response()->json($payroll);
    }
}

