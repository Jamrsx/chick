import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
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

  useEffect(() => {
    loadProfile();
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
    </SafeAreaView>
  );
};

export default ProfileScreen;
