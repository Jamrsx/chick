import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { api } from '../../config/api';

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
  const [hasPendingOngoingStock, setHasPendingOngoingStock] = useState(false);

  useEffect(() => {
    let interval: any = null;

    const refreshPending = async () => {
      try {
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

    refreshPending();
    interval = setInterval(refreshPending, 30 * 1000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

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
