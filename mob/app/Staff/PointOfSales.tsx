import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    Easing,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { api } from '../../config/api';

const { height: screenHeight } = Dimensions.get('window');

type StockStatus = 'Low Stock' | 'In Stock' | 'Out of Stock';

type StockBranch = {
  id: string;
  name?: string;
};

type StockProductStock = {
  id: string;
  branch_id: string | number;
  quantity: number;
  minimum_stock: number;
  branch?: StockBranch;
};

type StockItem = {
  id: string;
  name: string;
  sku?: string;
  category: string;
  type: string;
  quantity: number;
  price: number;
  minStock: number;
  status: StockStatus;
  product_stocks?: StockProductStock[];
  icon: string;
  description?: string;
  popular?: boolean;
};

export default function POSScreen() {
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<StockItem[]>([]);
  const [cart, setCart] = useState<(StockItem & { quantity: number })[]>([]);
  const [cash, setCash] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const categories = ['All', 'Lechon Manok', 'Liempo'];
  
  const filteredProducts = selectedCategory === 'All' 
    ? products 
    : products.filter(p => p.category === selectedCategory);
  
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const change = cash ? Math.max(Number(cash) - total, 0) : 0;
  
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  
  const scrollViewRef = useRef<ScrollView>(null);
  const categoryScrollRef = useRef<ScrollView>(null);

  const loadProducts = async () => {
    try {
      const { data } = await api.get('products');
      const productsWithDetails = (data || []).map((item: any) => {
        const quantity = (item.product_stocks || []).reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
        return {
          id: String(item.id),
          name: item.name,
          category: item.category || 'Product',
          type: 'Regular',
          quantity,
          price: Number(item.price || 0),
          minStock: 1,
          status: quantity <= 0 ? 'Out of Stock' : 'In Stock',
          icon: item.category === 'Liempo' ? 'set_meal' : 'restaurant',
          description: `Stock: ${quantity}`,
          popular: quantity > 20,
        };
      });
      setProducts(productsWithDetails);
    } catch (error) {
      console.error('Error loading products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProducts();
    setRefreshing(false);
  };

  const zoomIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 1.05,
      duration: 150,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const zoomOut = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 150,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const animateButton = (callback?: () => void) => {
    Animated.sequence([
      Animated.timing(buttonScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      })
    ]).start(callback);
  };

  const addToCart = (product: StockItem) => {
    // Check if product is in stock
    if (product.quantity <= 0) {
      Alert.alert('Out of Stock', `${product.name} is currently out of stock.`);
      return;
    }
    
    animateButton();
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id);
      const currentCartQuantity = existingItem ? existingItem.quantity : 0;
      
      // Check if adding more than available stock
      if (currentCartQuantity + 1 > product.quantity) {
        Alert.alert('Insufficient Stock', `Only ${product.quantity} ${product.name} available in stock.`);
        return prevCart;
      }
      
      if (existingItem) {
        return prevCart.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prevCart => {
      const item = prevCart.find(item => item.id === id);
      if (!item) return prevCart;
      
      const product = products.find(p => p.id === id);
      if (!product) return prevCart;
      
      const newQuantity = item.quantity + delta;
      
      // Check if exceeding stock
      if (newQuantity > product.quantity) {
        Alert.alert('Insufficient Stock', `Only ${product.quantity} ${product.name} available in stock.`);
        return prevCart;
      }
      
      if (newQuantity <= 0) {
        return prevCart.filter(item => item.id !== id);
      }
      
      return prevCart.map(item =>
        item.id === id
          ? { ...item, quantity: newQuantity }
          : item
      );
    });
  };

  const removeFromCart = (id: string, name: string) => {
    Alert.alert(
      'Remove Item',
      `Remove ${name} from cart?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => setCart(prevCart => prevCart.filter(item => item.id !== id)) }
      ]
    );
  };

  const getBranchIdFromUser = (user: any) => {
    if (!user) return null;
    
    console.log('[GET BRANCH ID] User data:', user);
    
    // Direct branch ID properties
    if (user.branch_id) return user.branch_id;
    if (user.branchId) return user.branchId;
    if (user.branch?.id) return user.branch.id;
    if (user.branch?.branch_id) return user.branch.branch_id;

    // Check branchAssignments array (both snake_case and camelCase)
    const assignments = Array.isArray(user.branch_assignments) ? user.branch_assignments : 
                       Array.isArray(user.branchAssignments) ? user.branchAssignments : [];
    console.log('[GET BRANCH ID] Branch assignments:', assignments);
    
    const activeAssignment = assignments.find((a: any) => a?.is_active) || assignments[0];
    console.log('[GET BRANCH ID] Active assignment:', activeAssignment);
    
    if (activeAssignment) {
      const branchId = activeAssignment?.branch_id || 
                       activeAssignment?.branch?.id || 
                       activeAssignment?.branch?.branch_id ||
                       activeAssignment?.id;
      if (branchId) return branchId;
    }

    // Fallback: Check if user has branch info in nested objects
    if (user.staff?.branch_id) return user.staff.branch_id;
    if (user.staff?.branch?.id) return user.staff.branch.id;
    
    // Special fallback for COD branch - check if user has COD in any branch-related field
    const hasCODBranch = assignments.some((a: any) => 
      a?.branch?.name === 'COD' || 
      a?.branch_name === 'COD' ||
      a?.name === 'COD'
    );
    
    if (hasCODBranch) {
      console.log('[GET BRANCH ID] Found COD branch assignment');
      const codAssignment = assignments.find((a: any) => 
        a?.branch?.name === 'COD' || 
        a?.branch_name === 'COD' ||
        a?.name === 'COD'
      );
      return codAssignment?.branch_id || 
             codAssignment?.branch?.id || 
             codAssignment?.branch?.branch_id ||
             codAssignment?.id;
    }

    console.log('[GET BRANCH ID] No branch ID found');
    return null;
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      Alert.alert('Cart Empty', 'Please add items to cart before checking out');
      return;
    }
    if (!cash || Number(cash) < total) {
      Alert.alert('Insufficient Cash', `Please enter at least ₱${total}`);
      return;
    }
    
    const orderItems = cart.map(item => 
      `${item.name} x${item.quantity} = ₱${item.price * item.quantity}`
    ).join('\n');
    
    console.log('[POS CHECKOUT] Cart items:', cart);
    console.log('[POS CHECKOUT] Order items string:', orderItems);
    console.log('[POS CHECKOUT] Total:', total);
    console.log('[POS CHECKOUT] Cash:', cash);
    console.log('[POS CHECKOUT] Change:', change);
    
    try {
      const userRaw = await AsyncStorage.getItem('user');
      let user = userRaw ? JSON.parse(userRaw) : null;

      console.log('[POS CHECKOUT] Initial user data:', user);

      if (!user?.id) {
        try {
          const meResponse = await api.get('me');
          user = meResponse.data;
          console.log('[POS CHECKOUT] Fetched user from /me:', user);
          if (user?.id) {
            await AsyncStorage.setItem('user', JSON.stringify(user));
          }
        } catch (error) {
          console.error('Unable to refresh authenticated user:', error);
        }
      }

      let branchId = getBranchIdFromUser(user);
      console.log('[POS CHECKOUT] Branch ID from user:', branchId);
      console.log('[POS CHECKOUT] User branchAssignments:', user?.branchAssignments);
      console.log('[POS CHECKOUT] User branch_id:', user?.branch_id);
      console.log('[POS CHECKOUT] User branchId:', user?.branchId);

      if (!branchId && user?.id) {
        try {
          console.log('[POS CHECKOUT] Fetching staff data for user ID:', user.id);
          const staffResponse = await api.get(`staff/${user.id}`);
          const staffData = staffResponse.data;
          console.log('[POS CHECKOUT] Staff data:', staffData);
          
          branchId = getBranchIdFromUser(staffData);
          console.log('[POS CHECKOUT] Branch ID from staff data:', branchId);

          if (branchId) {
            user = {
              ...user,
              branch_id: branchId,
              branchAssignments: staffData?.branchAssignments || user?.branchAssignments,
            };
            await AsyncStorage.setItem('user', JSON.stringify(user));
            console.log('[POS CHECKOUT] Updated user with branch info:', user);
          }
        } catch (error) {
          console.error('Unable to fetch staff branch assignment:', error);
        }
      }

      // Final fallback: Try to get COD branch directly
      if (!branchId) {
        try {
          console.log('[POS CHECKOUT] Attempting to fetch COD branch directly');
          const branchesResponse = await api.get('branches');
          const branches = branchesResponse.data;
          console.log('[POS CHECKOUT] Available branches:', branches);
          
          const codBranch = branches.find((b: any) => 
            b.name === 'COD' || 
            b.branch_name === 'COD' ||
            b.code === 'COD'
          );
          
          if (codBranch) {
            branchId = codBranch.id || codBranch.branch_id;
            console.log('[POS CHECKOUT] Found COD branch:', codBranch, 'Branch ID:', branchId);
            
            // Update user with COD branch info
            user = {
              ...user,
              branch_id: branchId,
              branch: { id: branchId, name: 'COD' }
            };
            await AsyncStorage.setItem('user', JSON.stringify(user));
          }
        } catch (error) {
          console.error('Unable to fetch COD branch:', error);
        }
      }

      console.log('[POS CHECKOUT] Final user ID:', user?.id);
      console.log('[POS CHECKOUT] Final branch ID:', branchId);

      if (!user?.id || !branchId) {
        console.log('[POS CHECKOUT] Missing context - User ID:', user?.id, 'Branch ID:', branchId);
        Alert.alert('Missing User Context', 'Unable to determine staff or branch for checkout.');
        return;
      }

      await api.post('sales', {
        branch_id: branchId,
        user_id: user.id,
        cash_collected: Number(cash),
        payment_method: 'cash',
        items: cart.map((item) => ({
          product_id: Number(item.id),
          quantity: item.quantity,
        })),
      });
      const orderSummary = orderItems || 'No items details available';
      const alertMessage = `${orderSummary}\n\n━━━━━━━━━━━━━━━━\nTotal: ₱${total}\nCash: ₱${cash}\nChange: ₱${change}`;
      
      console.log('[POS CHECKOUT] Alert message:', alertMessage);
      
      Alert.alert(
        'Order Complete!',
        alertMessage,
        [{ text: 'New Order' }]
      );
      setCart([]);
      setCash('');
      await loadProducts();
    } catch (error: any) {
      Alert.alert('Checkout Failed', error?.response?.data?.message || 'Failed to save sale to backend.');
    }
  };

  const handleCancelOrder = () => {
    if (cart.length === 0) return;
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: () => {
          setCart([]);
          setCash('');
        }}
      ]
    );
  };

  const quickAddAmounts = [50, 100, 200, 500, 1000];

  const renderCartItem = ({ item }: { item: typeof cart[0] }) => (
    <View className="flex-row justify-between items-center border-b border-gray-100 py-3">
      <View className="flex-2">
        <View className="flex-row items-center">
          <View className="bg-red-100 p-2 rounded-full mr-2">
            <Icon name={item.icon} size={20} color="#DC2626" />
          </View>
          <View>
            <Text className="font-medium text-sm">{item.name}</Text>
            <Text className="text-gray-500 text-xs">₱{item.price} each</Text>
          </View>
        </View>
      </View>
      <View className="flex-row items-center space-x-2">
        <TouchableOpacity
          onPress={() => updateQuantity(item.id, -1)}
          className="bg-red-100 w-8 h-8 rounded-full items-center justify-center"
        >
          <Icon name="remove" size={16} color="#DC2626" />
        </TouchableOpacity>
        <Text className="font-semibold text-base min-w-[30px] text-center">
          {item.quantity}
        </Text>
        <TouchableOpacity
          onPress={() => updateQuantity(item.id, 1)}
          className="bg-green-100 w-8 h-8 rounded-full items-center justify-center"
        >
          <Icon name="add" size={16} color="#10B981" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => removeFromCart(item.id, item.name)}
          className="ml-2"
        >
          <Icon name="delete" size={20} color="#DC2626" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-lg text-gray-600">Loading POS System...</Text>
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <ScrollView 
        className="flex-1 bg-gray-50"
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            colors={['#DC2626']}
            tintColor="#DC2626"
          />
        }
      >
        <StatusBar style="dark" />
        
        <Animated.View className="flex-1" style={{ opacity: fadeAnim }}>
          {/* HEADER - Fixed */}
          <View className="bg-red-600 pt-12 pb-10 px-6 rounded-b-3xl shadow-lg">
            <View className="flex-row items-center justify-center mb-2">
              <Icon name="restaurant" size={32} color="white" />
              <Text className="text-3xl font-bold text-white ml-2">
                New Moon Lechon
              </Text>
            </View>
            <Text className="text-center text-red-200 text-sm font-medium">
              Point of Sales System
            </Text>
          </View>

          {/* Main ScrollView with proper keyboard handling */}
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            className="flex-1"
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
          >
            <ScrollView 
              ref={scrollViewRef}
              showsVerticalScrollIndicator={false}
              className="flex-1"
              contentContainerStyle={{ flexGrow: 1, minHeight: screenHeight, paddingBottom: Math.max(120, insets.bottom + 100) }}
              keyboardShouldPersistTaps="handled"
            >
              <View className="p-5">
                {/* CATEGORY FILTER - Horizontal ScrollView */}
                <View className="mb-6">
                  <ScrollView 
                    ref={categoryScrollRef}
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    className="flex-row"
                    contentContainerStyle={{ paddingRight: 16 }}
                  >
                    {categories.map((category) => (
                      <TouchableOpacity
                        key={category}
                        onPress={() => setSelectedCategory(category)}
                        className={`px-5 py-3 rounded-xl mr-3 shadow-sm ${
                          selectedCategory === category ? 'bg-red-600' : 'bg-white'
                        }`}
                      >
                        <Text className={`font-semibold text-sm ${
                          selectedCategory === category ? 'text-white' : 'text-gray-700'
                        }`}>
                          {category === 'Lechon Manok' ? 'Lechon Manok' : 
                           category === 'Liempo' ? 'Liempo' : 'All Items'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* MENU GRID - Shows all products from Dashboard */}
                <View className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
                  <View className="flex-row items-center mb-5">
                    <Icon name="restaurant-menu" size={24} color="#DC2626" />
                    <Text className="font-bold text-xl ml-2 text-gray-800">
                      Menu
                    </Text>
                  </View>
                  <FlatList
                    data={filteredProducts}
                    keyExtractor={(item) => item.id}
                    numColumns={2}
                    scrollEnabled={false}
                    columnWrapperStyle={{ justifyContent: 'space-between' }}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        onPress={() => addToCart(item)}
                        className={`w-[48%] p-4 mb-4 rounded-2xl items-center shadow-sm ${
                          item.quantity <= 0 ? 'bg-gray-100 opacity-50' : 'bg-amber-50'
                        }`}
                        activeOpacity={item.quantity <= 0 ? 1 : 0.7}
                        disabled={item.quantity <= 0}
                      >
                        {item.popular && item.quantity > 0 && (
                          <View className="absolute top-2 right-2 bg-orange-500 px-2 py-1 rounded-full flex-row items-center">
                            <Icon name="local-fire-department" size={10} color="white" />
                            <Text className="text-white text-[10px] font-bold ml-1">BESTSELLER</Text>
                          </View>
                        )}
                        {item.quantity <= 0 && (
                          <View className="absolute top-2 right-2 bg-red-500 px-2 py-1 rounded-full">
                            <Text className="text-white text-[10px] font-bold">OUT OF STOCK</Text>
                          </View>
                        )}
                        <View className="bg-red-100 p-3 rounded-full mb-3">
                          <Icon name={item.icon} size={32} color="#DC2626" />
                        </View>
                        <Text className="font-bold text-center text-base text-gray-800 mb-1">{item.name}</Text>
                        <Text className="text-gray-500 text-xs text-center mb-2">{item.description}</Text>
                        <Text className="text-green-600 font-bold text-xl">₱{item.price}</Text>
                        {item.quantity <= 10 && item.quantity > 0 && (
                          <View className="flex-row items-center mt-2">
                            <Icon name="warning" size={12} color="#F59E0B" />
                            <Text className="text-orange-500 text-xs ml-1">Only {item.quantity} left!</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    )}
                  />
                </View>

                {/* ORDER SUMMARY */}
                <View className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
                  <View className="flex-row justify-between items-center mb-5">
                    <View className="flex-row items-center">
                      <Icon name="receipt-long" size={24} color="#DC2626" />
                      <Text className="font-bold text-xl ml-2 text-gray-800">
                        Order Summary
                      </Text>
                    </View>
                    <View className="bg-gray-100 px-3 py-1 rounded-full">
                      <Text className="text-gray-600 text-xs font-semibold">
                        {cart.length} {cart.length === 1 ? 'item' : 'items'}
                      </Text>
                    </View>
                  </View>

                  {cart.length === 0 ? (
                    <View className="py-10 items-center">
                      <View className="bg-gray-100 p-4 rounded-full mb-3">
                        <Icon name="shopping-cart" size={40} color="#9CA3AF" />
                      </View>
                      <Text className="text-gray-400 text-center">Your cart is empty</Text>
                      <Text className="text-gray-400 text-xs text-center mt-1">Tap on items to add</Text>
                    </View>
                  ) : (
                    <>
                      {/* Cart Items */}
                      {cart.map((item) => (
                        <View key={item.id}>
                          {renderCartItem({ item })}
                        </View>
                      ))}

                      {/* TOTAL */}
                      <View className="bg-green-50 p-4 rounded-xl mt-5 border border-green-200">
                        <View className="flex-row justify-between items-center">
                          <Text className="font-bold text-base text-gray-700">Total Amount</Text>
                          <Text className="font-bold text-2xl text-green-700">₱{total}</Text>
                        </View>
                      </View>
                    </>
                  )}

                  {/* CASH INPUT with Quick Add */}
                  {cart.length > 0 && (
                    <View className="mt-5">
                      <View className="flex-row items-center mb-3">
                        <Icon name="payments" size={20} color="#DC2626" />
                        <Text className="font-semibold ml-2 text-gray-700">Cash Amount</Text>
                      </View>
                      
                      {/* Quick Add Buttons - Horizontal ScrollView */}
                      <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        className="mb-4"
                        nestedScrollEnabled={true}
                      >
                        <View className="flex-row">
                          {quickAddAmounts.map((amount) => (
                            <TouchableOpacity
                              key={amount}
                              onPress={() => setCash(amount.toString())}
                              className="bg-gray-100 px-5 py-3 rounded-xl mr-3 shadow-sm"
                            >
                              <Text className="text-gray-700 font-semibold">₱{amount}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>

                      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                        <TextInput
                          className="border border-gray-300 p-4 rounded-xl text-base bg-white shadow-sm"
                          placeholder="Enter cash amount"
                          keyboardType="numeric"
                          value={cash.toString()}
                          onChangeText={(value) => setCash(value)}
                          onFocus={zoomIn}
                          onBlur={zoomOut}
                        />
                      </Animated.View>

                      {/* CHANGE DISPLAY */}
                      {cash && Number(cash) >= total && (
                        <View className="bg-green-50 p-4 rounded-xl mt-4 border border-green-200">
                          <View className="flex-row justify-between items-center">
                            <View className="flex-row items-center">
                              <Icon name="check-circle" size={20} color="#10B981" />
                              <Text className="font-bold text-gray-700 ml-2">Change</Text>
                            </View>
                            <Text className="font-bold text-2xl text-green-600">₱{change}</Text>
                          </View>
                        </View>
                      )}
                      
                      {cash && Number(cash) < total && Number(cash) > 0 && (
                        <View className="bg-red-50 p-4 rounded-xl mt-4 border border-red-200">
                          <View className="flex-row items-center justify-center">
                            <Icon name="error-outline" size={20} color="#DC2626" />
                            <Text className="text-red-600 text-center ml-2 font-medium">
                              Insufficient: Need ₱{total - Number(cash)} more
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {/* BUTTONS */}
                  {cart.length > 0 && (
                    <>
                      <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
                        <TouchableOpacity 
                          onPress={handleCheckout}
                          className="bg-green-600 py-4 mt-5 rounded-xl items-center shadow-md"
                          activeOpacity={0.8}
                        >
                          <View className="flex-row items-center">
                            <Icon name="check-circle" size={20} color="white" />
                            <Text className="text-white font-bold text-base ml-2">Checkout</Text>
                          </View>
                        </TouchableOpacity>
                      </Animated.View>

                      <TouchableOpacity 
                        onPress={handleCancelOrder}
                        className="bg-red-600 py-4 mt-3 rounded-xl items-center shadow-md"
                        activeOpacity={0.8}
                      >
                        <View className="flex-row items-center">
                          <Icon name="cancel" size={20} color="white" />
                          <Text className="text-white font-bold text-base ml-2">Cancel Order</Text>
                        </View>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}