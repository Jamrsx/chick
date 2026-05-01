import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
  Alert,
  ScrollView,
} from 'react-native';
import { api } from '../../config/api';

export default function AttendanceScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [mode, setMode] = useState<'time_in' | 'time_out'>('time_in');
  const [attendance, setAttendance] = useState<any | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [staffAssignment, setStaffAssignment] = useState<any | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const cameraRef = useRef<CameraView | null>(null);

  const getPhilippinesTime = () => {
    const now = new Date();
    const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const time = now.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return { date, time };
  };

  const getAttendanceDate = (record: any) => {
    const rawDate = record?.date || record?.created_at || '';
    if (typeof rawDate !== 'string') return '';
    const match = rawDate.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '';
  };

  const todayDate = getPhilippinesTime().date;
  const attendanceDate = getAttendanceDate(attendance);
  const isTodayAttendance = attendanceDate === todayDate;
  const hasTimedIn = Boolean(attendance?.time_in);
  const hasTimedOut = Boolean(attendance?.time_out);
  const hasOpenAttendance = hasTimedIn && !hasTimedOut;
  const hasCompletedToday = isTodayAttendance && hasTimedIn && hasTimedOut;
  const hasTimedInToday = isTodayAttendance && hasTimedIn;
  const canTimeIn = !attendanceLoading && !hasOpenAttendance && !hasCompletedToday;
  const canTimeOut = !attendanceLoading && hasOpenAttendance;

  useEffect(() => {
    loadUserData();
  }, []);

  const addDebug = (message: string) => {
    console.log(message);
    setDebugInfo(prev => prev + '\n' + message);
  };

  const loadUserData = async () => {
    try {
      setUserLoading(true);
      setDebugInfo('Loading user data...');
      
      // Get user from storage
      const userRaw = await AsyncStorage.getItem('user');
      addDebug(`User from storage: ${userRaw ? 'Found' : 'Not found'}`);
      
      let userData = userRaw ? JSON.parse(userRaw) : null;
      
      if (!userData?.id) {
        addDebug('No user ID in storage, fetching from API...');
        try {
          const response = await api.get('/me');
          userData = response.data;
          addDebug(`User fetched: ID=${userData.id}, Name=${userData.name}`);
          await AsyncStorage.setItem('user', JSON.stringify(userData));
        } catch (error: any) {
          addDebug(`Failed to fetch user: ${error.message}`);
          console.error('Failed to fetch user:', error);
        }
      }
      
      setUser(userData);
      addDebug(`User ID: ${userData?.id}`);
      
      // Fetch staff assignment from staff_assignments table
      if (userData?.id) {
        await fetchStaffAssignment(userData.id);
      }
      
    } catch (error: any) {
      addDebug(`Error in loadUserData: ${error.message}`);
      console.error('Failed to load user data:', error);
      Alert.alert('Error', 'Failed to load user data. Please login again.');
    } finally {
      setUserLoading(false);
    }
  };

  const fetchStaffAssignment = async (userId: number) => {
    try {
      addDebug(`Fetching staff assignment for user ID: ${userId}`);
      
      // Try to get staff assignment from staff_assignments table
      const response = await api.get(`/staff-assignments`, {
        params: { user_id: userId, is_active: true }
      });
      
      addDebug(`Staff assignment response: ${JSON.stringify(response.data)}`);
      
      let assignment = null;
      
      // Check if response is array and has data
      if (Array.isArray(response.data) && response.data.length > 0) {
        assignment = response.data[0];
      } else if (response.data && typeof response.data === 'object') {
        assignment = response.data;
      }
      
      if (assignment && assignment.branch_id) {
        setStaffAssignment(assignment);
        setBranchId(assignment.branch_id);
        addDebug(`Found active staff assignment - Branch ID: ${assignment.branch_id}, Position: ${assignment.position}, Daily Rate: ${assignment.daily_rate}`);
        
        // Update user data with branch info
        const updatedUser = { ...user, branch_id: assignment.branch_id, staff_assignment: assignment };
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        
        // Load attendance record
        await loadAttendanceRecord(userId, assignment.branch_id);
      } else {
        addDebug('No active staff assignment found');
        setBranchId(null);
      }
      
    } catch (error: any) {
      addDebug(`Error fetching staff assignment: ${error.message}`);
      console.error('Failed to fetch staff assignment:', error);
      
      // Try alternative endpoint if needed
      try {
        addDebug('Trying alternative endpoint: /staff/{userId}/assignment');
        const altResponse = await api.get(`/staff/${userId}/assignment`);
        addDebug(`Alternative response: ${JSON.stringify(altResponse.data)}`);
        
        if (altResponse.data && altResponse.data.branch_id) {
          setStaffAssignment(altResponse.data);
          setBranchId(altResponse.data.branch_id);
          addDebug(`Found via alternative endpoint - Branch ID: ${altResponse.data.branch_id}`);
          
           await loadAttendanceRecord(userId, altResponse.data.branch_id);
        }
      } catch (altError: any) {
        addDebug(`Alternative endpoint also failed: ${altError.message}`);
      }
    }
  };

  const loadAttendanceRecord = async (userId: number, branchIdValue: number) => {
    if (!userId || !branchIdValue) return;
    
    setAttendanceLoading(true);
    try {
      const { date: today } = getPhilippinesTime();
      addDebug(`Fetching attendance for user=${userId}, branch=${branchIdValue}, date=${today}`);
      
      const response = await api.get('/attendance', {
        params: { user_id: userId, branch_id: branchIdValue, date: today }
      });
      
      let record = Array.isArray(response.data) ? response.data[0] : response.data;

      if (!record) {
        const fallbackResponse = await api.get('/attendance', {
          params: { user_id: userId, branch_id: branchIdValue }
        });
        const records = Array.isArray(fallbackResponse.data) ? fallbackResponse.data : [];
        record = records.find((item: any) => item?.time_in && !item?.time_out) || null;
      }

      setAttendance(record);
      addDebug(`Attendance record: ${record ? 'Found' : 'Not found'}`);
      
      if (record) {
        addDebug(`Time In: ${record.time_in || 'Not set'}, Time Out: ${record.time_out || 'Not set'}`);
      }
    } catch (error: any) {
      addDebug(`Failed to load attendance: ${error.message}`);
      console.error('Failed to load attendance:', error);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleTimeIn = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'User not found. Please login again.');
      return;
    }

    if (hasTimedInToday) {
      Alert.alert(
        'Already Timed In',
        isTodayAttendance
          ? 'You already recorded your time in for today.'
          : 'You still need to time out from your previous attendance record.'
      );
      setMode('time_out');
      return;
    }
    
    if (!branchId) {
      Alert.alert(
        'No Branch Assignment',
        'You are not assigned to any branch. Please contact administrator to assign you in staff_assignments table.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setLoading(true);
    try {
      const { date, time } = getPhilippinesTime();
      addDebug(`Time In: user=${user.id}, branch=${branchId}, date=${date}, time=${time}`);
      
      const response = await api.post('/attendance/time-in', {
        user_id: user.id,
        branch_id: branchId,
        date: date,
        time_in: time,
      });
      
      setAttendance(response.data.attendance || response.data);
      setMode('time_out');
      Alert.alert('Success', `Time In recorded at ${time}`);
      addDebug(`Time In successful`);
    } catch (error: any) {
      addDebug(`Time In error: ${error.message}`);
      console.error('Time in error:', error);
      
      let errorMessage = 'Failed to record time in';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeOut = async () => {
    if (!attendance?.id) {
      Alert.alert('Error', 'Please time in first');
      return;
    }

    if (!hasTimedIn) {
      Alert.alert('Time In Required', 'Please time in first before recording time out.');
      setMode('time_in');
      return;
    }

    if (hasTimedOut) {
      Alert.alert('Already Timed Out', 'You already recorded your time out for today. You can time in again tomorrow.');
      return;
    }
    
    setLoading(true);
    try {
      const { time } = getPhilippinesTime();
      addDebug(`Time Out: attendance=${attendance.id}, time=${time}`);
      
      const response = await api.put(`/attendance/${attendance.id}/time-out`, {
        time_out: time,
      });
      
      setAttendance(response.data.attendance || response.data);
      setMode('time_in');
      Alert.alert('Success', `Time Out recorded at ${time}`);
      addDebug(`Time Out successful`);
    } catch (error: any) {
      addDebug(`Time Out error: ${error.message}`);
      console.error('Time out error:', error);
      
      let errorMessage = 'Failed to record time out';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View className="flex-1 justify-center items-center bg-black">
        <Text className="text-white mb-4">Camera permission required</Text>
        <TouchableOpacity 
          onPress={requestPermission}
          className="bg-blue-500 px-6 py-3 rounded-lg"
        >
          <Text className="text-white font-bold">Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (userLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-black">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="text-white mt-4">Loading user data...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View className="flex-1 justify-center items-center bg-black">
        <Text className="text-white mb-4">Session expired</Text>
        <TouchableOpacity 
          onPress={() => {
            // Navigate to login
          }}
          className="bg-blue-500 px-6 py-3 rounded-lg"
        >
          <Text className="text-white font-bold">Login Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show debug view if no branch
  if (!branchId) {
    return (
      <ScrollView className="flex-1 bg-black p-6">
        <Text className="text-yellow-400 text-4xl mb-4 text-center">⚠️</Text>
        <Text className="text-white text-center text-lg font-bold mb-2">
          No Branch Assignment
        </Text>
        <Text className="text-gray-400 text-center mb-6">
          You are not assigned to any branch in staff_assignments table.
        </Text>
        
        <View className="bg-gray-900 p-4 rounded-lg mb-4">
          <Text className="text-white font-bold mb-2">User Information:</Text>
          <Text className="text-gray-400">ID: {user.id}</Text>
          <Text className="text-gray-400">Name: {user.name}</Text>
          <Text className="text-gray-400">Email: {user.email}</Text>
          <Text className="text-gray-400">Role: {user.role || user.role_id || 'Staff'}</Text>
        </View>
        
        <View className="bg-gray-900 p-4 rounded-lg mb-4">
          <Text className="text-white font-bold mb-2">Solution:</Text>
          <Text className="text-gray-400 text-sm mb-2">
            1. Run this SQL in your database:
          </Text>
          <View className="bg-black p-2 rounded">
            <Text className="text-green-400 text-xs">
              INSERT INTO staff_assignments (user_id, branch_id, position, daily_rate, is_active, created_at, updated_at){'\n'}
              VALUES ({user.id}, 1, &apos;Staff&apos;, 500.00, 1, NOW(), NOW());
            </Text>
          </View>
        </View>
        
        <View className="bg-gray-900 p-4 rounded-lg">
          <Text className="text-white font-bold mb-2">Debug Information:</Text>
          <Text className="text-gray-400 text-xs">{debugInfo || 'No debug info'}</Text>
        </View>
        
        <TouchableOpacity 
          onPress={loadUserData}
          className="bg-blue-500 px-6 py-3 rounded-lg mt-4"
        >
          <Text className="text-white font-bold text-center">Retry Loading</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front" />

      {/* Mode Toggle Buttons */}
      <View className="absolute top-16 left-0 right-0 flex-row justify-center gap-4 px-4">
        <TouchableOpacity
          onPress={() => setMode('time_in')}
          disabled={!canTimeIn && mode !== 'time_in'}
          className={`flex-1 max-w-[150px] py-3 rounded-xl ${
            mode === 'time_in' ? 'bg-green-500' : !canTimeIn ? 'bg-gray-800 opacity-60' : 'bg-gray-700'
          }`}
        >
          <Text className="text-white text-center font-bold text-lg">Time In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMode('time_out')}
          disabled={!canTimeOut && mode !== 'time_out'}
          className={`flex-1 max-w-[150px] py-3 rounded-xl ${
            mode === 'time_out' ? 'bg-red-500' : !canTimeOut ? 'bg-gray-800 opacity-60' : 'bg-gray-700'
          }`}
        >
          <Text className="text-white text-center font-bold text-lg">Time Out</Text>
        </TouchableOpacity>
      </View>

      {/* Staff Info Card */}
      <View className="absolute top-32 left-4 right-4 bg-black/80 p-4 rounded-xl">
        <Text className="text-white text-lg font-bold mb-2">Today&apos;s Attendance</Text>
        <Text className="text-gray-300 text-sm">
          Staff: {user.name}
        </Text>
        <Text className="text-gray-400 text-xs mb-2">
          Branch ID: {branchId} | Position: {staffAssignment?.position || 'Staff'}
        </Text>
        <Text className="text-gray-400 text-xs mb-2">
          Daily Rate: ₱{staffAssignment?.daily_rate || '0'}
        </Text>
        
        {attendanceLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : attendance ? (
          <>
            <Text className="text-gray-300 mt-2">Time In: {attendance.time_in || '—'}</Text>
            <Text className="text-gray-300">Time Out: {attendance.time_out || '—'}</Text>
            {attendance.is_late && (
              <Text className="text-yellow-400">⚠️ Late by: {attendance.late_minutes} min</Text>
            )}
          </>
        ) : (
          <Text className="text-gray-400 mt-2">No attendance record yet</Text>
        )}
      </View>

      {/* Capture Button */}
      <View className="absolute bottom-10 left-0 right-0 items-center">
        <TouchableOpacity
          onPress={mode === 'time_in' ? handleTimeIn : handleTimeOut}
          disabled={loading || (mode === 'time_in' ? !canTimeIn : !canTimeOut)}
          className={`w-20 h-20 rounded-full justify-center items-center shadow-lg ${
            loading || (mode === 'time_in' ? !canTimeIn : !canTimeOut) ? 'bg-gray-500 opacity-60' : 'bg-white'
          }`}
        >
          {loading ? (
            <ActivityIndicator size="large" color="#3B82F6" />
          ) : (
            <View className="w-16 h-16 border-4 border-gray-400 rounded-full" />
          )}
        </TouchableOpacity>
        <Text className="text-white text-sm mt-3 opacity-75">
          {mode === 'time_in'
            ? hasTimedInToday
              ? isTodayAttendance
                ? 'Time In already recorded today'
                : 'Time Out previous record first'
              : 'Tap to Time In'
            : hasTimedOut
              ? 'Time Out already recorded today'
              : !hasTimedIn
                ? 'Time In first'
                : 'Tap to Time Out'}
        </Text>
      </View>
    </View>
  );
}
