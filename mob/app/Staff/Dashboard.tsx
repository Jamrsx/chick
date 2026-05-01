import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
    SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { api } from '../../config/api';

const { width } = Dimensions.get('window');

type StockStatus = 'Low Stock' | 'In Stock' | 'Out of Stock';

type StockItem = {
  id: string;
  name: string;
  category: string;
  type: string;
  quantity: number;
  price: number;
  minStock: number;
  status: StockStatus;
  product_stocks?: { id: string; branch_id: string | number; quantity: number; minimum_stock: number; branch?: { id: string; name?: string } }[];
  icon?: string;
  description?: string;
  popular?: boolean;
};

const formatLocalDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getBranchIdFromUser = (user: any) => {
  if (!user) return null;
  if (user.branch_id) return user.branch_id;
  if (user.branchId) return user.branchId;

  const assignments = Array.isArray(user.branchAssignments) ? user.branchAssignments : [];
  const activeAssignment = assignments.find((assignment: any) => assignment?.is_active) || assignments[0];
  return activeAssignment?.branch_id || activeAssignment?.branch?.id || activeAssignment?.branch?.branch_id || null;
};

const getSaleDate = (sale: any) => {
  const rawDate = sale?.sale_date || sale?.created_at || '';
  if (typeof rawDate !== 'string') return '';
  const match = rawDate.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
};

const sumSalesTotal = (sales: any[] = []) =>
  sales.reduce((sum, sale) => sum + Number(sale?.total || 0), 0);

const getStoredUser = async () => {
  const userRaw = await AsyncStorage.getItem('user');
  if (userRaw) return JSON.parse(userRaw);

  try {
    const response = await api.get('me');
    if (response.data) {
      await AsyncStorage.setItem('user', JSON.stringify(response.data));
    }
    return response.data;
  } catch (error) {
    console.error('Unable to load dashboard user:', error);
    return null;
  }
};

