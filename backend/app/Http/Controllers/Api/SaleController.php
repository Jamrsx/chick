<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductStock;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SaleController extends Controller
{
    public function index(Request $request)
    {
        $query = Sale::with(['user', 'branch', 'items.product']);

        if ($request->has('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }

        if ($request->has('date')) {
            $query->whereDate('sale_date', $request->date);
        }

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('sale_date', [$request->start_date, $request->end_date]);
        }

        $sales = $query->orderBy('created_at', 'desc')->get();

        return response()->json($sales);
    }

    /**
     * Lightweight endpoint for EmployeeTracker (fast, small payload).
     * Returns:
     *  - checkoutRows: transaction-level rows with itemsCount
     *  - staffAgg: per-user aggregates + topProductName
     *
     * Query params:
     *  - date (required): YYYY-MM-DD
     *  - branch_id (optional)
     */
    public function tracker(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'branch_id' => 'nullable|exists:branches,id',
        ]);

        $date = $validated['date'];
        $branchId = $validated['branch_id'] ?? null;

        $salesQuery = DB::table('sales')
            ->whereDate('sale_date', $date);

        if ($branchId) {
            $salesQuery->where('branch_id', $branchId);
        }

        // Checkout rows (transaction list) + items count
        $checkoutRows = $salesQuery
            ->leftJoin('sale_items', 'sales.id', '=', 'sale_items.sale_id')
            ->select(
                'sales.id',
                'sales.invoice_number',
                'sales.user_id',
                'sales.branch_id',
                'sales.customer_name',
                'sales.created_at',
                'sales.sale_date',
                'sales.subtotal',
                'sales.discount_amount',
                'sales.senior_discount',
                'sales.total',
                'sales.cash_collected',
                'sales.change_given',
                DB::raw('COALESCE(SUM(sale_items.quantity), 0) as items_count')
            )
            ->groupBy(
                'sales.id',
                'sales.invoice_number',
                'sales.user_id',
                'sales.branch_id',
                'sales.customer_name',
                'sales.created_at',
                'sales.sale_date',
                'sales.subtotal',
                'sales.discount_amount',
                'sales.senior_discount',
                'sales.total',
                'sales.cash_collected',
                'sales.change_given'
            )
            ->orderBy('sales.created_at', 'desc')
            ->get();

        // Per-staff aggregates
        $staffAgg = DB::table('sales')
            ->leftJoin('sale_items', 'sales.id', '=', 'sale_items.sale_id')
            ->whereDate('sales.sale_date', $date)
            ->when($branchId, fn ($q) => $q->where('sales.branch_id', $branchId))
            ->select(
                'sales.user_id',
                DB::raw('COUNT(DISTINCT sales.id) as checkout_count'),
                DB::raw('COALESCE(SUM(sale_items.quantity), 0) as total_items_sold'),
                DB::raw('COALESCE(SUM(sales.total), 0) as gross_total'),
                DB::raw('COALESCE(SUM(sales.cash_collected), 0) as cash_collected'),
                DB::raw('COALESCE(SUM(sales.change_given), 0) as change_given'),
                DB::raw('COALESCE(SUM(CASE WHEN sales.senior_discount = 1 THEN 1 ELSE 0 END), 0) as senior_discount_count'),
                DB::raw('COALESCE(SUM(CASE WHEN sales.senior_discount = 1 THEN sales.discount_amount ELSE 0 END), 0) as senior_discount_total')
            )
            ->groupBy('sales.user_id')
            ->get()
            ->keyBy('user_id');

        // Top product per staff for the day (by quantity)
        $topProducts = DB::table('sale_items')
            ->join('sales', 'sale_items.sale_id', '=', 'sales.id')
            ->join('products', 'sale_items.product_id', '=', 'products.id')
            ->whereDate('sales.sale_date', $date)
            ->when($branchId, fn ($q) => $q->where('sales.branch_id', $branchId))
            ->select(
                'sales.user_id',
                'products.name as product_name',
                DB::raw('SUM(sale_items.quantity) as qty')
            )
            ->groupBy('sales.user_id', 'products.name')
            ->orderBy('qty', 'desc')
            ->get()
            ->groupBy('user_id')
            ->map(function ($rows) {
                $first = $rows->first();
                return $first ? $first->product_name : null;
            });

        return response()->json([
            'checkoutRows' => $checkoutRows,
            'staffAgg' => $staffAgg,
            'topProducts' => $topProducts,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'branch_id' => 'required|exists:branches,id',
            'user_id' => 'required|exists:users,id',
            'customer_name' => 'nullable|string|max:255',
            'senior_discount' => 'sometimes|boolean',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
            'cash_collected' => 'required|numeric|min:0',
            'payment_method' => 'sometimes|string',
        ]);

        DB::beginTransaction();

        try {
            $subtotal = 0;
            $items = [];

            foreach ($validated['items'] as $item) {
                $product = \App\Models\Product::find($item['product_id']);
                $total = $product->price * $item['quantity'];
                $subtotal += $total;

                // Check and update stock
                $stock = ProductStock::where('product_id', $item['product_id'])
                    ->where('branch_id', $validated['branch_id'])
                    ->first();

                if (!$stock || $stock->quantity < $item['quantity']) {
                    throw new \Exception("Insufficient stock for product: {$product->name}");
                }

                $stock->decrement('quantity', $item['quantity']);

                $items[] = [
                    'product_id' => $item['product_id'],
                    'quantity' => $item['quantity'],
                    'price' => $product->price,
                    'total' => $total,
                ];
            }

            $tax = 0; // No VAT
            // Philippines Senior Citizen Discount: 20% (RA 9994)
            $isSenior = (bool) ($validated['senior_discount'] ?? false);
            $discountAmount = $isSenior ? round($subtotal * 0.20, 2) : 0;
            $total = max($subtotal - $discountAmount, 0);
            $change = $validated['cash_collected'] - $total;
            $invoiceNumber = 'INV-' . date('Ymd') . '-' . str_pad(Sale::count() + 1, 4, '0', STR_PAD_LEFT);

            $sale = Sale::create([
                'invoice_number' => $invoiceNumber,
                'branch_id' => $validated['branch_id'],
                'user_id' => $validated['user_id'],
                'customer_name' => $validated['customer_name'] ?? null,
                'senior_discount' => $isSenior,
                'sale_date' => now(),
                'subtotal' => $subtotal,
                'tax' => $tax,
                'discount_amount' => $discountAmount,
                'total' => $total,
                'cash_collected' => $validated['cash_collected'],
                'change_given' => $change,
                'payment_method' => $validated['payment_method'] ?? 'cash',
            ]);

            foreach ($items as $item) {
                SaleItem::create([
                    'sale_id' => $sale->id,
                    'product_id' => $item['product_id'],
                    'quantity' => $item['quantity'],
                    'price' => $item['price'],
                    'total' => $item['total'],
                ]);
            }

            DB::commit();

            return response()->json($sale->load('items.product'), 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Sale failed', 'error' => $e->getMessage()], 500);
        }
    }

    public function show($id)
    {
        $sale = Sale::with(['user', 'branch', 'items.product'])->findOrFail($id);
        return response()->json($sale);
    }

    public function getProductIncentives(Request $request)
    {
        \Log::info('[BACKEND] getProductIncentives called', $request->all());

        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2020',
        ]);

        \Log::info('[BACKEND] Validated:', $validated);

        // Single query: sum sale_items.quantity grouped by sales.user_id
        // for the given month/year
        $productCounts = DB::table('sale_items')
            ->join('sales', 'sale_items.sale_id', '=', 'sales.id')
            ->whereMonth('sales.sale_date', $validated['month'])
            ->whereYear('sales.sale_date', $validated['year'])
            ->select('sales.user_id', DB::raw('SUM(sale_items.quantity) as total_products_sold'))
            ->groupBy('sales.user_id')
            ->get();

        \Log::info('[BACKEND] Product counts:', $productCounts->toArray());

        // Compute incentive: every 40 products = ₱100
        $result = [];
        foreach ($productCounts as $row) {
            $totalSold = (int) $row->total_products_sold;
            $incentiveAmount = floor($totalSold / 40) * 100;

            $result[$row->user_id] = [
                'user_id' => $row->user_id,
                'total_products_sold' => $totalSold,
                'incentive_amount' => $incentiveAmount,
                'thresholds_reached' => floor($totalSold / 40),
            ];
        }

        \Log::info('[BACKEND] Final result:', $result);

        return response()->json($result);
    }

    /**
     * Get daily product sales incentives per user for a month
     * Returns sales grouped by date so frontend can show incentive on specific days
     */
    public function getDailyProductIncentives(Request $request)
    {
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2020',
        ]);

        // Get daily sales grouped by user_id and date
        $dailySales = DB::table('sale_items')
            ->join('sales', 'sale_items.sale_id', '=', 'sales.id')
            ->whereMonth('sales.sale_date', $validated['month'])
            ->whereYear('sales.sale_date', $validated['year'])
            ->select(
                'sales.user_id',
                DB::raw('DATE(sales.sale_date) as sale_date'),
                DB::raw('SUM(sale_items.quantity) as daily_quantity')
            )
            ->groupBy('sales.user_id', DB::raw('DATE(sales.sale_date)'))
            ->get();

        // Calculate running total and incentive per day
        $result = [];
        $userTotals = [];

        foreach ($dailySales as $row) {
            $userId = $row->user_id;
            $date = $row->sale_date;
            $dailyQty = (int) $row->daily_quantity;

            // Track running total per user
            if (!isset($userTotals[$userId])) {
                $userTotals[$userId] = 0;
            }
            $userTotals[$userId] += $dailyQty;

            // Calculate incentive based on running total (every 40 = ₱100)
            $incentiveAmount = floor($userTotals[$userId] / 40) * 100;

            $result[$userId][$date] = [
                'date' => $date,
                'daily_quantity' => $dailyQty,
                'running_total' => $userTotals[$userId],
                'incentive_amount' => $incentiveAmount,
            ];
        }

        return response()->json($result);
    }

    public function getSalesSummary(Request $request)
    {
        $validated = $request->validate([
            'branch_id' => 'nullable|exists:branches,id',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
        ]);

        $query = Sale::query();

        if ($request->has('branch_id')) {
            $query->where('branch_id', $validated['branch_id']);
        }

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('sale_date', [$validated['start_date'], $validated['end_date']]);
        }

        $summary = [
            'total_sales' => $query->sum('total'),
            'total_transactions' => $query->count(),
            'average_sale' => $query->avg('total'),
            'total_items_sold' => SaleItem::whereIn('sale_id', $query->pluck('id'))->sum('quantity'),
        ];

        return response()->json($summary);
    }
}

