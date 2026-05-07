<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\ProductStockDelivery;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProductController extends Controller
{
    public function index()
    {
        $products = Product::with(['stocks.branch', 'deliveries.branch'])
            ->where('is_active', true)
            ->get();

        // Frontend/mobile expect `product_stocks`
        $products = $products->map(function ($p) {
            $p->product_stocks = $p->stocks;
            // New: pending/received delivery rows for "ongoing stocks"
            $p->ongoing_stocks = $p->deliveries;
            return $p;
        });

        return response()->json($products);
    }

    public function show($id)
    {
        $product = Product::with(['stocks.branch', 'deliveries.branch'])->findOrFail($id);
        $product->product_stocks = $product->stocks;
        $product->ongoing_stocks = $product->deliveries;
        return response()->json($product);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string',
            'price' => 'required|numeric|min:0',
            'description' => 'nullable|string',
            'sku' => 'nullable|string|unique:products,sku',
            'category' => 'nullable|string',
            'branches' => 'sometimes|array',
            'branches.*' => 'exists:branches,id',
        ]);

        DB::beginTransaction();
        try {
            // `products.sku` is non-nullable in the DB schema, so ensure a value.
            $sku = $validated['sku'] ?? null;
            if (!$sku) {
                $base = Str::upper(Str::slug($validated['name'], '-'));
                $base = $base !== '' ? $base : 'PRODUCT';

                // Keep SKU reasonably short and unique-ish.
                $base = Str::limit($base, 24, '');
                $candidate = $base;
                $i = 1;
                while (Product::where('sku', $candidate)->exists()) {
                    $suffix = '-' . $i;
                    $candidate = Str::limit($base, 24 - strlen($suffix), '') . $suffix;
                    $i++;
                }
                $sku = $candidate;
            }

            $product = Product::create([
                'name' => $validated['name'],
                'price' => $validated['price'],
                'description' => $validated['description'] ?? null,
                'sku' => $sku,
                'category' => $validated['category'] ?? null,
                'is_active' => true,
            ]);

            if (!empty($validated['branches'])) {
                foreach ($validated['branches'] as $branchId) {
                    ProductStock::create([
                        'product_id' => $product->id,
                        'branch_id' => $branchId,
                        'quantity' => 0,
                        'minimum_stock' => 0,
                    ]);
                }
            }

            DB::commit();

            $product->load(['stocks.branch', 'deliveries.branch']);
            $product->product_stocks = $product->stocks;
            $product->ongoing_stocks = $product->deliveries;
            return response()->json($product, 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to create product', 'error' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string',
            'price' => 'sometimes|numeric|min:0',
            'description' => 'nullable|string',
            'sku' => 'nullable|string|unique:products,sku,' . $product->id,
            'category' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
        ]);

        $product->update($validated);
        $product->load(['stocks.branch', 'deliveries.branch']);
        $product->product_stocks = $product->stocks;
        $product->ongoing_stocks = $product->deliveries;
        return response()->json($product);
    }

    public function destroy($id)
    {
        $product = Product::findOrFail($id);
        $product->delete();
        return response()->json(['message' => 'Product deleted successfully']);
    }

    public function restock(Request $request, $id)
    {
        $validated = $request->validate([
            'branch_id' => 'required|exists:branches,id',
            'quantity' => 'required|integer|min:1',
        ]);

        // Restock represents "incoming stock" and must NOT immediately affect sellable inventory.
        // Insert a pending delivery row.
        $delivery = ProductStockDelivery::create([
            'product_id' => (int) $id,
            'branch_id' => $validated['branch_id'],
            'quantity' => $validated['quantity'],
            'restocked_at' => \Carbon\Carbon::now('Asia/Manila'),
            'received_at' => null,
            'received_by' => null,
        ]);

        return response()->json(['message' => 'Restocked successfully', 'delivery' => $delivery]);
    }

    public function getLowStock()
    {
        $rows = ProductStock::with('product')
            ->whereColumn('quantity', '<', 'minimum_stock')
            ->get();

        return response()->json($rows);
    }

    public function toggleReceived(Request $request, $id)
    {
        $validated = $request->validate([
            'branch_id' => 'required|exists:branches,id',
        ]);

        // Receive ALL pending deliveries for this product+branch.
        $pending = ProductStockDelivery::where('product_id', (int) $id)
            ->where('branch_id', $validated['branch_id'])
            ->whereNull('received_at')
            ->get();

        if ($pending->isEmpty()) {
            return response()->json(['message' => 'No pending stock to receive'], 200);
        }

        $now = \Carbon\Carbon::now('Asia/Manila');
        $receiverId = $request->user()?->id;
        $totalQty = (int) $pending->sum('quantity');

        DB::beginTransaction();
        try {
            // Ensure current stock row exists, then add received quantity.
            $stock = ProductStock::firstOrCreate(
                ['product_id' => (int) $id, 'branch_id' => $validated['branch_id']],
                ['quantity' => 0, 'minimum_stock' => 0]
            );

            $stock->increment('quantity', $totalQty);
            $stock->restocked_at = $now;
            $stock->save();

            ProductStockDelivery::where('product_id', (int) $id)
                ->where('branch_id', $validated['branch_id'])
                ->whereNull('received_at')
                ->update([
                    'received_at' => $now,
                    'received_by' => $receiverId,
                ]);

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to receive stock', 'error' => $e->getMessage()], 500);
        }

        return response()->json([
            'message' => 'Stock marked as received',
            'received_count' => $pending->count(),
            'received_quantity' => $totalQty,
        ]);
    }
}