const DashboardScreen = () => {
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [grossSales, setGrossSales] = useState(0);
  const [todaySales, setTodaySales] = useState(0);

  const loadDashboardData = async () => {
    try {
      const today = formatLocalDate();
      const monthStart = formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
      const monthEnd = formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
      const nextMonthStart = formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1));
      const user = await getStoredUser();
      const branchId = getBranchIdFromUser(user);
      const branchParams = branchId ? { branch_id: branchId } : {};

      const [productsRes, summaryRes] = await Promise.all([
        api.get('products'),
        api.get('sales', { params: { ...branchParams, date: today } }),
      ]);
      const monthlySalesRes = await api.get('sales', {
        params: { ...branchParams, start_date: monthStart, end_date: nextMonthStart },
      });

      const mappedStock: StockItem[] = (productsRes.data || []).map((item: any) => {
        const quantity = (item.product_stocks || []).reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
        const minStock = (item.product_stocks || []).reduce((min: number, s: any) => Math.min(min, s.minimum_stock || 0), 0);
        const status: StockStatus = quantity <= 0 ? 'Out of Stock' : quantity <= (minStock || 1) ? 'Low Stock' : 'In Stock';
        return {
          id: String(item.id),
          name: item.name,
          category: item.category || 'Product',
          type: 'Regular',
          quantity,
          price: Number(item.price || 0),
          minStock: minStock || 1,
          status,
        };
      });
      setStockData(mappedStock);

      const todaySalesTotal = sumSalesTotal(summaryRes.data || []);
      const monthSalesTotal = sumSalesTotal(
        (monthlySalesRes.data || []).filter((sale: any) => {
          const saleDate = getSaleDate(sale);
          return saleDate >= monthStart && saleDate <= monthEnd;
        })
      );

      setGrossSales(monthSalesTotal);
      setTodaySales(todaySalesTotal);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setStockData([]);
      setGrossSales(0);
      setTodaySales(0);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadDashboardData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const getTotalStock = () => {
    return stockData.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getLowStockCount = () => {
    return stockData.filter(item => item.status === 'Low Stock').length;
  };

  const getTotalValue = () => {
    return stockData.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  };

  const StatCard = ({ title, value, icon, color }: any) => (
    <View className="bg-white rounded-xl p-4 shadow-sm border border-gray-100" style={{ width: width * 0.44 }}>
      <View className={`${color} p-2 rounded-full w-10 h-10 mb-2`}>
        <Icon name={icon} size={20} color="white" />
      </View>
      <Text className="text-2xl font-bold text-gray-800">{value}</Text>
      <Text className="text-gray-500 text-xs mt-1">{title}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#DC2626" />
        <Text className="mt-4 text-gray-600 font-medium">Loading Dashboard...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView 
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#DC2626']} tintColor="#DC2626" />
        }
      >
        {/* Header Section */}
        <View className="bg-red-600 pt-12 pb-8 px-5 rounded-b-3xl">
          <View className="flex-row justify-between items-center mb-6">
            <View>
              <Text className="text-white/80 text-xs font-semibold">WELCOME BACK</Text>
              <Text className="text-white text-2xl font-bold mt-1">Staff Dashboard</Text>
              <Text className="text-white/70 text-sm mt-0.5">New Moon Lechon House</Text>
            </View>
            <TouchableOpacity className="bg-white/20 p-3 rounded-full">
              <Icon name="notifications-none" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Main Sales Card */}
          <View className="bg-white rounded-2xl p-5 mt-2 shadow-lg">
            <Text className="text-gray-500 text-xs font-semibold mb-1">TOTAL SALES TODAY</Text>
            <Text className="text-gray-900 text-4xl font-bold">₱{todaySales.toLocaleString()}</Text>
            
            <View className="flex-row justify-between items-center mt-4 pt-3 border-t border-gray-100">
              <View>
                <Text className="text-gray-500 text-xs">This Month</Text>
                <Text className="text-gray-900 font-bold text-base">₱{grossSales.toLocaleString()}</Text>
              </View>
              <View>
                <Text className="text-gray-500 text-xs">Target</Text>
                <Text className="text-gray-900 font-bold text-base">₱150,000</Text>
              </View>
              <View className="bg-green-100 px-3 py-1 rounded-full">
                <View className="flex-row items-center">
                  <Icon name="arrow-upward" size={12} color="#10B981" />
                  <Text className="text-green-600 text-xs font-bold ml-1">12%</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View className="px-5 mt-6">
          <Text className="text-gray-800 text-lg font-bold mb-3">Inventory Overview</Text>
          <View className="flex-row flex-wrap justify-between">
            <StatCard 
              title="Total Products" 
              value={stockData.length} 
              icon="restaurant-menu" 
              color="bg-red-500"
            />
            <StatCard 
              title="Total Stock" 
              value={getTotalStock()} 
              icon="kitchen" 
              color="bg-green-500"
            />
            <StatCard 
              title="Low Stock Items" 
              value={getLowStockCount()} 
              icon="warning" 
              color="bg-yellow-500"
            />
          </View>
        </View>

        {/* Inventory Value Card */}
        <View className="px-5 mt-3">
          <View className="bg-purple-600 rounded-xl p-4 shadow-sm">
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-white/80 text-xs mb-1">TOTAL INVENTORY VALUE</Text>
                <Text className="text-white text-2xl font-bold">₱{getTotalValue().toLocaleString()}</Text>
              </View>
              <View className="bg-white/20 p-3 rounded-full">
                <Text className="text-white text-2xl font-bold">₱</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stock Details List */}
        <View className="px-5 mt-6">
          <Text className="text-gray-800 text-lg font-bold mb-3">Current Stock Levels</Text>
          {stockData.map((item) => (
            <View key={item.id} className="bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100">
              <View className="flex-row justify-between items-start mb-3">
                <View>
                  <Text className="text-gray-900 font-bold text-lg">{item.name}</Text>
                  <Text className="text-gray-500 text-xs mt-1">{item.category} - {item.type}</Text>
                </View>
                <View className={`px-3 py-1 rounded-full ${
                  item.status === 'Low Stock' ? 'bg-yellow-100' : 'bg-green-100'
                }`}>
                  <Text className={`text-xs font-semibold ${
                    item.status === 'Low Stock' ? 'text-yellow-700' : 'text-green-700'
                  }`}>
                    {item.status}
                  </Text>
                </View>
              </View>
              
              <View className="flex-row justify-between items-center pt-3 border-t border-gray-100">
                <View>
                  <Text className="text-gray-500 text-xs">Quantity</Text>
                  <Text className="text-2xl font-bold text-gray-800">{item.quantity}</Text>
                </View>
                <View>
                  <Text className="text-gray-500 text-xs">Price</Text>
                  <Text className="text-xl font-bold text-green-600">₱{item.price}</Text>
                </View>
                <View>
                  <Text className="text-gray-500 text-xs">Min. Stock</Text>
                  <Text className="text-lg font-semibold text-gray-700">{item.minStock}</Text>
                </View>
              </View>

              {item.quantity <= item.minStock && (
                <View className="mt-3 pt-2 border-t border-gray-100">
                  <Text className="text-yellow-600 text-xs">
                    ⚠️ Reorder soon! Current stock is at minimum level.
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Low Stock Alert Section */}
        {getLowStockCount() > 0 && (
          <View className="px-5 mt-4">
            <View className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
              <View className="flex-row items-center mb-2">
                <Icon name="warning" size={20} color="#F59E0B" />
                <Text className="text-yellow-700 font-bold ml-2">Low Stock Alert!</Text>
              </View>
              <Text className="text-yellow-600 text-sm">
                {getLowStockCount()} item(s) are running low. Please restock soon.
              </Text>
            </View>
          </View>
        )}

        {/* Footer */}
        <View className="bg-white py-4 px-5 border-t border-gray-200 mt-6">
          <View className="flex-row justify-center items-center">
            <Icon name="store" size={14} color="#9CA3AF" />
            <Text className="text-center text-gray-500 text-xs ml-1">
              New Moon Lechon House - Staff Portal
            </Text>
          </View>
          <Text className="text-center text-gray-400 text-[10px] mt-2">
            Last updated: {new Date().toLocaleString()}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default DashboardScreen;
