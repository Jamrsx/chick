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

    public function store(Request $request)
    {
        $validated = $request->validate([
            'branch_id' => 'required|exists:branches,id',
            'user_id' => 'required|exists:users,id',
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

            $tax = $subtotal * 0.12; // 12% VAT
            $total = $subtotal + $tax;
            $change = $validated['cash_collected'] - $total;
            $invoiceNumber = 'INV-' . date('Ymd') . '-' . str_pad(Sale::count() + 1, 4, '0', STR_PAD_LEFT);

            $sale = Sale::create([
                'invoice_number' => $invoiceNumber,
                'branch_id' => $validated['branch_id'],
                'user_id' => $validated['user_id'],
                'sale_date' => now(),
                'subtotal' => $subtotal,
                'tax' => $tax,
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

