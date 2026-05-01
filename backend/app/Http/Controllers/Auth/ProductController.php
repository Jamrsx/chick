<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductStock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $query = Product::with(['stocks.branch'])->where('is_active', true);
        
        // Add search functionality
        if ($request->has('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('name', 'like', '%' . $request->search . '%')
                  ->orWhere('sku', 'like', '%' . $request->search . '%')
                  ->orWhere('category', 'like', '%' . $request->search . '%');
            });
        }
        
        // Filter by category
        if ($request->has('category')) {
            $query->where('category', $request->category);
        }
        
        // Filter by branch stock
        if ($request->has('branch_id')) {
            $query->whereHas('stocks', function ($q) use ($request) {
                $q->where('branch_id', $request->branch_id);
            });
        }
        
        $products = $query->get();

        // Frontend/mobile expect `product_stocks`
        $products = $products->map(function ($p) {
            $p->product_stocks = $p->stocks;
            return $p;
        });

        return response()->json($products);
    }

    public function show($id)
    {
        $product = Product::with(['stocks.branch'])->findOrFail($id);
        $product->product_stocks = $product->stocks;
        return response()->json($product);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'price' => 'required|numeric|min:0',
            'description' => 'nullable|string',
            'sku' => 'nullable|string|unique:products,sku|max:50',
            'category' => 'nullable|string|max:100',
            'branches' => 'sometimes|array',
            'branches.*' => 'exists:branches,id',
        ]);

        DB::beginTransaction();
        
        try {
            // Generate SKU if not provided
            $sku = $validated['sku'] ?? null;
            if (!$sku) {
                $base = Str::upper(Str::slug($validated['name'], '-'));
                $base = $base !== '' ? $base : 'PRODUCT';
                
                // Keep SKU reasonably short and unique
                $base = Str::limit($base, 20, '');
                $candidate = $base;
                $counter = 1;
                
                while (Product::where('sku', $candidate)->exists()) {
                    $suffix = '-' . $counter;
                    $maxLength = 50 - strlen($suffix);
                    $truncatedBase = Str::limit($base, $maxLength, '');
                    $candidate = $truncatedBase . $suffix;
                    $counter++;
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

            // Create stock entries for selected branches
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

            $product->load(['stocks.branch']);
            $product->product_stocks = $product->stocks;
            
            return response()->json([
                'message' => 'Product created successfully',
                'product' => $product
            ], 201);
            
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Product creation failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to create product', 
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);
        
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'price' => 'sometimes|numeric|min:0',
            'description' => 'nullable|string',
            'sku' => 'nullable|string|unique:products,sku,' . $product->id . '|max:50',
            'category' => 'nullable|string|max:100',
            'is_active' => 'sometimes|boolean',
        ]);

        DB::beginTransaction();
        
        try {
            $product->update($validated);
            DB::commit();
            
            $product->load(['stocks.branch']);
            $product->product_stocks = $product->stocks;
            
            return response()->json([
                'message' => 'Product updated successfully',
                'product' => $product
            ]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Product update failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to update product',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function destroy($id)
    {
        $product = Product::findOrFail($id);
        
        DB::beginTransaction();
        
        try {
            // Check if product has any sales before deleting
            $hasSales = \App\Models\SaleItem::where('product_id', $id)->exists();
            
            if ($hasSales) {
                // Soft delete or just deactivate instead of hard delete
                $product->update(['is_active' => false]);
                $message = 'Product deactivated successfully (has existing sales)';
            } else {
                // Delete stock entries first
                ProductStock::where('product_id', $id)->delete();
                $product->delete();
                $message = 'Product deleted successfully';
            }
            
            DB::commit();
            
            return response()->json(['message' => $message]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Product deletion failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to delete product',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function restock(Request $request, $id)
    {
        $validated = $request->validate([
            'branch_id' => 'required|exists:branches,id',
            'quantity' => 'required|integer|min:1',
            'notes' => 'nullable|string', // Optional notes for restock
        ]);

        DB::beginTransaction();
        
        try {
            $product = Product::findOrFail($id);
            
            $stock = ProductStock::firstOrCreate(
                ['product_id' => $id, 'branch_id' => $validated['branch_id']],
                ['quantity' => 0, 'minimum_stock' => 0]
            );

            $oldQuantity = $stock->quantity;
            $stock->increment('quantity', $validated['quantity']);
            
            // You could log this restock action in a separate table
            \Log::info('Product restocked', [
                'product_id' => $id,
                'product_name' => $product->name,
                'branch_id' => $validated['branch_id'],
                'old_quantity' => $oldQuantity,
                'added_quantity' => $validated['quantity'],
                'new_quantity' => $stock->quantity,
                'notes' => $validated['notes'] ?? null
            ]);
            
            DB::commit();
            
            return response()->json([
                'message' => 'Restocked successfully',
                'stock' => $stock,
                'product' => [
                    'id' => $product->id,
                    'name' => $product->name,
                    'sku' => $product->sku
                ]
            ]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Restock failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to restock product',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getLowStock(Request $request)
    {
        $query = ProductStock::with(['product', 'branch'])
            ->whereColumn('quantity', '<', 'minimum_stock');
        
        // Filter by branch
        if ($request->has('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }
        
        // Only get active products
        $query->whereHas('product', function ($q) {
            $q->where('is_active', true);
        });
        
        $lowStockItems = $query->get();
        
        // Add calculated fields
        $lowStockItems = $lowStockItems->map(function ($item) {
            $item->needed_quantity = $item->minimum_stock - $item->quantity;
            $item->stock_status = $item->quantity <= 0 ? 'out_of_stock' : 'low_stock';
            return $item;
        });
        
        return response()->json([
            'count' => $lowStockItems->count(),
            'items' => $lowStockItems
        ]);
    }
    
    // Additional helper method to get stock by branch
    public function getStockByBranch($productId, $branchId)
    {
        $product = Product::findOrFail($productId);
        $stock = ProductStock::where('product_id', $productId)
            ->where('branch_id', $branchId)
            ->first();
        
        if (!$stock) {
            return response()->json([
                'message' => 'No stock record found for this product at the specified branch',
                'quantity' => 0,
                'minimum_stock' => 0
            ]);
        }
        
        return response()->json([
            'product' => [
                'id' => $product->id,
                'name' => $product->name,
                'sku' => $product->sku,
                'price' => $product->price
            ],
            'branch_id' => $branchId,
            'quantity' => $stock->quantity,
            'minimum_stock' => $stock->minimum_stock,
            'needs_restock' => $stock->quantity < $stock->minimum_stock,
            'needed_quantity' => max(0, $stock->minimum_stock - $stock->quantity)
        ]);
    }
    
    // Update minimum stock level
    public function updateMinimumStock(Request $request, $id)
    {
        $validated = $request->validate([
            'branch_id' => 'required|exists:branches,id',
            'minimum_stock' => 'required|integer|min:0',
        ]);
        
        DB::beginTransaction();
        
        try {
            $stock = ProductStock::firstOrCreate(
                ['product_id' => $id, 'branch_id' => $validated['branch_id']],
                ['quantity' => 0, 'minimum_stock' => $validated['minimum_stock']]
            );
            
            if ($stock->wasRecentlyCreated) {
                $message = 'Stock record created with minimum stock level';
            } else {
                $stock->minimum_stock = $validated['minimum_stock'];
                $stock->save();
                $message = 'Minimum stock level updated successfully';
            }
            
            DB::commit();
            
            return response()->json([
                'message' => $message,
                'stock' => $stock
            ]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Failed to update minimum stock: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to update minimum stock level',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}