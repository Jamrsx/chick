import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
  Alert,
  ScrollView,
} from 'react-native';
import FaceDetectionWebView, {
  type FaceDetectionWebViewHandle,
} from '../../components/FaceDetectionWebView';
import { api } from '../../config/api';
import { buildLandmarkEmbedding, normalizeEmbedding } from '../../utils/faceEmbedding';
import { FaceScanOverlay, type ScanPhase } from './FaceScanOverlay';
import {
  isFaceDetectorNativeAvailable,
} from '../../utils/expoFaceDetectorOptional';
import { landmarks68ToFaceLandmarksInput } from '../../utils/landmarks68ToFace';

function isStaffUser(u: any): boolean {
  return String(u?.role ?? '').toLowerCase() === 'staff';
}

function attendanceErrorMessage(error: any): string {
  const code = error?.response?.data?.code;
  if (code === 'FACE_MISMATCH') {
    return 'Face not recognized. Match your enrollment pose and lighting.';
  }
  if (code === 'FACE_NOT_ENROLLED') {
    return 'Register your face on this screen before time in or out.';
  }
  if (code === 'FACE_EMBEDDING_REQUIRED') {
    return 'Face check did not complete. Try again.';
  }
  if (code === 'FACE_DIM_MISMATCH') {
    return 'Face data format changed. Register your face again.';
  }
  if (code === 'FACE_TEMPLATE_WEAK') {
    return 'Old face template found. Register again to use high-accuracy face recognition.';
  }
  if (code === 'FACE_STRONG_EMBEDDING_REQUIRED') {
    return 'High-accuracy face model is still loading. Keep this screen open, then retry.';
  }
  if (code === 'FACE_REENROLL_MISMATCH') {
    return 'Re-enroll failed because the face does not match the currently enrolled owner.';
  }
  if (code === 'FACE_REENROLL_BLOCKED') {
    return 'Existing face template is incompatible. Ask admin to reset face enrollment.';
  }
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.response?.data?.error) {
    return error.response.data.error;
  }
  return error?.message ?? 'Something went wrong.';
}

function ScreenCenter(props: { title?: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <View className="flex-1 justify-center items-center bg-black px-6">
      {props.title ? <Text className="text-white text-base font-semibold">{props.title}</Text> : null}
      {props.subtitle ? (
        <Text className="text-gray-300 text-sm text-center mt-2">{props.subtitle}</Text>
      ) : null}
      {props.children ? <View className="mt-5 w-full">{props.children}</View> : null}
    </View>
  );
}

function Pill(props: { text: string; tone?: 'neutral' | 'success' | 'danger' | 'warning' }) {
  const tone = props.tone ?? 'neutral';
  const cls =
    tone === 'success'
      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
      : tone === 'danger'
        ? 'bg-rose-500/15 border-rose-500/30 text-rose-200'
        : tone === 'warning'
          ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
          : 'bg-white/10 border-white/15 text-gray-200';

  return (
    <View className={`px-3 py-1 rounded-full border ${cls}`}>
      <Text className="text-xs font-semibold">{props.text}</Text>
    </View>
  );
}

function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'violet' | 'blue' | 'green' | 'red';
  loading?: boolean;
}) {
  const tone = props.tone ?? 'blue';
  const base =
    tone === 'violet'
      ? 'bg-violet-600'
      : tone === 'green'
        ? 'bg-emerald-600'
        : tone === 'red'
          ? 'bg-rose-600'
          : 'bg-blue-600';
  return (
    <TouchableOpacity
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      className={`py-4 rounded-xl items-center ${props.disabled || props.loading ? 'bg-gray-700/70' : base}`}
    >
      {props.loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text className="text-white font-bold text-base">{props.label}</Text>
      )}
    </TouchableOpacity>
  );
}

function InfoRow(props: { label: string; value: React.ReactNode }) {
  return (
    <View className="flex-row items-start justify-between gap-3 py-1.5">
      <Text className="text-gray-400 text-xs">{props.label}</Text>
      <Text className="text-gray-200 text-xs font-semibold text-right flex-1">{props.value}</Text>
    </View>
  );
}

