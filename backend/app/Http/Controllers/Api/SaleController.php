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

