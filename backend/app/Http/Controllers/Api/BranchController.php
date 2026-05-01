<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Sale;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BranchController extends Controller
{
    public function index()
    {
        $branches = Branch::where('is_active', true)->get();
        return response()->json($branches);
    }

    public function show($id)
    {
        $branch = Branch::with(['products', 'staff'])->findOrFail($id);
        return response()->json($branch);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string',
            'code' => 'required|string|unique:branches',
            'address' => 'nullable|string',
            'phone' => 'nullable|string',
            'email' => 'nullable|email',
        ]);

        $branch = Branch::create($validated);
        return response()->json($branch, 201);
    }

    public function update(Request $request, $id)
    {
        $branch = Branch::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string',
            'address' => 'nullable|string',
            'phone' => 'nullable|string',
            'email' => 'nullable|email',
            'is_active' => 'sometimes|boolean',
        ]);

        $branch->update($validated);
        return response()->json($branch);
    }

    public function destroy($id)
    {
        $branch = Branch::findOrFail($id);
        $branch->delete();
        return response()->json(['message' => 'Branch deleted successfully']);
    }

    public function getSales(Request $request, $id)
    {
        Branch::findOrFail($id);

        $query = Sale::with(['user', 'items.product'])
            ->where('branch_id', $id);

        if ($request->has('date')) {
            $query->whereDate('sale_date', $request->date);
        }

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('sale_date', [$request->start_date, $request->end_date]);
        }

        $sales = $query->orderBy('sale_date', 'desc')->get();

        return response()->json($sales);
    }

    public function getAttendance(Request $request, $id)
    {
        Branch::findOrFail($id);

        $query = Attendance::with('user')
            ->where('branch_id', $id);

        if ($request->has('date')) {
            $query->whereDate('date', $request->date);
        }

        $attendance = $query->get();

        return response()->json($attendance);
    }

    public function getDashboardData($id)
    {
        $branch = Branch::findOrFail($id);

        $today = now()->toDateString();

        $todaySales = Sale::where('branch_id', $id)
            ->whereDate('sale_date', $today)
            ->sum('total');

        $todayAttendance = Attendance::where('branch_id', $id)
            ->whereDate('date', $today)
            ->get();

        $presentCount = $todayAttendance->filter(function ($attendance) {
            return !empty($attendance->time_in);
        })->count();

        $lowStockProducts = DB::table('product_stocks')
            ->join('products', 'product_stocks.product_id', '=', 'products.id')
            ->where('product_stocks.branch_id', $id)
            ->whereColumn('product_stocks.quantity', '<', 'product_stocks.minimum_stock')
            ->select('products.name', 'product_stocks.quantity', 'product_stocks.minimum_stock')
            ->get();

        return response()->json([
            'branch' => $branch,
            'today_sales' => $todaySales,
            'present_staff' => $presentCount,
            'total_staff' => $branch->staff->count(),
            'low_stock_products' => $lowStockProducts,
        ]);
    }
}

