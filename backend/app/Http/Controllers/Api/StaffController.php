<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StaffAssignment;
use App\Models\User;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class StaffController extends Controller
{
    public function index(Request $request)
    {
        $query = User::where('role', 'staff');

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

        $staff = $query->with(['branchAssignments.branch'])->get();

        return response()->json($staff);
    }

    public function store(Request $request)
    {
        // Treat empty password from frontend as null (optional field).
        if ($request->input('password') === '') {
            $request->merge(['password' => null]);
        }
        if ($request->input('email') === '') {
            $request->merge(['email' => null]);
        }

        $validated = $request->validate([
            'username' => 'required|string|unique:users',
            'password' => 'nullable|string|min:6',
            'email' => 'nullable|email|unique:users,email',
            'firstname' => 'required|string',
            'lastname' => 'required|string',
            'middlename' => 'nullable|string',
            'address' => 'nullable|string',
            'branch_id' => 'nullable|exists:branches,id',
            'position' => 'nullable|string',
            'daily_rate' => 'nullable|numeric|min:0',
        ]);

        $plainPassword = $validated['password'] ?? 'default123';
        $validated['password'] = Hash::make($plainPassword);
        $validated['role'] = 'staff';
        $validated['is_active'] = true;
        // Keep compatibility with schemas where email is non-null & unique.
        $validated['email'] = $validated['email'] ?? ($validated['username'] . '@newmoon.local');

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

            return response()->json($staff->load('branchAssignments'), 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to create staff', 'error' => $e->getMessage()], 500);
        }
    }

    public function show($id)
    {
        try {
            $staff = User::where('role', 'staff')
                ->with(['branchAssignments.branch'])
                ->findOrFail($id);

            return response()->json($staff);
        } catch (ModelNotFoundException $e) {
            return response()->json(['message' => 'Staff member not found'], 404);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Unable to load staff data',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function update(Request $request, $id)
    {
        $staff = User::findOrFail($id);

        $validated = $request->validate([
            'firstname' => 'sometimes|string',
            'lastname' => 'sometimes|string',
            'middlename' => 'nullable|string',
            'address' => 'nullable|string',
            'branch_id' => 'nullable|exists:branches,id',
            'position' => 'nullable|string',
            'daily_rate' => 'nullable|numeric|min:0',
            'is_active' => 'sometimes|boolean',
        ]);

        $staff->update($validated);

        if ($request->has('branch_id') || $request->has('position') || $request->has('daily_rate')) {
            $assignment = StaffAssignment::where('user_id', $id)->first();

            if ($assignment) {
                $assignment->update([
                    'branch_id' => $request->branch_id ?? $assignment->branch_id,
                    'position' => $request->position ?? $assignment->position,
                    'daily_rate' => $request->daily_rate ?? $assignment->daily_rate,
                ]);
            } elseif ($request->branch_id) {
                StaffAssignment::create([
                    'user_id' => $id,
                    'branch_id' => $request->branch_id,
                    'position' => $request->position ?? 'Staff',
                    'daily_rate' => $request->daily_rate ?? 500,
                    'is_active' => true,
                ]);
            }
        }

        return response()->json($staff->load('branchAssignments'));
    }

    public function destroy($id)
    {
        $staff = User::findOrFail($id);
        $staff->delete();
        return response()->json(['message' => 'Staff deleted successfully']);
    }
}

