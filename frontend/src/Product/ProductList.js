import React, { useState, useEffect } from "react";
import { Tag, Button, Modal, Form, Input, InputNumber, Select, Space, message, Progress } from "antd";
import { 
  PlusOutlined, 
  ShoppingOutlined, 
  DeleteOutlined,
  BoxPlotOutlined,
  StockOutlined,
  BranchesOutlined,
  SearchOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPesoSign } from '@fortawesome/free-solid-svg-icons';
import { api } from "../config/api";
import { getCache, setCache, invalidateCache } from "../utils/cache";

const { Option } = Select;

function ProductList() {
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRestockModalVisible, setIsRestockModalVisible] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [stockQuantity, setStockQuantity] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [form] = Form.useForm();

  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      // Try to get data from cache first
      const cachedProducts = forceRefresh ? null : getCache('products');
      const cachedBranches = forceRefresh ? null : getCache('branches');

      // If all data is cached and valid, use it
      if (cachedProducts && cachedBranches) {
        setProducts(cachedProducts);
        setBranches(cachedBranches);
        setLoading(false);
        return;
      }

      // Otherwise, fetch from backend
      const [productsRes, branchesRes] = await Promise.all([
        cachedProducts ? Promise.resolve({ data: cachedProducts }) : api.get("/products"),
        cachedBranches ? Promise.resolve({ data: cachedBranches }) : api.get("/branches"),
      ]);

      const productsData = productsRes.data || [];
      const branchesData = branchesRes.data || [];

      setProducts(productsData);
      setBranches(branchesData);

      // Cache the fetched data (5 minutes TTL)
      setCache('products', productsData);
      setCache('branches', branchesData);
    } catch (error) {
      message.error("Failed to load products from backend.");
      setProducts([]);
      setBranches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update current time
  useEffect(() => {
    const updatePHTime = () => {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const phTime = new Date(utc + 8 * 60 * 60 * 1000);
      setCurrentTime(phTime);
    };

    updatePHTime();
    const timer = setInterval(updatePHTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCreateProduct = async (values) => {
    try {
      const { data } = await api.post("/products", values);
      setProducts([data, ...products]);
      
      // Invalidate cache to reflect the new product
      invalidateCache('products');
      
      message.success(`${values.name} has been created successfully.`);
      setIsCreateModalVisible(false);
      form.resetFields();
    } catch (error) {
      message.error(error?.response?.data?.message || "Failed to create product");
    }
  };

  const handleRestock = async () => {
    if (!selectedProduct || !selectedBranch || !stockQuantity) {
      message.error("Please fill in all fields");
      return;
    }

    const quantity = parseInt(stockQuantity, 10);
    if (isNaN(quantity) || quantity <= 0) {
      message.error("Please enter a valid stock quantity");
      return;
    }

    try {
      await api.post(`/products/${selectedProduct.id}/restock`, {
        branch_id: selectedBranch,
        quantity,
      });
      message.success(`Added ${quantity} units to ${selectedProduct.name}`);
      setIsRestockModalVisible(false);
      setSelectedProduct(null);
      setSelectedBranch(null);
      setStockQuantity("");
      
      // Invalidate cache to reflect the stock changes
      invalidateCache('products');
      
      loadData();
    } catch (error) {
      message.error("Failed to restock product");
    }
  };

  const handleDeleteProduct = (product) => {
    Modal.confirm({
      title: "Delete Product",
      content: `Are you sure you want to delete "${product.name}"?`,
      okText: "Delete",
      cancelText: "Cancel",
      okButtonProps: { danger: true },
      onOk: () => {
        api.delete(`/products/${product.id}`)
          .then(() => {
            setProducts(products.filter(p => p.id !== product.id));
            
            // Invalidate cache to reflect the deletion
            invalidateCache('products');
            
            message.success(`${product.name} has been deleted`);
          })
          .catch(() => message.error("Failed to delete product"));
      }
    });
  };

  const getTotalStock = (product) => {
    if (!product.product_stocks) return 0;
    return product.product_stocks.reduce((sum, stock) => sum + stock.quantity, 0);
  };

  // Filter products by search term
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group products by branch for display
  const getBranchProductStocks = () => {
    const branchMap = new Map();
    
    // Initialize all branches
    branches.forEach(branch => {
      branchMap.set(branch.id, {
        branch,
        stocks: []
      });
    });
    
    // Add product stocks to their respective branches
    filteredProducts.forEach(product => {
      if (product.product_stocks && product.product_stocks.length > 0) {
        product.product_stocks.forEach(stock => {
          if (branchMap.has(stock.branch_id)) {
            branchMap.get(stock.branch_id).stocks.push({
              ...stock,
              product
            });
          }
        });
      }
    });
    
    // Convert to array and filter out branches with no products (if search is active)
    return Array.from(branchMap.values()).filter(bp => 
      searchTerm ? bp.stocks.length > 0 : true
    );
  };

  const branchProductStocks = getBranchProductStocks();

  // Calculate statistics
  const totalProducts = products.length;
  const totalStockValue = products.reduce((sum, product) => {
    return sum + (getTotalStock(product) * product.price);
  }, 0);
  const lowStockProducts = products.filter(product => getTotalStock(product) < 20).length;
  const avgPrice = totalProducts > 0 ? products.reduce((sum, p) => sum + p.price, 0) / totalProducts : 0;

  const formatCurrency = (amount) => {
    return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header - Fixed */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Products Management</h1>
            <p className="text-gray-500 mt-1">Manage your product inventory and stock levels across all branches</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Current Philippines Time</p>
            <p className="text-lg font-semibold">
              {currentTime.toLocaleTimeString('en-PH', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-xs text-gray-400">
              {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total Products</p>
                  <p className="text-2xl font-bold text-gray-800">{totalProducts}</p>
                </div>
                <div className="bg-blue-100 rounded-full p-3">
                  <ShoppingOutlined className="text-xl text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total Stock Value</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(totalStockValue)}</p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <FontAwesomeIcon icon={faPesoSign} className="text-xl text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Average Price</p>
                  <p className="text-2xl font-bold text-orange-600">{formatCurrency(avgPrice)}</p>
                </div>
                <div className="bg-orange-100 rounded-full p-3">
                  <BoxPlotOutlined className="text-xl text-orange-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Low Stock Items</p>
                  <p className="text-2xl font-bold text-red-600">{lowStockProducts}</p>
                </div>
                <div className="bg-red-100 rounded-full p-3">
                  <StockOutlined className="text-xl text-red-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Filters and Create Button */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="flex gap-4 items-center">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Search Product</label>
                  <div className="flex items-center border border-gray-300 rounded-md px-3 py-1.5">
                    <SearchOutlined className="text-gray-400 text-sm mr-2" />
                    <input
                      type="text"
                      placeholder="Enter product name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="text-sm outline-none w-48"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <Button 
                  icon={<ReloadOutlined />}
                  onClick={() => loadData(true)}
                  size="middle"
                >
                  Refresh
                </Button>
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => setIsCreateModalVisible(true)}
                  className="bg-green-600"
                  size="middle"
                >
                  Create New Product
                </Button>
              </div>
            </div>
          </div>

          {/* Branch-Based Products Grid */}
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-4">Loading products...</p>
              </div>
            </div>
          ) : branchProductStocks.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <ShoppingOutlined className="text-6xl text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg mb-2">No products found</p>
              <p className="text-gray-400">Create your first product to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {branchProductStocks.map((branchData) => {
                const { branch, stocks } = branchData;
                const totalBranchStock = stocks.reduce((sum, s) => sum + s.quantity, 0);
                const hasProducts = stocks.length > 0;
                
                return (
                  <div key={branch.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                    {/* Branch Header */}
                    <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-100 rounded-full p-2">
                            <BranchesOutlined className="text-xl text-blue-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800">{branch.name}</h3>
                            <p className="text-sm text-gray-500">{branch.address || 'No address set'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Stock</p>
                          <p className="text-2xl font-bold text-blue-600">{totalBranchStock}</p>
                          <p className="text-xs text-gray-400">units across {stocks.length} products</p>
                        </div>
                      </div>
                    </div>

                    {/* Branch Products Table */}
                    <div className="p-0">
                      {hasProducts ? (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Level</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {stocks.map((stock) => {
                                const isLowStock = stock.quantity < 20;
                                const stockPercentage = Math.min((stock.quantity / 100) * 100, 100);
                                
                                return (
                                  <tr key={stock.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                      <div>
                                        <p className="font-medium text-gray-800">{stock.product.name}</p>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className="text-green-600 font-semibold">
                                        {formatCurrency(stock.product.price)}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="flex items-center gap-3">
                                        <span className={`font-bold ${isLowStock ? 'text-red-600' : 'text-gray-800'}`}>
                                          {stock.quantity}
                                        </span>
                                        <span className="text-xs text-gray-500">units</span>
                                      </div>
                                      <div className="w-32 mt-1">
                                        <Progress 
                                          percent={stockPercentage} 
                                          size="small" 
                                          strokeColor={isLowStock ? "#ff4d4f" : "#52c41a"}
                                          showInfo={false}
                                        />
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      {isLowStock ? (
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                          <Tag color="orange" className="text-xs">Low Stock</Tag>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                          <Tag color="green" className="text-xs">In Stock</Tag>
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <div className="flex justify-end gap-2">
                                        <Button 
                                          size="small"
                                          icon={<PlusOutlined />}
                                          onClick={() => {
                                            setSelectedProduct(stock.product);
                                            setSelectedBranch(branch.id);
                                            setIsRestockModalVisible(true);
                                          }}
                                        >
                                          Restock
                                        </Button>
                                        <Button 
                                          size="small"
                                          danger
                                          icon={<DeleteOutlined />}
                                          onClick={() => handleDeleteProduct(stock.product)}
                                        >
                                          Delete
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-400">
                          <BoxPlotOutlined className="text-5xl mb-3" />
                          <p className="text-gray-500 mb-2">No products in this branch</p>
                          <p className="text-sm text-gray-400">Add stock to products to see them here</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
            <p>Generated on {currentTime.toLocaleString()} | New Moon Inventory System</p>
          </div>
        </div>
      </div>

      {/* Create Product Modal */}
      <Modal
        title="Create New Product"
        open={isCreateModalVisible}
        onCancel={() => {
          setIsCreateModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateProduct}>
          <Form.Item
            name="name"
            label="Product Name"
            rules={[{ required: true, message: "Please enter product name" }]}
          >
            <Input placeholder="Enter product name" size="large" />
          </Form.Item>
          
          <Form.Item
            name="price"
            label="Price (₱)"
            rules={[
              { required: true, message: "Please enter product price" },
              { type: "number", min: 0, message: "Price must be greater than 0" }
            ]}
          >
            <InputNumber 
              placeholder="Enter price" 
              size="large" 
              className="w-full"
              min={0}
              step={10}
            />
          </Form.Item>

          <Form.Item
            name="branches"
            label="Select Branches"
            rules={[{ required: true, message: "Please select at least one branch" }]}
          >
            <Select
              mode="multiple"
              size="large"
              placeholder="Select branches where this product will be available"
              allowClear
              showSearch
            >
              {branches.map((branch) => (
                <Option key={branch.id} value={branch.id}>
                  <Space>
                    <BranchesOutlined />
                    {branch.name}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <div className="bg-blue-50 p-3 rounded-lg mb-4">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Product will be created with 0 stock for selected branches. 
              You can add stock later using the "Restock" button.
            </p>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button onClick={() => {
              setIsCreateModalVisible(false);
              form.resetFields();
            }}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" className="bg-green-600">
              Create Product
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Restock Modal */}
      <Modal
        title={`Restock - ${selectedProduct?.name || ""}`}
        open={isRestockModalVisible}
        onCancel={() => {
          setIsRestockModalVisible(false);
          setSelectedProduct(null);
          setSelectedBranch(null);
          setStockQuantity("");
        }}
        footer={null}
        width={450}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Branch
            </label>
            <Select
              size="large"
              placeholder="Choose a branch"
              className="w-full"
              value={selectedBranch}
              onChange={setSelectedBranch}
              showSearch
            >
              {branches.map((branch) => (
                <Option key={branch.id} value={branch.id}>
                  <Space>
                    <BranchesOutlined />
                    {branch.name}
                  </Space>
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stock Quantity (units)
            </label>
            <InputNumber
              size="large"
              placeholder="Enter stock quantity"
              className="w-full"
              min={1}
              value={stockQuantity}
              onChange={setStockQuantity}
            />
            <p className="text-xs text-gray-500 mt-1">
              Add stock units to this branch
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => {
                setIsRestockModalVisible(false);
                setSelectedProduct(null);
                setSelectedBranch(null);
                setStockQuantity("");
              }}
              className="flex-1"
              size="large"
            >
              Cancel
            </Button>
            <Button
              type="primary"
              onClick={handleRestock}
              className="flex-1 bg-green-600"
              size="large"
            >
              Add Stock
            </Button>
          </div>
        </div>
      </Modal>

      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
          .animate-pulse {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          
          /* Custom scrollbar styling */
          .overflow-y-auto::-webkit-scrollbar {
            width: 8px;
          }
          
          .overflow-y-auto::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 10px;
          }
          
          .overflow-y-auto::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 10px;
          }
          
          .overflow-y-auto::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
          
          .overflow-x-auto::-webkit-scrollbar {
            height: 6px;
          }
          
          .overflow-x-auto::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 10px;
          }
          
          .overflow-x-auto::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 10px;
          }
          
          .overflow-x-auto::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
        `}
      </style>
    </div>
  );
}

export default ProductList;
