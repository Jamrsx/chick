<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\StaffAssignment;
use App\Models\Branch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;

class StaffController extends Controller
{
    public function index(Request $request)
    {
        $query = User::where('role', 'staff')->with(['branchAssignments.branch']);
        
        if ($request->has('branch_id')) {
            $query->whereHas('branchAssignments', function ($q) use ($request) {
                $q->where('branch_id', $request->branch_id);
            });
        }
        
        if ($request->has('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('firstname', 'like', '%' . $request->search . '%')
                  ->orWhere('lastname', 'like', '%' . $request->search . '%')
                  ->orWhere('username', 'like', '%' . $request->search . '%');
            });
        }
        
        $staff = $query->get();
        
        return response()->json($staff);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'username' => 'required|string|unique:users',
            'password' => 'required|string|min:6',
            'firstname' => 'required|string',
            'lastname' => 'required|string',
            'middlename' => 'nullable|string',
            'address' => 'nullable|string',
            'branch_id' => 'nullable|exists:branches,id',
            'position' => 'nullable|string',
            'daily_rate' => 'nullable|numeric|min:0',
        ]);
        
        $validated['password'] = Hash::make($validated['password']);
        $validated['role'] = 'staff';
        
        DB::beginTransaction();
        
        try {
            $staff = User::create($validated);
            
            if ($request->has('branch_id') && $request->branch_id) {
                StaffAssignment::create([
                    'user_id' => $staff->id,
                    'branch_id' => $request->branch_id,
                    'position' => $request->position ?? 'Staff',
                    'daily_rate' => $request->daily_rate ?? 500,
                    'is_active' => true,
                ]);
            }
            
            DB::commit();
            
            // Load relationships before returning
            return response()->json($staff->load('branchAssignments.branch'), 201);
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Staff creation failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to create staff', 'error' => $e->getMessage()], 500);
        }
    }

    // Add this method to get staff with assignments
    public function show($id)
    {
        try {
            $staff = User::where('role', 'staff')
                ->with(['branchAssignments.branch'])
                ->findOrFail($id);
            
            return response()->json($staff);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Staff not found'], 404);
        }
    }

    // Add this method to get current authenticated user
    public function me(Request $request)
    {
        try {
            $user = $request->user();
            
            if ($user->role === 'staff') {
                $user->load(['branchAssignments.branch']);
            }
            
            return response()->json($user);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to get user data'], 500);
        }
    }
}