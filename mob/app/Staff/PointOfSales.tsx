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
    Modal,
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

type StockDelivery = {
  id: string;
  branch_id: string | number;
  quantity: number;
  restocked_at?: string | null;
  received_at?: string | null;
  received_by?: string | number | null;
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
  ongoing_stocks?: StockDelivery[];
  icon: string;
  description?: string;
  popular?: boolean;
  branchStock?: StockProductStock;
  pendingQty?: number;
  lastDeliveryAt?: string | null;
};

export default function POSScreen() {
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<StockItem[]>([]);
  const [cart, setCart] = useState<(StockItem & { quantity: number })[]>([]);
  const [cash, setCash] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [seniorDiscount, setSeniorDiscount] = useState(false);
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ongoingStocksModalVisible, setOngoingStocksModalVisible] = useState(false);
  const [ongoingStocks, setOngoingStocks] = useState<StockItem[]>([]);
  const [collapsedReceived, setCollapsedReceived] = useState(false);
  const [collapsedNotReceived, setCollapsedNotReceived] = useState(false);
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  
  const categories = ['All', 'Lechon Manok', 'Liempo'];
  
  const filteredProducts = selectedCategory === 'All' 
    ? products 
    : products.filter(p => p.category === selectedCategory);
  
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  // Philippines Senior Citizen Discount: 20% (RA 9994)
  const discountAmount = seniorDiscount ? Math.round(subtotal * 0.2 * 100) / 100 : 0;
  const total = Math.max(subtotal - discountAmount, 0);
  const change = cash ? Math.max(Number(cash) - total, 0) : 0;
  
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  
  const scrollViewRef = useRef<ScrollView>(null);
  const categoryScrollRef = useRef<ScrollView>(null);

  const COLLAPSE_KEY_RECEIVED = 'pos_ongoing_stocks_collapsed_received';
  const COLLAPSE_KEY_NOT_RECEIVED = 'pos_ongoing_stocks_collapsed_not_received';

  const idsEqual = (a: any, b: any) => String(a ?? '') === String(b ?? '');

  useEffect(() => {
    const loadCollapsePrefs = async () => {
      try {
        const [r, nr] = await Promise.all([
          AsyncStorage.getItem(COLLAPSE_KEY_RECEIVED),
          AsyncStorage.getItem(COLLAPSE_KEY_NOT_RECEIVED),
        ]);
        if (r != null) setCollapsedReceived(r === '1');
        if (nr != null) setCollapsedNotReceived(nr === '1');
        console.log('[ONGOING STOCKS] Loaded collapse prefs', { received: r, notReceived: nr });
      } catch (e) {
        console.error('[ONGOING STOCKS] Failed to load collapse prefs', e);
      }
    };

    loadCollapsePrefs();
  }, []);

  const toggleCollapsedReceived = async () => {
    setCollapsedReceived((prev) => {
      const next = !prev;
      AsyncStorage.setItem(COLLAPSE_KEY_RECEIVED, next ? '1' : '0').catch((e) =>
        console.error('[ONGOING STOCKS] Failed to persist received collapse', e)
      );
      console.log('[ONGOING STOCKS] Toggled received collapse', next);
      return next;
    });
  };

  const toggleCollapsedNotReceived = async () => {
    setCollapsedNotReceived((prev) => {
      const next = !prev;
      AsyncStorage.setItem(COLLAPSE_KEY_NOT_RECEIVED, next ? '1' : '0').catch((e) =>
        console.error('[ONGOING STOCKS] Failed to persist not-received collapse', e)
      );
      console.log('[ONGOING STOCKS] Toggled not-received collapse', next);
      return next;
    });
  };

  const resolveBranchId = async () => {
    const userRaw = await AsyncStorage.getItem('user');
    let user = userRaw ? JSON.parse(userRaw) : null;

    let branchId = getBranchIdFromUser(user);
    if (branchId) {
      console.log('[RESOLVE BRANCH ID] From storage user:', branchId);
      return branchId;
    }

    try {
      const meResponse = await api.get('me');
      user = meResponse.data;
      if (user) {
        await AsyncStorage.setItem('user', JSON.stringify(user));
      }
      branchId = getBranchIdFromUser(user);
      if (branchId) {
        console.log('[RESOLVE BRANCH ID] From /me:', branchId);
        return branchId;
      }
    } catch (error) {
      console.error('[RESOLVE BRANCH ID] Unable to fetch /me:', error);
    }

    // Extra fallback: some APIs store branch assignment under staff endpoint
    if (user?.id) {
      try {
        console.log('[RESOLVE BRANCH ID] Fallback: fetching staff by user ID', user.id);
        const staffResponse = await api.get(`staff/${user.id}`);
        const staffData = staffResponse.data;
        branchId = getBranchIdFromUser(staffData);
        if (branchId) {
          const mergedUser = { ...user, branch_id: branchId, branchAssignments: staffData?.branchAssignments };
          await AsyncStorage.setItem('user', JSON.stringify(mergedUser));
          console.log('[RESOLVE BRANCH ID] From staff endpoint:', branchId);
          return branchId;
        }
      } catch (error) {
        console.error('[RESOLVE BRANCH ID] Unable to fetch staff assignment:', error);
      }
    }

    console.log('[RESOLVE BRANCH ID] No branch ID resolved');
    return null;
  };

  const loadProducts = async () => {
    try {
      const { data } = await api.get('products');
      
      // Get user's branch ID
      const branchId = await resolveBranchId();
      
      const productsWithDetails = (data || []).map((item: any) => {
        // Find stock for user's branch and check if received
        const branchStock = (item.product_stocks || []).find((s: any) =>
          idsEqual(s.branch_id, branchId)
        );
        
        const quantity = branchStock?.quantity || 0;
        const minimumStock = branchStock?.minimum_stock ?? 0;
        
        return {
          id: String(item.id),
          name: item.name,
          category: item.category || 'Product',
          type: 'Regular',
          quantity,
          price: Number(item.price || 0),
          minStock: minimumStock,
          status: quantity <= 0 ? 'Out of Stock' : 'In Stock',
          icon: item.category === 'Liempo' ? 'lunch_dining' : 'fastfood',
          description: `Stock: ${quantity}`,
          popular: quantity > 20,
          branchStock: branchStock,
          ongoing_stocks: item.ongoing_stocks || [],
        };
      });
      
      // POS should only list products that are RECEIVED and have enough supply.
      const availableProducts = productsWithDetails.filter((p: StockItem) => {
        const qty = Number(p.quantity || 0);
        return qty > 0;
      });

      setProducts(availableProducts);
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

  const loadOngoingStocks = async () => {
    try {
      const { data } = await api.get('products');
      
      // Get user's branch ID
      const branchId = await resolveBranchId();
      
      const productsWithDetails = (data || []).map((item: any) => {
        const branchStock = (item.product_stocks || []).find((s: any) =>
          idsEqual(s.branch_id, branchId)
        );
        
        const quantity = branchStock?.quantity || 0;
        const minimumStock = branchStock?.minimum_stock ?? 0;

        const deliveriesForBranch = (item.ongoing_stocks || []).filter((d: any) =>
          idsEqual(d.branch_id, branchId)
        );
        const pendingQty = deliveriesForBranch
          .filter((d: any) => !d.received_at)
          .reduce((sum: number, d: any) => sum + Number(d.quantity || 0), 0);
        const lastDeliveryAt =
          deliveriesForBranch
            .map((d: any) => d.restocked_at)
            .filter(Boolean)
            .sort()
            .slice(-1)[0] || null;
        
        return {
          id: String(item.id),
          name: item.name,
          category: item.category || 'Product',
          type: 'Regular',
          quantity,
          price: Number(item.price || 0),
          minStock: minimumStock,
          status: quantity <= 0 ? 'Out of Stock' : 'In Stock',
          icon: item.category === 'Liempo' ? 'lunch_dining' : 'fastfood',
          description: `Stock: ${quantity}`,
          popular: quantity > 20,
          branchStock: branchStock,
          ongoing_stocks: item.ongoing_stocks || [],
          pendingQty,
          lastDeliveryAt,
        };
      });
      
      // Show all stocks (both received and not received)
      setOngoingStocks(productsWithDetails);
      setOngoingStocksModalVisible(true);
    } catch (error) {
      console.error('Error loading ongoing stocks:', error);
      Alert.alert('Error', 'Failed to load stocks');
    }
  };

  const markAsReceived = async (item: StockItem) => {
    try {
      const branchIdFromUser = await resolveBranchId();
      const branchId = branchIdFromUser ?? item.branchStock?.branch_id;
      
      if (!branchId) {
        Alert.alert('Error', 'No branch assigned');
        return;
      }

      await api.post(`/products/${item.id}/toggle-received`, {
        branch_id: branchId
      });

      await loadOngoingStocks();
      await loadProducts();
      Alert.alert('Success', 'Stock marked as received');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update received status');
    }
  };

  const OngoingStockRow = ({ item }: { item: StockItem }) => (
    <View className="bg-gray-50 rounded-xl p-4 mb-3 border border-gray-200">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1">
          <Text className="text-gray-900 font-bold text-base">{item.name}</Text>
          <Text className="text-gray-500 text-xs">{item.category}</Text>
        </View>
        <View className={`px-3 py-1 rounded-lg ${Number(item.pendingQty || 0) > 0 ? 'bg-orange-100' : 'bg-green-100'}`}>
          <Text className={`text-xs font-bold ${Number(item.pendingQty || 0) > 0 ? 'text-orange-700' : 'text-green-700'}`}>
            {Number(item.pendingQty || 0) > 0 ? 'Pending' : 'No Pending'}
          </Text>
        </View>
      </View>
      <View className="flex-row justify-between items-center mt-2">
        <View>
          <Text className="text-gray-500 text-xs">Quantity</Text>
          <Text className="text-gray-900 font-bold text-lg">{item.quantity}</Text>
        </View>
        {Number(item.pendingQty || 0) > 0 && (
          <TouchableOpacity
            onPress={() => markAsReceived(item)}
            className="bg-green-500 py-2 px-4 rounded-lg"
          >
            <View className="flex-row items-center">
              <Icon name="check" size={16} color="white" />
              <Text className="text-white font-bold text-sm ml-1">Mark Received</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

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
        setQtyInputs((prev) => ({ ...prev, [product.id]: String(currentCartQuantity + 1) }));
        return prevCart.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      setQtyInputs((prev) => ({ ...prev, [product.id]: '1' }));
      return [...prevCart, { ...product, quantity: 1 }];
    });

    // Open order modal whenever staff selects a product
    setOrderModalVisible(true);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prevCart => {
      const item = prevCart.find(item => item.id === id);
      if (!item) return prevCart;
      
      const product = products.find(p => p.id === id);
      if (!product) return prevCart;
      
      const newQuantity = item.quantity + delta;

      // Keep editable input in sync with cart quantity
      setQtyInputs((prev) => ({ ...prev, [id]: String(Math.max(newQuantity, 0)) }));
      
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

  const setItemQuantity = (id: string, rawValue: string) => {
    const sanitized = rawValue.replace(/[^\d]/g, '');

    // Keep the raw input so staff can temporarily clear it while typing.
    setQtyInputs((prev) => ({ ...prev, [id]: sanitized }));

    // If empty, don't remove/change cart yet (prevents "disappearing" UX).
    if (sanitized === '') return;

    const nextQty = Number(sanitized);

    setCart(prevCart => {
      const item = prevCart.find(i => i.id === id);
      if (!item) return prevCart;

      const product = products.find(p => p.id === id);
      const maxQty = Number(product?.quantity || item.quantity || 0);

      if (nextQty <= 0) {
        return prevCart.filter(i => i.id !== id);
      }

      if (nextQty > maxQty) {
        Alert.alert('Insufficient Stock', `Only ${maxQty} ${item.name} available in stock.`);
        setQtyInputs((prev) => ({ ...prev, [id]: String(maxQty) }));
        return prevCart.map(i => (i.id === id ? { ...i, quantity: maxQty } : i));
      }

      return prevCart.map(i => (i.id === id ? { ...i, quantity: nextQty } : i));
    });
  };

  const commitQtyInput = (id: string) => {
    setQtyInputs((prev) => {
      const raw = prev[id];
      // If staff leaves it blank, revert to current quantity (do not remove item).
      if (raw === '') {
        const current = cart.find((c) => c.id === id);
        return { ...prev, [id]: current ? String(current.quantity) : '1' };
      }
      return prev;
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
    console.log('[POS CHECKOUT] Subtotal:', subtotal);
    console.log('[POS CHECKOUT] Senior discount:', seniorDiscount, 'Discount amount:', discountAmount);
    console.log('[POS CHECKOUT] Total:', total);
    console.log('[POS CHECKOUT] Cash:', cash);
    console.log('[POS CHECKOUT] Change:', change);
    console.log('[POS CHECKOUT] Customer name:', customerName);
    
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
        customer_name: customerName || null,
        senior_discount: seniorDiscount,
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
      setCustomerName('');
      setSeniorDiscount(false);
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
          setCustomerName('');
          setSeniorDiscount(false);
        }}
      ]
    );
  };

  const quickAddAmounts = [50, 100, 200, 500, 1000];

  const renderCartItem = ({ item }: { item: typeof cart[0] }) => (
    <View className="flex-row justify-between items-center border-b border-gray-100 py-4">
      <View className="flex-1">
        <View className="flex-row items-center">
          <View className="bg-red-100 p-3 rounded-full mr-3">
            <Icon name={item.icon} size={18} color="#DC2626" />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-base text-gray-800 mb-1">{item.name}</Text>
            <Text className="text-gray-500 text-sm">₱{item.price} each</Text>
          </View>
        </View>
      </View>
      <View className="flex-row items-center">
        <TouchableOpacity
          onPress={() => updateQuantity(item.id, -1)}
          className="bg-red-100 w-9 h-9 rounded-full items-center justify-center mr-2"
        >
          <Icon name="remove" size={18} color="#DC2626" />
        </TouchableOpacity>
        <View className="bg-gray-100 px-2 py-2 rounded-lg min-w-[70px] items-center">
          <TextInput
            className="font-bold text-base text-gray-800 text-center w-14 py-0"
            keyboardType="numeric"
            value={qtyInputs[item.id] ?? String(item.quantity)}
            onChangeText={(v) => setItemQuantity(item.id, v)}
            onBlur={() => commitQtyInput(item.id)}
          />
        </View>
        <TouchableOpacity
          onPress={() => updateQuantity(item.id, 1)}
          className="bg-green-100 w-9 h-9 rounded-full items-center justify-center mx-2"
        >
          <Icon name="add" size={18} color="#10B981" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => removeFromCart(item.id, item.name)}
          className="bg-red-50 p-2 rounded-lg ml-1"
        >
          <Icon name="delete" size={18} color="#DC2626" />
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
      <View className="flex-1">
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
                {/* Ongoing Stocks Button */}
                <TouchableOpacity
                  onPress={loadOngoingStocks}
                  className="bg-blue-600 py-3 px-4 rounded-xl mb-4 shadow-md"
                >
                  <View className="flex-row items-center justify-center">
                    <Icon name="inventory" size={20} color="white" />
                    <Text className="text-white font-bold text-base ml-2">Ongoing Stocks</Text>
                  </View>
                </TouchableOpacity>

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
                        className={`px-5 py-3 rounded-xl mr-3 shadow-sm border ${
                          selectedCategory === category ? 'bg-red-600 border-red-700' : 'bg-white border-gray-200'
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
                  <View className="flex-row items-center justify-between mb-5">
                    <View className="flex-row items-center">
                      <Icon name="restaurant-menu" size={24} color="#DC2626" />
                      <Text className="font-bold text-xl ml-2 text-gray-800">
                        Menu
                      </Text>
                    </View>
                    <Text className="text-gray-500 text-sm">
                      {filteredProducts.length} items
                    </Text>
                  </View>
                  <FlatList
                    data={filteredProducts}
                    keyExtractor={(item) => item.id}
                    numColumns={2}
                    scrollEnabled={false}
                    columnWrapperStyle={{ justifyContent: 'space-between', gap: 12 }}
                    contentContainerStyle={{ paddingBottom: 8 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        onPress={() => addToCart(item)}
                        className={`w-[48%] p-4 mb-4 rounded-2xl items-center shadow-sm border ${
                          item.quantity <= 0 ? 'bg-gray-50 opacity-50 border-gray-200' : 'bg-white border-gray-100'
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
                        <View className="bg-red-100 p-4 rounded-full mb-3">
                          <Icon name={item.icon} size={28} color="#DC2626" />
                        </View>
                        <Text className="font-bold text-center text-base text-gray-800 mb-1" numberOfLines={2}>{item.name}</Text>
                        <Text className="text-gray-500 text-xs text-center mb-3" numberOfLines={1}>{item.description}</Text>
                        <View className="bg-green-50 px-3 py-1 rounded-full">
                          <Text className="text-green-600 font-bold text-lg">₱{item.price}</Text>
                        </View>
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

                {/* ORDER SUMMARY moved to modal */}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      </ScrollView>

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom + 16, 16) }}>
          <TouchableOpacity
            onPress={() => setOrderModalVisible(true)}
            className="bg-red-600 py-4 rounded-2xl shadow-lg"
            activeOpacity={0.85}
          >
            <View className="flex-row items-center justify-between px-5">
              <View className="flex-row items-center">
                <View className="bg-white/20 p-2 rounded-xl mr-3">
                  <Icon name="shopping-cart" size={18} color="white" />
                </View>
                <View>
                  <Text className="text-white font-bold text-base">View Order</Text>
                  <Text className="text-white/80 text-xs">{cart.length} item(s)</Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <Text className="text-white font-bold text-lg mr-2">₱{total}</Text>
                <Icon name="chevron-right" size={24} color="white" />
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Order Summary Modal */}
      <Modal
        visible={orderModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setOrderModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View className="flex-1 bg-black/50 justify-end">
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View className="bg-white rounded-t-3xl h-[96%]">
                <View className="bg-red-600 px-4 py-3 rounded-t-3xl flex-row justify-between items-center">
                  <View className="flex-row items-center">
                    <Icon name="receipt-long" size={22} color="white" />
                    <Text className="text-white font-bold text-lg ml-2">Order Summary</Text>
                  </View>
                  <TouchableOpacity onPress={() => setOrderModalVisible(false)}>
                    <Icon name="close" size={26} color="white" />
                  </TouchableOpacity>
                </View>

                <View className="flex-1">
                  {/* Compact top bar */}
                  {cart.length > 0 && (
                    <View className="px-4 pt-3 pb-2 flex-row justify-between items-center">
                      <View className="bg-red-100 px-3 py-1 rounded-full">
                        <Text className="text-red-600 text-xs font-semibold">
                          {cart.length} {cart.length === 1 ? 'item' : 'items'}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={handleCancelOrder} className="bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
                        <View className="flex-row items-center">
                          <Icon name="delete-sweep" size={16} color="#DC2626" />
                          <Text className="text-red-600 font-bold text-xs ml-1">Clear</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}

                  <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled">
                    {cart.length === 0 ? (
                      <View className="py-14 items-center">
                      <View className="bg-gray-100 p-4 rounded-full mb-4">
                        <Icon name="shopping-cart" size={40} color="#9CA3AF" />
                      </View>
                      <Text className="text-gray-400 text-center font-medium">Your cart is empty</Text>
                      <Text className="text-gray-400 text-xs text-center mt-1">Tap on items to add</Text>
                      </View>
                    ) : (
                      <>
                        {/* Customer + Discount (compact) */}
                        <View className="bg-white rounded-2xl border border-gray-200 p-3 mb-3">
                          <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-2xl">
                            <View className="p-3">
                              <Icon name="person" size={18} color="#6B7280" />
                            </View>
                            <TextInput
                              className="flex-1 p-3 text-base"
                              placeholder="Customer name"
                              value={customerName}
                              onChangeText={setCustomerName}
                            />
                          </View>

                          <TouchableOpacity
                            onPress={() => setSeniorDiscount((p) => !p)}
                            className="mt-2 bg-gray-50 border border-gray-200 rounded-2xl p-3"
                            activeOpacity={0.85}
                          >
                            <View className="flex-row items-center justify-between">
                              <View className="flex-row items-center">
                                <View className={`w-6 h-6 rounded-md items-center justify-center ${seniorDiscount ? 'bg-green-600' : 'bg-white'} border border-gray-300`}>
                                  {seniorDiscount && <Icon name="check" size={18} color="white" />}
                                </View>
                                <View className="ml-3">
                                  <Text className="text-gray-900 font-bold">Senior Discount</Text>
                                  <Text className="text-gray-500 text-xs">20% off</Text>
                                </View>
                              </View>
                              <Text className="text-gray-700 font-bold">{seniorDiscount ? `- ₱${discountAmount}` : 'Off'}</Text>
                            </View>
                          </TouchableOpacity>
                        </View>

                        {/* Cart Items (only this scrolls) */}
                        <View className="bg-gray-50 rounded-2xl p-3 mb-3 border border-gray-100">
                          {cart.map((item) => (
                            <View key={item.id}>
                              {renderCartItem({ item })}
                            </View>
                          ))}
                        </View>

                        <View style={{ height: 12 }} />
                      </>
                    )}
                  </ScrollView>

                  {/* Sticky bottom panel (no scrolling) */}
                  {cart.length > 0 && (
                    <View className="px-4 pt-3 border-t border-gray-100" style={{ paddingBottom: Math.max(14, insets.bottom + 14) }}>
                      {/* Total row */}
                      <View className="bg-green-500 p-3 rounded-2xl mb-3">
                        <View className="flex-row justify-between items-center">
                          <View>
                            <Text className="text-white/90 text-[11px] font-semibold uppercase tracking-wider mb-0.5">Total</Text>
                            <Text className="text-white font-bold text-2xl">₱{total}</Text>
                            {seniorDiscount && (
                              <Text className="text-white/90 text-[11px] mt-0.5">-₱{discountAmount} (from ₱{subtotal})</Text>
                            )}
                          </View>
                          <View className="bg-green-600 p-3 rounded-2xl">
                            <Icon name="payments" size={22} color="white" />
                          </View>
                        </View>
                      </View>

                      {/* Quick cash + input */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2" nestedScrollEnabled={true}>
                        <View className="flex-row">
                          {quickAddAmounts.map((amount) => (
                            <TouchableOpacity
                              key={amount}
                              onPress={() => setCash(amount.toString())}
                              className="bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl mr-2"
                            >
                              <Text className="text-red-600 font-bold">₱{amount}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>

                      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                        <View className="flex-row items-center bg-white border-2 border-gray-300 rounded-2xl">
                          <View className="bg-red-600 p-3 rounded-l-2xl">
                            <Icon name="attach-money" size={20} color="white" />
                          </View>
                          <TextInput
                            className="flex-1 p-4 text-base"
                            placeholder="Cash amount"
                            keyboardType="numeric"
                            value={cash.toString()}
                            onChangeText={(value) => setCash(value)}
                            onFocus={zoomIn}
                            onBlur={zoomOut}
                          />
                        </View>
                      </Animated.View>

                      {cash && Number(cash) >= total && (
                        <View className="bg-green-500 p-3 rounded-2xl mt-3">
                          <View className="flex-row justify-between items-center">
                            <View className="flex-row items-center">
                              <Icon name="check-circle" size={18} color="white" />
                              <Text className="text-white font-bold ml-2">Change</Text>
                            </View>
                            <Text className="text-white font-bold text-xl">₱{change}</Text>
                          </View>
                        </View>
                      )}

                      {cash && Number(cash) < total && Number(cash) > 0 && (
                        <View className="bg-red-50 border border-red-200 p-3 rounded-2xl mt-3">
                          <View className="flex-row items-center justify-center">
                            <Icon name="error-outline" size={18} color="#DC2626" />
                            <Text className="text-red-600 text-center ml-2 font-medium">
                              Need ₱{total - Number(cash)} more
                            </Text>
                          </View>
                        </View>
                      )}

                      <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
                        <TouchableOpacity
                          onPress={handleCheckout}
                          className="bg-green-500 py-4 mt-3 rounded-2xl items-center shadow-lg"
                          activeOpacity={0.85}
                        >
                          <View className="flex-row items-center">
                            <Icon name="check-circle" size={20} color="white" />
                            <Text className="text-white font-bold text-base ml-2">Complete Order</Text>
                          </View>
                        </TouchableOpacity>
                      </Animated.View>
                    </View>
                  )}
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      
      {/* Ongoing Stocks Modal */}
      <Modal
        visible={ongoingStocksModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setOngoingStocksModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View className="bg-white rounded-2xl w-11/12 max-h-4/5">
            <View className="bg-red-600 p-4 rounded-t-2xl flex-row justify-between items-center">
              <Text className="text-white font-bold text-lg">Ongoing Stocks</Text>
              <TouchableOpacity onPress={() => setOngoingStocksModalVisible(false)}>
                <Icon name="close" size={28} color="white" />
              </TouchableOpacity>
            </View>
            {(() => {
              const receivedStocks = ongoingStocks.filter((s) => Number(s.pendingQty || 0) <= 0);
              const notReceivedStocks = ongoingStocks.filter((s) => Number(s.pendingQty || 0) > 0);

              return (
                <ScrollView className="p-4 max-h-96">
                  {/* NOT RECEIVED */}
                  <TouchableOpacity
                    onPress={toggleCollapsedNotReceived}
                    className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 mb-3"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center">
                        <View className="bg-orange-500/15 rounded-lg p-2 mr-3">
                          <Icon name="pending-actions" size={18} color="#F97316" />
                        </View>
                        <View>
                          <Text className="text-gray-900 font-bold">Not Received</Text>
                          <Text className="text-gray-500 text-xs">{notReceivedStocks.length} item(s)</Text>
                        </View>
                      </View>
                      <Icon
                        name={collapsedNotReceived ? 'expand-more' : 'expand-less'}
                        size={24}
                        color="#6B7280"
                      />
                    </View>
                  </TouchableOpacity>

                  {!collapsedNotReceived && (
                    <View className="mb-4">
                      {notReceivedStocks.length === 0 ? (
                        <View className="py-6 items-center bg-white rounded-xl border border-gray-100">
                          <Text className="text-gray-500">No pending stocks</Text>
                        </View>
                      ) : (
                        notReceivedStocks.map((item) => <OngoingStockRow key={item.id} item={item} />)
                      )}
                    </View>
                  )}

                  {/* RECEIVED */}
                  <TouchableOpacity
                    onPress={toggleCollapsedReceived}
                    className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 mb-3"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center">
                        <View className="bg-green-500/15 rounded-lg p-2 mr-3">
                          <Icon name="inventory" size={18} color="#10B981" />
                        </View>
                        <View>
                          <Text className="text-gray-900 font-bold">Received</Text>
                          <Text className="text-gray-500 text-xs">{receivedStocks.length} item(s)</Text>
                        </View>
                      </View>
                      <Icon
                        name={collapsedReceived ? 'expand-more' : 'expand-less'}
                        size={24}
                        color="#6B7280"
                      />
                    </View>
                  </TouchableOpacity>

                  {!collapsedReceived && (
                    <View className="mb-2">
                      {receivedStocks.length === 0 ? (
                        <View className="py-6 items-center bg-white rounded-xl border border-gray-100">
                          <Text className="text-gray-500">No received stocks yet</Text>
                        </View>
                      ) : (
                        receivedStocks.map((item) => <OngoingStockRow key={item.id} item={item} />)
                      )}
                    </View>
                  )}

                  {ongoingStocks.length === 0 && (
                    <View className="py-8 items-center">
                      <Text className="text-gray-500">No stocks available</Text>
                    </View>
                  )}
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>
      </View>
    </TouchableWithoutFeedback>
  );
}