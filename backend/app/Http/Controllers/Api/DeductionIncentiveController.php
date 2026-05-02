<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StaffDeduction;
use App\Models\StaffIncentive;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DeductionIncentiveController extends Controller
{
    /**
     * Get staff deductions for a specific month/year
     */
    public function getDeductions($userId, $month, $year)
    {
        \Log::info('[DEDUCTIONS] Fetching deductions', ['user_id' => $userId, 'month' => $month, 'year' => $year]);

        try {
            $deduction = StaffDeduction::where('user_id', $userId)
                ->where('month', $month)
                ->where('year', $year)
                ->first();

            if (!$deduction) {
                \Log::info('[DEDUCTIONS] No existing deductions found, returning defaults');
                return response()->json([
                    'deduction_record_exists' => false,
                    'sss' => 0,
                    'philhealth' => 0,
                    'pagibig' => 0,
                    'cash_advance' => 0,
                    'other_deductions' => 0,
                ]);
            }

            \Log::info('[DEDUCTIONS] Found existing deductions', ['deduction' => $deduction]);
            $payload = $deduction->toArray();
            $payload['deduction_record_exists'] = true;

            return response()->json($payload);
        } catch (\Exception $e) {
            \Log::error('[DEDUCTIONS] Failed to fetch deductions', [
                'user_id' => $userId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json(['message' => 'Failed to fetch deductions', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Get staff incentives for a specific month/year
     */
    public function getIncentives($userId, $month, $year)
    {
        \Log::info('[INCENTIVES] Fetching incentives', ['user_id' => $userId, 'month' => $month, 'year' => $year]);

        try {
            $incentive = StaffIncentive::where('user_id', $userId)
                ->where('month', $month)
                ->where('year', $year)
                ->first();

            if (!$incentive) {
                \Log::info('[INCENTIVES] No existing incentives found, returning defaults');
                return response()->json([
                    'perfect_attendance' => false,
                    'commission' => 0,
                    'other_incentives' => 0,
                ]);
            }

            \Log::info('[INCENTIVES] Found existing incentives', ['incentive' => $incentive]);
            return response()->json($incentive);
        } catch (\Exception $e) {
            \Log::error('[INCENTIVES] Failed to fetch incentives', [
                'user_id' => $userId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json(['message' => 'Failed to fetch incentives', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Store or update staff deductions
     */
    public function storeDeductions(Request $request, $userId)
    {
        \Log::info('[DEDUCTIONS] Storing deductions for user ID: ' . $userId);
        \Log::info('[DEDUCTIONS] Request data:', $request->all());

        $validated = $request->validate([
            'sss' => 'nullable|numeric|min:0',
            'philhealth' => 'nullable|numeric|min:0',
            'pagibig' => 'nullable|numeric|min:0',
            'cash_advance' => 'nullable|numeric|min:0',
            'other_deductions' => 'nullable|numeric|min:0',
            'month' => 'required|integer',
            'year' => 'required|integer',
        ]);

        try {
            $deduction = StaffDeduction::updateOrCreate(
                [
                    'user_id' => $userId,
                    'month' => $validated['month'],
                    'year' => $validated['year'],
                ],
                [
                    'sss' => $validated['sss'] ?? 0,
                    'philhealth' => $validated['philhealth'] ?? 0,
                    'pagibig' => $validated['pagibig'] ?? 0,
                    'cash_advance' => $validated['cash_advance'] ?? 0,
                    'other_deductions' => $validated['other_deductions'] ?? 0,
                ]
            );

            \Log::info('[DEDUCTIONS] Successfully saved deductions for user ID: ' . $userId, ['deduction' => $deduction]);

            return response()->json($deduction);
        } catch (\Exception $e) {
            \Log::error('[DEDUCTIONS] Failed to save deductions for user ID: ' . $userId, [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json(['message' => 'Failed to save deductions', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Store or update staff incentives
     */
    public function storeIncentives(Request $request, $userId)
    {
        \Log::info('[INCENTIVES] Storing incentives for user ID: ' . $userId);
        \Log::info('[INCENTIVES] Request data:', $request->all());

        $validated = $request->validate([
            'perfect_attendance' => 'nullable|boolean',
            'commission' => 'nullable|numeric|min:0',
            'other_incentives' => 'nullable|numeric|min:0',
            'month' => 'required|integer',
            'year' => 'required|integer',
        ]);

        try {
            $incentive = StaffIncentive::updateOrCreate(
                [
                    'user_id' => $userId,
                    'month' => $validated['month'],
                    'year' => $validated['year'],
                ],
                [
                    'perfect_attendance' => $validated['perfect_attendance'] ?? false,
                    'commission' => $validated['commission'] ?? 0,
                    'other_incentives' => $validated['other_incentives'] ?? 0,
                ]
            );

            \Log::info('[INCENTIVES] Successfully saved incentives for user ID: ' . $userId, ['incentive' => $incentive]);

            return response()->json($incentive);
        } catch (\Exception $e) {
            \Log::error('[INCENTIVES] Failed to save incentives for user ID: ' . $userId, [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json(['message' => 'Failed to save incentives', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Get all deductions/incentives for all staff in a month/year
     */
    public function getAllForMonth(Request $request)
    {
        $validated = $request->validate([
            'month' => 'required|integer',
            'year' => 'required|integer',
        ]);

        try {
            $deductions = StaffDeduction::where('month', $validated['month'])
                ->where('year', $validated['year'])
                ->with('user')
                ->get()
                ->keyBy('user_id');

            $incentives = StaffIncentive::where('month', $validated['month'])
                ->where('year', $validated['year'])
                ->with('user')
                ->get()
                ->keyBy('user_id');

            return response()->json([
                'deductions' => $deductions,
                'incentives' => $incentives,
            ]);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to fetch data', 'error' => $e->getMessage()], 500);
        }
    }
}
