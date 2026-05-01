<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Sale;
use App\Models\Attendance;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class BranchController extends Controller
{
    public function index(Request $request)
    {
        try {
            $query = Branch::query();
            
            // Filter by active status
            if ($request->has('is_active')) {
                $query->where('is_active', $request->boolean('is_active'));
            } else {
                $query->where('is_active', true);
            }
            
            // Search functionality
            if ($request->has('search')) {
                $query->where(function ($q) use ($request) {
                    $q->where('name', 'like', '%' . $request->search . '%')
                      ->orWhere('code', 'like', '%' . $request->search . '%')
                      ->orWhere('address', 'like', '%' . $request->search . '%');
                });
            }
            
            $branches = $query->get();
            
            return response()->json($branches);
            
        } catch (\Exception $e) {
            Log::error('Failed to fetch branches: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to fetch branches', 'error' => $e->getMessage()], 500);
        }
    }

    public function show($id)
    {
        try {
            $branch = Branch::with(['products' => function($query) {
                    $query->where('is_active', true);
                }, 'staff' => function($query) {
                    $query->where('role', 'staff');
                }])->findOrFail($id);
            
            // Add additional stats
            $branch->total_products = $branch->products->count();
            $branch->total_staff = $branch->staff->count();
            
            return response()->json($branch);
            
        } catch (\Exception $e) {
            Log::error('Failed to fetch branch: ' . $e->getMessage());
            return response()->json(['message' => 'Branch not found'], 404);
        }
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'required|string|unique:branches|max:50',
            'address' => 'nullable|string',
            'phone' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
        ]);
        
        DB::beginTransaction();
        
        try {
            $branch = Branch::create($validated);
            DB::commit();
            
            Log::info('Branch created successfully', ['branch_id' => $branch->id, 'code' => $branch->code]);
            
            return response()->json([
                'message' => 'Branch created successfully',
                'branch' => $branch
            ], 201);
            
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Failed to create branch: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to create branch', 'error' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $id)
    {
        $branch = Branch::findOrFail($id);
        
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'code' => 'sometimes|string|unique:branches,code,' . $id . '|max:50',
            'address' => 'nullable|string',
            'phone' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
            'is_active' => 'sometimes|boolean',
        ]);
        
        DB::beginTransaction();
        
        try {
            $branch->update($validated);
            DB::commit();
            
            Log::info('Branch updated successfully', ['branch_id' => $branch->id]);
            
            return response()->json([
                'message' => 'Branch updated successfully',
                'branch' => $branch
            ]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Failed to update branch: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to update branch', 'error' => $e->getMessage()], 500);
        }
    }

    public function destroy($id)
    {
        $branch = Branch::findOrFail($id);
        
        DB::beginTransaction();
        
        try {
            // Check if branch has related records
            $hasSales = Sale::where('branch_id', $id)->exists();
            $hasAttendance = Attendance::where('branch_id', $id)->exists();
            $hasStaff = User::whereHas('branchAssignments', function($query) use ($id) {
                $query->where('branch_id', $id);
            })->exists();
            
            if ($hasSales || $hasAttendance || $hasStaff) {
                // Soft delete by deactivating instead of hard delete
                $branch->update(['is_active' => false]);
                $message = 'Branch deactivated successfully (has existing records)';
            } else {
                $branch->delete();
                $message = 'Branch deleted successfully';
            }
            
            DB::commit();
            
            Log::warning('Branch deleted/deactivated', ['branch_id' => $id, 'method' => $hasSales ? 'deactivated' : 'deleted']);
            
            return response()->json(['message' => $message]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Failed to delete branch: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to delete branch', 'error' => $e->getMessage()], 500);
        }
    }

    public function getSales(Request $request, $id)
    {
        try {
            $branch = Branch::findOrFail($id);
            
            $query = Sale::with(['user', 'items.product'])
                ->where('branch_id', $id);
            
            if ($request->has('date')) {
                $query->whereDate('sale_date', $request->date);
            }
            
            if ($request->has('start_date') && $request->has('end_date')) {
                $endDate = date('Y-m-d 23:59:59', strtotime($request->end_date));
                $query->whereBetween('sale_date', [$request->start_date, $endDate]);
            }
            
            // Add pagination
            $perPage = $request->get('per_page', 15);
            $sales = $query->orderBy('sale_date', 'desc')->paginate($perPage);
            
            // Add summary
            $summary = [
                'total_sales' => $query->get()->sum('total'),
                'total_transactions' => $query->count(),
                'average_sale' => $query->avg('total'),
                'total_items_sold' => $query->get()->sum(function($sale) {
                    return $sale->items->sum('quantity');
                })
            ];
            
            return response()->json([
                'branch' => $branch,
                'summary' => $summary,
                'sales' => $sales
            ]);
            
        } catch (\Exception $e) {
            Log::error('Failed to fetch branch sales: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to fetch sales', 'error' => $e->getMessage()], 500);
        }
    }

    public function getAttendance(Request $request, $id)
    {
        try {
            $branch = Branch::findOrFail($id);
            
            $query = Attendance::with('user')
                ->where('branch_id', $id);
            
            if ($request->has('date')) {
                $query->whereDate('date', $request->date);
            }
            
            if ($request->has('start_date') && $request->has('end_date')) {
                $query->whereBetween('date', [$request->start_date, $request->end_date]);
            }
            
            if ($request->has('user_id')) {
                $query->where('user_id', $request->user_id);
            }
            
            $perPage = $request->get('per_page', 15);
            $attendance = $query->orderBy('date', 'desc')->paginate($perPage);
            
            // Add summary
            $summary = [
                'total_records' => $query->count(),
                'present_today' => Attendance::where('branch_id', $id)
                    ->whereDate('date', now()->toDateString())
                    ->where('status', 'present')
                    ->count(),
                'late_today' => Attendance::where('branch_id', $id)
                    ->whereDate('date', now()->toDateString())
                    ->where('is_late', true)
                    ->count(),
                'average_hours_worked' => $query->avg('hours_worked')
            ];
            
            return response()->json([
                'branch' => $branch,
                'summary' => $summary,
                'attendance' => $attendance
            ]);
            
        } catch (\Exception $e) {
            Log::error('Failed to fetch branch attendance: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to fetch attendance', 'error' => $e->getMessage()], 500);
        }
    }

    public function getDashboardData($id)
    {
        try {
            $branch = Branch::findOrFail($id);
            
            $today = now()->toDateString();
            $startOfWeek = now()->startOfWeek()->toDateString();
            $startOfMonth = now()->startOfMonth()->toDateString();
            
            // Today's sales
            $todaySales = Sale::where('branch_id', $id)
                ->whereDate('sale_date', $today)
                ->sum('total');
            
            // Week sales
            $weekSales = Sale::where('branch_id', $id)
                ->whereDate('sale_date', '>=', $startOfWeek)
                ->sum('total');
            
            // Month sales
            $monthSales = Sale::where('branch_id', $id)
                ->whereDate('sale_date', '>=', $startOfMonth)
                ->sum('total');
            
            // Today's attendance
            $todayAttendance = Attendance::where('branch_id', $id)
                ->whereDate('date', $today)
                ->get();
            
            $presentCount = $todayAttendance->filter(function ($attendance) {
                return !empty($attendance->time_in);
            })->count();
            $lateCount = $todayAttendance->where('is_late', true)->count();
            $absentCount = $todayAttendance->where('status', 'absent')->count();
            
            // Total staff count
            $totalStaff = User::whereHas('branchAssignments', function($query) use ($id) {
                $query->where('branch_id', $id)->where('is_active', true);
            })->where('role', 'staff')->count();
            
            // Low stock products
            $lowStockProducts = DB::table('product_stocks')
                ->join('products', 'product_stocks.product_id', '=', 'products.id')
                ->where('product_stocks.branch_id', $id)
                ->where('products.is_active', true)
                ->whereColumn('product_stocks.quantity', '<', 'product_stocks.minimum_stock')
                ->select(
                    'products.id',
                    'products.name', 
                    'products.sku',
                    'product_stocks.quantity', 
                    'product_stocks.minimum_stock'
                )
                ->get();
            
            // Add needed quantity
            foreach ($lowStockProducts as $product) {
                $product->needed_quantity = $product->minimum_stock - $product->quantity;
            }
            
            // Top selling products this month
            $topProducts = DB::table('sale_items')
                ->join('products', 'sale_items.product_id', '=', 'products.id')
                ->join('sales', 'sale_items.sale_id', '=', 'sales.id')
                ->where('sales.branch_id', $id)
                ->whereDate('sales.sale_date', '>=', $startOfMonth)
                ->select(
                    'products.id',
                    'products.name',
                    DB::raw('SUM(sale_items.quantity) as total_quantity'),
                    DB::raw('SUM(sale_items.total) as total_revenue')
                )
                ->groupBy('products.id', 'products.name')
                ->orderBy('total_quantity', 'desc')
                ->limit(5)
                ->get();
            
            // Recent sales
            $recentSales = Sale::with('user')
                ->where('branch_id', $id)
                ->orderBy('created_at', 'desc')
                ->limit(10)
                ->get();
            
            return response()->json([
                'branch' => [
                    'id' => $branch->id,
                    'name' => $branch->name,
                    'code' => $branch->code,
                    'address' => $branch->address,
                    'phone' => $branch->phone,
                    'email' => $branch->email
                ],
                'sales' => [
                    'today' => (float) $todaySales,
                    'this_week' => (float) $weekSales,
                    'this_month' => (float) $monthSales,
                ],
                'attendance' => [
                    'present_staff' => $presentCount,
                    'late_staff' => $lateCount,
                    'absent_staff' => $absentCount,
                    'total_staff' => $totalStaff,
                    'attendance_rate' => $totalStaff > 0 ? round(($presentCount / $totalStaff) * 100, 2) : 0
                ],
                'inventory' => [
                    'low_stock_count' => $lowStockProducts->count(),
                    'low_stock_products' => $lowStockProducts
                ],
                'top_products' => $topProducts,
                'recent_sales' => $recentSales,
                'last_updated' => now()->toDateTimeString()
            ]);
            
        } catch (\Exception $e) {
            Log::error('Failed to fetch dashboard data: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to fetch dashboard data', 'error' => $e->getMessage()], 500);
        }
    }
    
    // Additional helper method to get branch stats
    public function getStats($id)
    {
        try {
            $branch = Branch::findOrFail($id);
            
            $stats = [
                'total_products' => DB::table('product_stocks')
                    ->where('branch_id', $id)
                    ->count(),
                'total_staff' => User::whereHas('branchAssignments', function($query) use ($id) {
                    $query->where('branch_id', $id);
                })->count(),
                'total_sales_today' => Sale::where('branch_id', $id)
                    ->whereDate('sale_date', today())
                    ->count(),
                'total_sales_month' => Sale::where('branch_id', $id)
                    ->whereMonth('sale_date', now()->month)
                    ->count(),
                'revenue_today' => Sale::where('branch_id', $id)
                    ->whereDate('sale_date', today())
                    ->sum('total'),
                'revenue_month' => Sale::where('branch_id', $id)
                    ->whereMonth('sale_date', now()->month)
                    ->sum('total')
            ];
            
            return response()->json($stats);
            
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to fetch stats'], 500);
        }
    }
}
