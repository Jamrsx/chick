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

          {/* Products Grid */}
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-4">Loading products...</p>
              </div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <ShoppingOutlined className="text-6xl text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg mb-2">No products found</p>
              <p className="text-gray-400">Create your first product to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {filteredProducts.map((product) => (
                <div key={product.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                  {/* Product Header */}
                  <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800">{product.name}</h3>
                        <Tag color="green" className="mt-1 text-base font-bold">
                          {formatCurrency(product.price)}
                        </Tag>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Total Inventory</p>
                        <p className="text-2xl font-bold text-blue-600">{getTotalStock(product)}</p>
                        <p className="text-xs text-gray-400">units</p>
                      </div>
                    </div>
                  </div>

                  {/* Product Body with Horizontal Scroll */}
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <BranchesOutlined className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">Branch Stock Levels</span>
                      </div>
                      <Tag>{product.product_stocks?.length || 0} branches</Tag>
                    </div>

                    {/* Horizontal Scroll Container */}
                    <div className="overflow-x-auto pb-2">
                      <div className="flex gap-3 min-w-min">
                        {product.product_stocks?.length > 0 ? (
                          product.product_stocks.map((stock) => {
                            const stockPercentage = (stock.quantity / 100) * 100;
                            const isLowStock = stock.quantity < 20;
                            return (
                              <div key={stock.id} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors min-w-[200px] flex-shrink-0">
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${isLowStock ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                                      <span className="font-medium text-gray-700 text-sm">{stock.branch?.name || `Branch ${stock.branch_id}`}</span>
                                    </div>
                                    {isLowStock && (
                                      <Tag color="orange" className="text-xs">Low Stock</Tag>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <BoxPlotOutlined className="text-gray-400 text-sm" />
                                      <span className={`font-bold text-lg ${isLowStock ? 'text-red-600' : 'text-gray-800'}`}>{stock.quantity}</span>
                                      <span className="text-xs text-gray-500">units</span>
                                    </div>
                                  </div>
                                  <Progress 
                                    percent={Math.min(stockPercentage, 100)} 
                                    size="small" 
                                    strokeColor={isLowStock ? "#ff4d4f" : "#52c41a"}
                                    showInfo={false}
                                  />
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg min-w-[300px]">
                            <BoxPlotOutlined className="text-4xl mb-2" />
                            <p className="text-sm">No stock available</p>
                            <Button 
                              type="link" 
                              size="small"
                              onClick={() => {
                                setSelectedProduct(product);
                                setIsRestockModalVisible(true);
                              }}
                              className="mt-2"
                            >
                              Add stock now →
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Product Actions */}
                  <div className="border-t border-gray-200 bg-gray-50 px-6 py-3 flex justify-end gap-3">
                    <Button 
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setSelectedProduct(product);
                        setIsRestockModalVisible(true);
                      }}
                    >
                      Restock
                    </Button>
                    <Button 
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteProduct(product)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
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
