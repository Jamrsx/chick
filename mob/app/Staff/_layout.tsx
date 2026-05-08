import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Alert, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { api } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const getBranchIdFromUser = (user: any) => {
  if (!user) return null;
  const u = user?.user ? user.user : user;
  if (!u) return null;
  if (u.branch_id) return u.branch_id;
  if (u.branchId) return u.branchId;
  if (u.branch?.id) return u.branch.id;

  const assignments = Array.isArray(u.branch_assignments)
    ? u.branch_assignments
    : Array.isArray(u.branchAssignments)
      ? u.branchAssignments
      : [];
  const activeAssignment = assignments.find((a: any) => a?.is_active) || assignments[0];
  return activeAssignment?.branch_id || activeAssignment?.branch?.id || null;
};

const resolveBranchId = async () => {
  const userRaw = await AsyncStorage.getItem('user');
  let user = userRaw ? JSON.parse(userRaw) : null;
  if (user?.user) user = user.user;

  let branchId = getBranchIdFromUser(user);
  if (branchId) return branchId;

  try {
    const response = await api.get('me');
    if (response.data) {
      user = response.data;
      await AsyncStorage.setItem('user', JSON.stringify(user));
    }
    branchId = getBranchIdFromUser(user);
    if (branchId) return branchId;
  } catch {
    // ignore
  }

  return null;
};

export default function StaffTabsLayout() {
  const router = useRouter();
  const { logout } = useAuth();
  const [hasPendingOngoingStock, setHasPendingOngoingStock] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const forceLogoutInProgressRef = useRef(false);

  const isUserActive = (value: any) => value === true || value === 1 || value === '1';

  const forceLogoutDisabledUser = async (userData?: any) => {
    if (forceLogoutInProgressRef.current) return;
    forceLogoutInProgressRef.current = true;
    console.log('[STAFF ACCESS] Disabled user detected, forcing logout', {
      userId: userData?.id,
      is_active: userData?.is_active,
    });
    Alert.alert(
      'Session Notice',
      'Your Account Has Been Disabled or Session Expire, please message admin or try logging in again'
    );
    try {
      await logout();
    } catch (e) {
      console.log('[STAFF ACCESS] context logout failed; fallback clear', e);
      await AsyncStorage.multiRemove([
        'token',
        'user',
        'role',
        'isLoggedIn',
        'currentStaffUsername',
      ]);
    }
    router.replace('/Login');
  };

  const validateActiveSession = async () => {
    try {
      const response = await api.get('me');
      const me = response?.data;
      if (!isUserActive(me?.is_active)) {
        await forceLogoutDisabledUser(me);
        return false;
      }
      if (me) {
        await AsyncStorage.setItem('user', JSON.stringify(me));
      }
      return true;
    } catch (e: any) {
      if (e?.response?.status === 401 || e?.response?.status === 403) {
        await forceLogoutDisabledUser();
        return false;
      }
      console.log('[STAFF ACCESS] session validation failed:', e?.response?.status, e?.message);
      return true;
    }
  };

  useEffect(() => {
    let interval: any = null;
    let authInterval: any = null;
    let alive = true;

    const refreshPending = async () => {
      try {
        const stillAllowed = await validateActiveSession();
        if (!stillAllowed) return;
        const branchId = await resolveBranchId();
        console.log('[TABS] resolved branchId for pending:', branchId);
        const params = branchId ? { branch_id: branchId } : {};
        const res = await api.get('products/restock/pending-count', { params });
        const pendingCount = Number(res?.data?.pending_count || 0);
        console.log('[TABS] pending restocks count:', pendingCount, 'raw:', res?.data);
        setHasPendingOngoingStock(pendingCount > 0);
      } catch (e: any) {
        console.log('[TABS] pending restocks fetch failed:', e?.response?.status, e?.response?.data || e?.message);
      }
    };

    const boot = async () => {
      const allowed = await validateActiveSession();
      if (!alive) return;
      setCheckingAccess(false);
      if (!allowed) return;
      refreshPending();
      authInterval = setInterval(() => {
        validateActiveSession();
      }, 10000);
    };

    boot();
    interval = setInterval(refreshPending, 30 * 1000);
    return () => {
      alive = false;
      if (interval) clearInterval(interval);
      if (authInterval) clearInterval(authInterval);
    };
  }, []);

  if (checkingAccess) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#DC2626',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          height: 90,
          paddingTop: 6,
          paddingBottom: 20,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="Dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Icon name="dashboard" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="PointOfSales"
        options={{
          title: 'POS',
          tabBarIcon: ({ color, size }) => (
            <View style={{ position: 'relative' }}>
              <Icon name="point-of-sale" color={color} size={size} />
              {hasPendingOngoingStock && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: '#EF4444',
                    borderWidth: 2,
                    borderColor: 'rgba(255,255,255,0.9)',
                  }}
                />
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="Attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color, size }) => (
            <Icon name="schedule" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Icon name="person" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