function Card(props: { children: React.ReactNode; className?: string }) {
  return <View className={`rounded-2xl bg-zinc-900/80 border border-white/10 ${props.className ?? ''}`}>{props.children}</View>;
}

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

  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [faceStatusLoading, setFaceStatusLoading] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [enrollingFace, setEnrollingFace] = useState(false);
  const [faceModuleAvailable] = useState(() => {
    const ok = isFaceDetectorNativeAvailable();
    console.log('[FACE] Native expo-face-detector usable (not Expo Go + module linked):', ok);
    return ok;
  });
  const [scanPhase, setScanPhase] = useState<ScanPhase>('scanning');
  const [scanConfidence, setScanConfidence] = useState<number | null>(null);
  const [scanThreshold, setScanThreshold] = useState<number | null>(null);
  const [showBottomDetails, setShowBottomDetails] = useState(false);

  const cameraRef = useRef<InstanceType<typeof CameraView> | null>(null);
  const faceWebRef = useRef<FaceDetectionWebViewHandle | null>(null);
  const scanInFlightRef = useRef(false);
  const scanCooldownUntilRef = useRef<number>(0);

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
  const staffNeedsFace = user ? isStaffUser(user) : false;
  const staffFaceReady = !staffNeedsFace || (!faceStatusLoading && faceEnrolled);
  const canTimeIn =
    staffFaceReady && !attendanceLoading && !hasOpenAttendance && !hasCompletedToday;
  const canTimeOut = staffFaceReady && !attendanceLoading && hasOpenAttendance;

  useEffect(() => {
    loadUserData();
  }, []);

  const addDebug = (message: string) => {
    console.log(message);
    setDebugInfo(prev => prev + '\n' + message);
  };

  const refreshFaceStatus = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    if (!isStaffUser(user)) {
      console.log('[FACE] Non-staff user; skip enrollment status');
      setFaceEnrolled(true);
      setFaceStatusLoading(false);
      return;
    }

    setFaceStatusLoading(true);
    try {
      const res = await api.get('/face/status');
      console.log('[FACE] /face/status', res.data);
      setFaceEnrolled(res.data?.enrolled === true);
    } catch (err) {
      console.log('[FACE] status request failed', err);
      setFaceEnrolled(false);
    } finally {
      setFaceStatusLoading(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    refreshFaceStatus();
  }, [refreshFaceStatus]);

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

  useFocusEffect(
    useCallback(() => {
      if (!user?.id || !branchId) {
        return;
      }
      console.log('[ATTENDANCE UI] screen focused; refreshing face status + attendance');
      refreshFaceStatus();
      loadAttendanceRecord(user.id, branchId);
    }, [user?.id, branchId, refreshFaceStatus])
  );

  const showFaceNeedsDevBuild = () => {
    Alert.alert(
      'Face detection',
      'Native face module failed. If you use Expo Go, wait on Wi‑Fi for browser models, or run npx expo prebuild then npx expo run:android.'
    );
  };

  const waitForWebFaceReady = async (timeoutMs = 120000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (faceWebRef.current?.ready) {
        console.log('[FACE-WEB] ready after', Date.now() - t0, 'ms');
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error('WEB_FACE_TIMEOUT');
  };

  const captureFaceEmbedding = async (opts?: { silent?: boolean; requireStrong?: boolean }): Promise<number[] | null> => {
    if (!cameraRef.current) {
      if (!opts?.silent) {
        Alert.alert('Camera', 'Camera is not ready yet.');
      }
      return null;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.45,
        base64: true,
        shutterSound: false,
      });
      console.log('[FACE] captured frame', photo?.width, photo?.height);

      console.log('[FACE] WebView face-api.js path (preferred for recognition)');
      try {
        await waitForWebFaceReady(120000);
      } catch {
        if (!opts?.silent) {
          Alert.alert(
            'Face detection',
            'Face models did not load. Use Wi‑Fi, stay on this screen ~30s, then try again.'
          );
        }
        return null;
      }

      if (!faceWebRef.current?.ready) {
        if (!opts?.silent) {
          Alert.alert('Face detection', 'Browser face engine not ready yet.');
        }
        return null;
      }

      const b64 =
        typeof photo.base64 === 'string'
          ? photo.base64
          : await FileSystemLegacy.readAsStringAsync(photo.uri, {
              encoding: FileSystemLegacy.EncodingType.Base64,
            });
      const webRes = await faceWebRef.current.detectFromBase64(b64);
      console.log('[FACE-WEB] result', webRes.ok, !webRes.ok ? webRes.code : '');

      if (!webRes.ok) {
        if (!opts?.silent) {
          if (webRes.code === 'NO_FACE') {
            Alert.alert('Face check', 'No face detected. Move closer and use good lighting.');
          } else if (webRes.code === 'MULTI_FACE') {
            Alert.alert('Face check', 'Only one person should be in the frame.');
          } else if (webRes.code === 'TIMEOUT' || webRes.code === 'NOT_READY') {
            Alert.alert('Face detection', 'Models still loading. Wait on Wi‑Fi a few seconds and retry.');
          } else {
            Alert.alert('Face check', webRes.error || webRes.code || 'Could not verify face.');
          }
        }
        return null;
      }

      if (Array.isArray(webRes.descriptor) && webRes.descriptor.length >= 64) {
        console.log('[FACE] Using face-api descriptor dim=', webRes.descriptor.length);
        return normalizeEmbedding(webRes.descriptor.map((v) => Number(v)));
      }

      const faceInput = landmarks68ToFaceLandmarksInput(webRes.box, webRes.landmarks);
      if (!faceInput) {
        if (!opts?.silent) {
          Alert.alert('Face check', 'Could not map landmarks. Face the camera straight on.');
        }
        return null;
      }

      const embedding = buildLandmarkEmbedding(faceInput);
      if (!embedding) {
        if (!opts?.silent) {
          Alert.alert(
            'Face check',
            'Could not read face geometry. Try brighter light and face straight on.'
          );
        }
        return null;
      }

      if (opts?.requireStrong) {
        if (!opts?.silent) {
          Alert.alert(
            'Face recognition',
            'High-accuracy face descriptor not ready yet. Stay on this screen for model loading, then retry.'
          );
        }
        return null;
      }
      return embedding;
    } catch (err: any) {
      console.log('[FACE] captureFaceEmbedding error', err?.message, err);
      const msg = String(err?.message ?? '');
      if (
        msg.includes('not available') ||
        msg.includes('Cannot find native module') ||
        msg.includes('ExpoFaceDetector') ||
        err?.code === 'ERR_UNAVAILABLE'
      ) {
        if (!opts?.silent) {
          showFaceNeedsDevBuild();
        }
      } else {
        if (!opts?.silent) {
          Alert.alert('Face check', msg || 'Could not verify face.');
        }
      }
      return null;
    }
  };

  const submitAutoAttendance = async () => {
    if (!user?.id || !branchId) return;
    if (!isStaffUser(user) || !faceEnrolled) return;
    if (loading || enrollingFace) return;

    const now = Date.now();
    if (scanInFlightRef.current) return;
    if (now < scanCooldownUntilRef.current) return;

    const shouldTimeIn = mode === 'time_in' && canTimeIn;
    const shouldTimeOut = mode === 'time_out' && canTimeOut;
    if (!shouldTimeIn && !shouldTimeOut) return;

    scanInFlightRef.current = true;
    setScanPhase('scanning');
    try {
      const emb = await captureFaceEmbedding({ silent: true, requireStrong: true });
      if (!emb) {
        setScanPhase('scanning');
        return;
      }

      setScanPhase('checking');

      if (shouldTimeIn) {
        const { date, time } = getPhilippinesTime();
        const body: Record<string, unknown> = {
          user_id: user.id,
          branch_id: branchId,
          date,
          time_in: time,
          face_embedding: emb,
        };
        console.log('[FACE] auto time-in request');
        const response = await api.post('/attendance/time-in', body);
        setAttendance(response.data.attendance || response.data);
        setMode('time_out');
        const sim = response.data?.similarity;
        const th = response.data?.threshold;
        if (typeof sim === 'number') setScanConfidence(sim);
        if (typeof th === 'number') setScanThreshold(th);
        Alert.alert('Success', `Time In recorded at ${time}`);
        scanCooldownUntilRef.current = Date.now() + 2500;
        return;
      }

      if (shouldTimeOut && attendance?.id) {
        const { time } = getPhilippinesTime();
        const body: Record<string, unknown> = {
          time_out: time,
          face_embedding: emb,
        };
        console.log('[FACE] auto time-out request');
        const response = await api.put(`/attendance/${attendance.id}/time-out`, body);
        setAttendance(response.data.attendance || response.data);
        setMode('time_in');
        const sim = response.data?.similarity;
        const th = response.data?.threshold;
        if (typeof sim === 'number') setScanConfidence(sim);
        if (typeof th === 'number') setScanThreshold(th);
        Alert.alert('Success', `Time Out recorded at ${time}`);
        scanCooldownUntilRef.current = Date.now() + 2500;
      }
    } catch (err: any) {
      const code = err?.response?.data?.code;
      const sim = err?.response?.data?.similarity;
      const th = err?.response?.data?.threshold;
      console.log('[FACE] auto attendance error', code, err?.response?.data ?? err?.message);
      if (code === 'FACE_MISMATCH') {
        setScanPhase('mismatch');
        if (typeof sim === 'number') setScanConfidence(sim);
        if (typeof th === 'number') setScanThreshold(th);
        scanCooldownUntilRef.current = Date.now() + 2500;
        setTimeout(() => setScanPhase('scanning'), 2000);
      } else {
        Alert.alert('Error', attendanceErrorMessage(err));
        scanCooldownUntilRef.current = Date.now() + 2500;
      }
    } finally {
      scanInFlightRef.current = false;
      if (Date.now() >= scanCooldownUntilRef.current) {
        setScanPhase('scanning');
      }
    }
  };

  useEffect(() => {
    if (!permission?.granted) return;
    if (!user?.id) return;
    if (!isStaffUser(user)) return;
    if (!faceEnrolled) return;
    if (!branchId) return;
    if (faceStatusLoading) return;

    const id = setInterval(() => {
      submitAutoAttendance();
    }, 1600);

    return () => clearInterval(id);
  }, [
    permission?.granted,
    user?.id,
    user?.role,
    faceEnrolled,
    faceStatusLoading,
    branchId,
    mode,
    canTimeIn,
    canTimeOut,
    attendance?.id,
    loading,
    enrollingFace,
  ]);

  const handleRegisterFace = async () => {
    if (!isStaffUser(user)) {
      return;
    }
    setEnrollingFace(true);
    try {
      const embedding = await captureFaceEmbedding({ requireStrong: true });
      if (!embedding) {
        return;
      }
      const res = await api.post('/face/enroll', { embedding });
      console.log('[FACE] enroll ok', res.data);
      setFaceEnrolled(true);
      Alert.alert('Done', 'Your face is registered for attendance.');
    } catch (err: any) {
      console.log('[FACE] enroll failed', err?.response?.data ?? err?.message);
      Alert.alert('Register face', attendanceErrorMessage(err));
    } finally {
      setEnrollingFace(false);
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

      let faceEmbedding: number[] | undefined;
      if (isStaffUser(user)) {
        const emb = await captureFaceEmbedding({ requireStrong: true });
        if (!emb) {
          setLoading(false);
          return;
        }
        faceEmbedding = emb;
      }

      const body: Record<string, unknown> = {
        user_id: user.id,
        branch_id: branchId,
        date: date,
        time_in: time,
      };
      if (faceEmbedding) {
        body.face_embedding = faceEmbedding;
      }

      const response = await api.post('/attendance/time-in', body);
      
      setAttendance(response.data.attendance || response.data);
      const sim = response.data?.similarity;
      const th = response.data?.threshold;
      if (typeof sim === 'number') setScanConfidence(sim);
      if (typeof th === 'number') setScanThreshold(th);
      setMode('time_out');
      Alert.alert('Success', `Time In recorded at ${time}`);
      addDebug(`Time In successful`);
    } catch (error: any) {
      addDebug(`Time In error: ${error.message}`);
      console.error('Time in error:', error);
      
      Alert.alert('Error', attendanceErrorMessage(error));
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

      let faceEmbedding: number[] | undefined;
      if (isStaffUser(user)) {
        const emb = await captureFaceEmbedding({ requireStrong: true });
        if (!emb) {
          setLoading(false);
          return;
        }
        faceEmbedding = emb;
      }

      const body: Record<string, unknown> = { time_out: time };
      if (faceEmbedding) {
        body.face_embedding = faceEmbedding;
      }

      const response = await api.put(`/attendance/${attendance.id}/time-out`, body);
      
      setAttendance(response.data.attendance || response.data);
      const sim = response.data?.similarity;
      const th = response.data?.threshold;
      if (typeof sim === 'number') setScanConfidence(sim);
      if (typeof th === 'number') setScanThreshold(th);
      setMode('time_in');
      Alert.alert('Success', `Time Out recorded at ${time}`);
      addDebug(`Time Out successful`);
    } catch (error: any) {
      addDebug(`Time Out error: ${error.message}`);
      console.error('Time out error:', error);
      
      Alert.alert('Error', attendanceErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  if (!permission?.granted) {
    return (
      <ScreenCenter
        title="Camera permission required"
        subtitle="Enable camera access to record time in/out with face verification."
      >
        <PrimaryButton label="Grant Permission" onPress={requestPermission} tone="blue" />
      </ScreenCenter>
    );
  }

  if (userLoading) {
    return (
      <ScreenCenter title="Loading user data...">
        <View className="items-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </ScreenCenter>
    );
  }

  if (!user) {
    return (
      <ScreenCenter title="Session expired" subtitle="Please login again to continue.">
        <PrimaryButton
          label="Login Again"
          onPress={() => {
            // Navigate to login
          }}
          tone="blue"
        />
      </ScreenCenter>
    );
  }

  const staffUser = user ? isStaffUser(user) : false;
  const showFaceWebLayer = staffUser && !!branchId;

  // Show debug view if no branch
  if (!branchId) {
    return (
      <ScrollView className="flex-1 bg-black" contentContainerStyle={{ padding: 18, paddingBottom: 28 }}>
        <View className="pt-10 pb-4 items-center">
          <Pill text="Action needed" tone="warning" />
          <Text className="text-white text-xl font-extrabold mt-3">No Branch Assignment</Text>
          <Text className="text-gray-300 text-sm text-center mt-2">
            You are not assigned to any branch in the staff assignments table.
          </Text>
        </View>

        <Card className="p-4">
          <Text className="text-white font-bold mb-3">User information</Text>
          <InfoRow label="ID" value={user.id} />
          <InfoRow label="Name" value={user.name} />
          <InfoRow label="Email" value={user.email} />
          <InfoRow label="Role" value={user.role || user.role_id || 'Staff'} />
        </Card>

        <View className="h-4" />

        <Card className="p-4">
          <Text className="text-white font-bold mb-2">Quick fix (SQL)</Text>
          <Text className="text-gray-300 text-xs mb-3">
            Add an active row in <Text className="font-semibold">staff_assignments</Text> for this user.
          </Text>
          <View className="bg-black/60 border border-white/10 rounded-xl p-3">
            <Text className="text-emerald-300 text-[11px] leading-4">
              INSERT INTO staff_assignments (user_id, branch_id, position, daily_rate, is_active, created_at, updated_at){'\n'}
              VALUES ({user.id}, 1, &apos;Staff&apos;, 500.00, 1, NOW(), NOW());
            </Text>
          </View>
        </Card>

        <View className="h-4" />

        <Card className="p-4">
          <Text className="text-white font-bold mb-2">Debug information</Text>
          <Text className="text-gray-400 text-[11px] leading-4">{debugInfo || 'No debug info'}</Text>
        </Card>

        <View className="h-5" />

        <PrimaryButton label="Retry Loading" onPress={loadUserData} tone="blue" />
      </ScrollView>
    );
  }

  let attendanceBody: React.ReactNode;

  // Staff: loading face enrollment status before showing attendance camera
  if (staffUser && faceStatusLoading) {
    console.log('[FACE] Blocking UI until face status is loaded');
    attendanceBody = (
      <View className="flex-1 bg-black justify-center items-center px-6">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="text-white mt-4 text-center text-base">
          Checking face registration...
        </Text>
      </View>
    );
  } else if (staffUser && !faceEnrolled) {
    console.log('[FACE UI] render registration-first layout');
    // Staff without enrolled face: registration only
    attendanceBody = (
      <ScrollView className="flex-1 bg-black" contentContainerStyle={{ flexGrow: 1, paddingBottom: 28 }}>
        <View className="px-4 pt-12 pb-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-white text-2xl font-extrabold">Face registration</Text>
              <Text className="text-gray-300 text-sm mt-1">{user.name}</Text>
            </View>
            <Pill text="Required" tone="warning" />
          </View>

          <View className="mt-4">
            <Card className="p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-white font-bold">Assignment</Text>
                <Pill text={`Branch #${branchId}`} />
              </View>
              <View className="mt-2">
                <InfoRow label="Position" value={staffAssignment?.position || 'Staff'} />
                <InfoRow label="Daily rate" value={`₱${staffAssignment?.daily_rate || '0'}`} />
              </View>
            </Card>
          </View>

          <View className="mt-4">
            <Card className="p-4">
              <Text className="text-white font-bold">How to register</Text>
              <Text className="text-gray-300 text-sm mt-2">
                Keep your face centered in the guide frame, then tap Register face.
              </Text>
              <View className="mt-3 gap-2">
                <Text className="text-gray-300 text-xs">- Use bright, even lighting</Text>
                <Text className="text-gray-300 text-xs">- Keep only one face in view</Text>
                <Text className="text-gray-300 text-xs">- Remove mask/sunglasses</Text>
              </View>
              {!faceModuleAvailable ? (
                <Text className="text-gray-400 text-xs mt-3 leading-4">
                  First-time setup may take longer while browser face models load. Keep this screen open.
                </Text>
              ) : null}
            </Card>
          </View>
        </View>

        <View className="mx-4 mt-1 rounded-3xl overflow-hidden border border-emerald-400/30 bg-zinc-900" style={{ minHeight: 390 }}>
          <View className="px-4 py-3 border-b border-white/10 bg-black/40 flex-row items-center justify-between">
            <Text className="text-white font-semibold">Camera preview</Text>
            <Pill text={torchOn ? 'Light on' : 'Light off'} tone={torchOn ? 'success' : 'neutral'} />
          </View>

          <View style={{ minHeight: 340 }}>
            <CameraView
              ref={cameraRef}
              style={{ flex: 1, minHeight: 340 }}
              facing="front"
              enableTorch={torchOn}
            />
            <View className="absolute left-8 right-8 top-10 bottom-10 border-2 border-emerald-400/70 rounded-3xl" pointerEvents="none" />
            <View className="absolute bottom-4 left-4 right-4 flex-row items-center justify-between">
              <TouchableOpacity
                onPress={() => {
                  const next = !torchOn;
                  console.log('[FACE] enrollment torch', next);
                  setTorchOn(next);
                }}
                className="bg-black/75 border border-white/20 px-3 py-2 rounded-xl"
              >
                <Text className="text-white text-xs font-semibold">{torchOn ? 'Turn light off' : 'Turn light on'}</Text>
              </TouchableOpacity>
              <View className="bg-black/75 border border-white/20 px-3 py-2 rounded-xl">
                <Text className="text-white text-xs font-semibold">Ready</Text>
              </View>
            </View>
          </View>
        </View>

        <View className="px-4 mt-5">
          <PrimaryButton
            label="Register face"
            onPress={handleRegisterFace}
            tone="violet"
            loading={enrollingFace}
          />
          <Text className="text-gray-400 text-xs text-center mt-3">
            Register once to enable secure time in and time out.
          </Text>
        </View>

        <View className="px-4 mt-4">
          <Card className="p-4">
            <Text className="text-white font-bold mb-2">Today</Text>
            {attendanceLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : attendance ? (
              <>
                <InfoRow label="Time in" value={attendance.time_in || '—'} />
                <InfoRow label="Time out" value={attendance.time_out || '—'} />
                {Boolean(attendance.is_late) ? (
                  <View className="mt-2">
                    <Pill text={`Late by ${attendance.late_minutes} min`} tone="warning" />
                  </View>
                ) : null}
              </>
            ) : (
              <Text className="text-gray-400 text-sm">No attendance record yet</Text>
            )}
          </Card>
        </View>
      </ScrollView>
    );
  } else if (hasCompletedToday) {
    console.log('[ATTENDANCE UI] Completed for today; showing return tomorrow state');
    attendanceBody = (
      <View className="flex-1 bg-black px-5 pt-16 pb-10">
        <View className="items-center">
          <Pill text="Done for today" tone="success" />
          <Text className="text-white text-2xl font-extrabold mt-4 text-center">
            Time in and time out complete
          </Text>
          <Text className="text-gray-300 text-sm text-center mt-2">
            You are all set for today. Please return tomorrow for your next attendance.
          </Text>
        </View>

        <View className="mt-6">
          <Card className="p-4">
            <Text className="text-white font-bold mb-3">Today&apos;s record</Text>
            <InfoRow label="Time in" value={attendance?.time_in || '—'} />
            <InfoRow label="Time out" value={attendance?.time_out || '—'} />
            {Boolean(attendance?.is_late) ? (
              <View className="mt-2">
                <Pill text={`Late by ${attendance?.late_minutes} min`} tone="warning" />
              </View>
            ) : null}
            <View className="mt-3 pt-3 border-t border-white/10">
              <InfoRow label="Branch" value={`#${branchId}`} />
              <InfoRow label="Position" value={staffAssignment?.position || 'Staff'} />
              <InfoRow label="Daily rate" value={`₱${staffAssignment?.daily_rate || '0'}`} />
            </View>
          </Card>
        </View>

        <View className="mt-5">
          <PrimaryButton
            label={attendanceLoading ? 'Refreshing...' : 'Refresh Status'}
            onPress={() => loadAttendanceRecord(user.id, branchId)}
            tone="blue"
            loading={attendanceLoading}
          />
        </View>
      </View>
    );
  } else {
    attendanceBody = (
      <View className="flex-1 bg-black">
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="front"
          enableTorch={torchOn}
        />

        {/* Top controls (simple + clean) */}
        <View className="absolute top-12 left-0 right-0 px-4 z-40">
          <View className="flex-row items-center gap-3">
            <View className="flex-1 flex-row bg-black/60 border border-white/15 rounded-2xl p-1">
              <TouchableOpacity
                onPress={() => setMode('time_in')}
                disabled={!canTimeIn && mode !== 'time_in'}
                className={`flex-1 py-3 rounded-xl ${
                  mode === 'time_in'
                    ? 'bg-emerald-600'
                    : !canTimeIn
                      ? 'bg-transparent opacity-50'
                      : 'bg-white/10'
                }`}
              >
                <Text className="text-white text-center font-extrabold">Time In</Text>
              </TouchableOpacity>

              <View className="w-2" />

              <TouchableOpacity
                onPress={() => setMode('time_out')}
                disabled={!canTimeOut && mode !== 'time_out'}
                className={`flex-1 py-3 rounded-xl ${
                  mode === 'time_out'
                    ? 'bg-rose-600'
                    : !canTimeOut
                      ? 'bg-transparent opacity-50'
                      : 'bg-white/10'
                }`}
              >
                <Text className="text-white text-center font-extrabold">Time Out</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (!user?.id || !branchId) return;
                console.log('[ATTENDANCE UI] top refresh');
                loadAttendanceRecord(user.id, branchId);
              }}
              disabled={attendanceLoading}
              className={`border border-white/15 px-3 py-3 rounded-2xl ${
                attendanceLoading ? 'bg-black/40' : 'bg-black/60'
              }`}
            >
              <Text className="text-white text-xs font-semibold">
                {attendanceLoading ? '...' : 'Refresh'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                const next = !torchOn;
                console.log('[FACE] torch', next);
                setTorchOn(next);
              }}
              className="bg-black/60 border border-white/15 px-4 py-3 rounded-2xl"
            >
              <Text className="text-white text-xs font-semibold">{torchOn ? 'Light on' : 'Light'}</Text>
            </TouchableOpacity>
          </View>

          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-white/70 text-[11px]">
              {staffUser ? 'Auto scan' : 'Manual scan'} • {mode === 'time_in' ? 'Time In' : 'Time Out'}
            </Text>
            <Pill
              text={
                staffUser
                  ? scanPhase === 'mismatch'
                    ? 'Mismatch'
                    : scanPhase === 'checking'
                      ? 'Checking…'
                      : 'Ready'
                  : loading
                    ? 'Working…'
                    : 'Ready'
              }
              tone={staffUser && scanPhase === 'mismatch' ? 'danger' : 'success'}
            />
          </View>
        </View>

        {staffUser ? (
          <>
            <FaceScanOverlay
              phase={scanPhase}
              confidence={scanConfidence}
              threshold={scanThreshold}
              topInset={188}
              bottomInset={232}
            />
          </>
        ) : (
          <View className="absolute bottom-10 left-0 right-0 items-center px-6">
            <TouchableOpacity
              onPress={mode === 'time_in' ? handleTimeIn : handleTimeOut}
              disabled={loading || (mode === 'time_in' ? !canTimeIn : !canTimeOut)}
              className={`w-20 h-20 rounded-full justify-center items-center shadow-lg ${
                loading || (mode === 'time_in' ? !canTimeIn : !canTimeOut)
                  ? 'bg-gray-500/80'
                  : 'bg-white'
              }`}
            >
              {loading ? (
                <ActivityIndicator size="large" color="#3B82F6" />
              ) : (
                <View className="w-16 h-16 border-4 border-gray-400 rounded-full" />
              )}
            </TouchableOpacity>

            <Text className="text-white text-xs mt-3 opacity-80 text-center">
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
        )}

        {/* Bottom summary (tap to expand) */}
        <View className="absolute left-4 right-4 z-40" style={{ bottom: 92 }}>
          <TouchableOpacity
            onPress={() => setShowBottomDetails((v) => !v)}
            activeOpacity={0.9}
          >
            <Card className="px-4 py-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-white text-sm font-bold">Today</Text>
                <Text className="text-white/60 text-[11px]">
                  {showBottomDetails ? 'Hide details' : 'Tap for details'}
                </Text>
              </View>
              <View className="mt-2">
                {attendanceLoading ? (
                  <View className="py-1 items-center">
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : (
                  <>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-gray-300 text-xs">Time in</Text>
                      <Text className="text-gray-100 text-xs font-semibold">{attendance?.time_in || '—'}</Text>
                    </View>
                    <View className="flex-row items-center justify-between mt-1.5">
                      <Text className="text-gray-300 text-xs">Time out</Text>
                      <Text className="text-gray-100 text-xs font-semibold">{attendance?.time_out || '—'}</Text>
                    </View>
                    {Boolean(attendance?.is_late) ? (
                      <View className="mt-2">
                        <Pill text={`Late by ${attendance?.late_minutes} min`} tone="warning" />
                      </View>
                    ) : null}

                    {showBottomDetails ? (
                      <View className="mt-3 pt-3 border-t border-white/10">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-gray-300 text-xs">Branch</Text>
                          <Text className="text-gray-100 text-xs font-semibold">#{branchId}</Text>
                        </View>
                        <View className="flex-row items-center justify-between mt-1.5">
                          <Text className="text-gray-300 text-xs">Position</Text>
                          <Text className="text-gray-100 text-xs font-semibold">
                            {staffAssignment?.position || 'Staff'}
                          </Text>
                        </View>
                        <View className="flex-row items-center justify-between mt-1.5">
                          <Text className="text-gray-300 text-xs">Daily rate</Text>
                          <Text className="text-gray-100 text-xs font-semibold">
                            ₱{staffAssignment?.daily_rate || '0'}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </Card>
          </TouchableOpacity>
        </View>
    </View>
    );
  }

  return (
    <>
      {showFaceWebLayer ? <FaceDetectionWebView ref={faceWebRef} /> : null}
      {attendanceBody}
    </>
  );
}
