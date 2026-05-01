<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StaffAssignment;
use Illuminate\Http\Request;

class StaffAssignmentController extends Controller
{
    public function index(Request $request)
    {
        $query = StaffAssignment::with(['user', 'branch']);

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN));
        }

        return response()->json($query->latest()->get());
    }

    public function getUserAssignment($userId)
    {
        $assignment = StaffAssignment::with('branch')
            ->where('user_id', $userId)
            ->where('is_active', true)
            ->latest()
            ->first();

        if (!$assignment) {
            return response()->json([
                'message' => 'No active branch assignment found for this staff member.',
            ], 404);
        }

        return response()->json($assignment);
    }
}
