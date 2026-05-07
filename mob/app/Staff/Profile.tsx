import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { api } from '../../config/api';

const ProfileScreen = () => {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [address, setAddress] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [faceStatusLoading, setFaceStatusLoading] = useState(true);
  const [showFacePasswordModal, setShowFacePasswordModal] = useState(false);
  const [facePassword, setFacePassword] = useState('');
  const [faceResetLoading, setFaceResetLoading] = useState(false);

  useEffect(() => {
    loadProfile();
    loadFaceStatus();
  }, []);

  const loadProfile = async () => {
    try {
      const { data } = await api.get('me');
      await AsyncStorage.setItem('user', JSON.stringify(data));
      setFirstName(data.firstname || '');
      setLastName(data.lastname || '');
      setMiddleName(data.middlename || '');
      setAddress(data.address || '');
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const saveProfile = async () => {
    try {
      const { data } = await api.put('me', {
        firstname: firstName.trim(),
        lastname: lastName.trim(),
        middlename: middleName.trim() || null,
        address: address.trim() || null,
      });
      await AsyncStorage.setItem('user', JSON.stringify(data));
      setFirstName(data.firstname || '');
      setLastName(data.lastname || '');
      setMiddleName(data.middlename || '');
      setAddress(data.address || '');
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      const validationErrors = error?.response?.data?.errors;
      const firstField = validationErrors ? Object.keys(validationErrors)[0] : null;
      const firstMessage = firstField ? validationErrors[firstField]?.[0] : null;
      Alert.alert('Error', firstMessage || error?.response?.data?.message || 'Failed to save profile');
    }
  };

  const loadFaceStatus = async () => {
    try {
      setFaceStatusLoading(true);
      const { data } = await api.get('/face/status');
      console.log('[FACE PROFILE] status', data);
      setFaceEnrolled(data?.enrolled === true);
    } catch (error) {
      console.error('[FACE PROFILE] status failed:', error);
      setFaceEnrolled(false);
    } finally {
      setFaceStatusLoading(false);
    }
  };

  const handleOpenFaceAction = () => {
    if (!faceEnrolled) {
      Alert.alert(
        'Register Facial Data',
        'You have no saved face data yet. Continue to Attendance screen to register your face now?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Attendance',
            onPress: () => {
              console.log('[FACE PROFILE] navigate to attendance for first enrollment');
              router.push('/Staff/Attendance' as any);
            },
          },
        ]
      );
      return;
    }

    setFacePassword('');
    setShowFacePasswordModal(true);
  };

  const handleResetFaceData = async () => {
    if (!facePassword.trim()) {
      Alert.alert('Validation', 'Please enter your password.');
      return;
    }

    try {
      setFaceResetLoading(true);
      console.log('[FACE PROFILE] reset request start');
      const { data } = await api.post('/face/reset', { password: facePassword });
      console.log('[FACE PROFILE] reset success', data);
      setShowFacePasswordModal(false);
      setFacePassword('');
      setFaceEnrolled(false);
      Alert.alert(
        'Facial Data Reset',
        'Your old facial data was removed. Please register your new face now in Attendance.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Go to Attendance',
            onPress: () => router.push('/Staff/Attendance' as any),
          },
        ]
      );
    } catch (error: any) {
      console.error('[FACE PROFILE] reset failed', error?.response?.data || error?.message);
      const message =
        error?.response?.data?.code === 'FACE_PASSWORD_INVALID'
          ? 'Incorrect password. Please try again.'
          : error?.response?.data?.message || 'Failed to reset facial data.';
      Alert.alert('Error', message);
    } finally {
      setFaceResetLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('logout');
              await AsyncStorage.multiRemove(['token', 'user', 'role', 'isLoggedIn', 'currentStaffUsername']);
              router.replace('/Login');
            } catch (error) {
              console.error('Error during logout:', error);
              Alert.alert('Error', 'Failed to logout');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ alignItems: 'center', marginBottom: 30 }}>
          <View style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: '#DC2626',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 10,
          }}>
            <Icon name="person" size={50} color="#FFFFFF" />
          </View>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1F2937' }}>
            {firstName && lastName ? `${firstName} ${lastName}` : 'Staff Member'}
          </Text>
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 10, color: '#1F2937' }}>
            Personal Information
          </Text>

          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 5 }}>First Name</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#D1D5DB',
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                backgroundColor: isEditing ? '#FFFFFF' : '#F3F4F6',
              }}
              value={firstName}
              onChangeText={setFirstName}
              editable={isEditing}
              placeholder="Enter your first name"
            />
          </View>

          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 5 }}>Middle Name</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#D1D5DB',
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                backgroundColor: isEditing ? '#FFFFFF' : '#F3F4F6',
              }}
              value={middleName}
              onChangeText={setMiddleName}
              editable={isEditing}
              placeholder="Enter your middle name"
            />
          </View>

          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 5 }}>Last Name</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#D1D5DB',
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                backgroundColor: isEditing ? '#FFFFFF' : '#F3F4F6',
              }}
              value={lastName}
              onChangeText={setLastName}
              editable={isEditing}
              placeholder="Enter your last name"
            />
          </View>

          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 5 }}>Address</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#D1D5DB',
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                backgroundColor: isEditing ? '#FFFFFF' : '#F3F4F6',
                minHeight: 80,
                textAlignVertical: 'top',
              }}
              value={address}
              onChangeText={setAddress}
              editable={isEditing}
              placeholder="Enter your address"
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 10, color: '#1F2937' }}>
            Facial Data
          </Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: '#E5E7EB',
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              padding: 14,
            }}
          >
            {faceStatusLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={{ marginLeft: 10, color: '#374151', fontSize: 14 }}>
                  Checking face status...
                </Text>
              </View>
            ) : (
              <>
                <Text style={{ color: '#6B7280', fontSize: 13 }}>Status</Text>
                <Text
                  style={{
                    color: faceEnrolled ? '#059669' : '#B45309',
                    fontWeight: '700',
                    marginTop: 4,
                  }}
                >
                  {faceEnrolled ? 'Registered' : 'Not registered'}
                </Text>
                <Text style={{ color: '#4B5563', fontSize: 13, marginTop: 8, lineHeight: 19 }}>
                  {faceEnrolled
                    ? 'To update your facial data, confirm your current password first.'
                    : 'Register your facial data to use face attendance.'}
                </Text>
              </>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: '#2563EB',
            padding: 15,
            borderRadius: 8,
            alignItems: 'center',
            marginBottom: 15,
            opacity: faceStatusLoading ? 0.7 : 1,
          }}
          disabled={faceStatusLoading}
          onPress={handleOpenFaceAction}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
            {faceEnrolled ? 'Update Facial Data' : 'Register Facial Data'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            backgroundColor: isEditing ? '#10B981' : '#DC2626',
            padding: 15,
            borderRadius: 8,
            alignItems: 'center',
            marginBottom: 15,
          }}
          onPress={isEditing ? saveProfile : () => setIsEditing(true)}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
            {isEditing ? 'Save Profile' : 'Edit Profile'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            backgroundColor: '#EF4444',
            padding: 15,
            borderRadius: 8,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
          }}
          onPress={handleLogout}
        >
          <Icon name="logout" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
            Logout
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showFacePasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFacePasswordModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            paddingHorizontal: 20,
          }}
        >
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
              Confirm Password
            </Text>
            <Text style={{ marginTop: 6, color: '#4B5563', fontSize: 13, lineHeight: 19 }}>
              Enter your current password to reset and update your existing facial data.
            </Text>

            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#D1D5DB',
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                marginTop: 14,
                backgroundColor: '#FFFFFF',
              }}
              secureTextEntry
              placeholder="Current password"
              value={facePassword}
              onChangeText={setFacePassword}
              editable={!faceResetLoading}
            />

            <View style={{ flexDirection: 'row', marginTop: 14 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#E5E7EB',
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginRight: 8,
                }}
                disabled={faceResetLoading}
                onPress={() => {
                  setShowFacePasswordModal(false);
                  setFacePassword('');
                }}
              >
                <Text style={{ color: '#111827', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#DC2626',
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginLeft: 8,
                  opacity: faceResetLoading ? 0.7 : 1,
                }}
                disabled={faceResetLoading}
                onPress={handleResetFaceData}
              >
                {faceResetLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default ProfileScreen;
