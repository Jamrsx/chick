// LoginScreen.js - With NativeWind, Username & Password Only
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function LoginScreen({ navigation }: { navigation: any }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validateUsername = (username: string) => {
    if (!username) return 'Username is required';
    if (username.length < 3) return 'Username must be at least 3 characters';
    return '';
  };

  const validatePassword = (password: string) => {
    if (!password) return 'Password is required';
    if (password.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  // LoginScreen.js - Add this to see what's happening
const { login } = useAuth();

const handleLogin = async () => {
  // prevent double click bug
  if (isLoading) return;

  const usernameValidationError = validateUsername(username);
  const passwordValidationError = validatePassword(password);

  setUsernameError(usernameValidationError);
  setPasswordError(passwordValidationError);

  if (usernameValidationError || passwordValidationError) return;

  setIsLoading(true);

  try {
    const result = await login(username.trim(), password);

    console.log('[LOGIN RESULT]', result);

    if (result?.success) {
      Alert.alert('Login Successful', 'Welcome to the System!', [
        {
          text: 'Continue',
          onPress: () => router.replace('/Staff/Dashboard'),
        },
      ]);
    } else {
      Alert.alert(
        'Login Failed',
        result?.error || 'Incorrect username or password',
        [{ text: 'OK' }]
      );
    }
  } catch (error: any) {
    console.error('[LOGIN SCREEN ERROR]', error);

    Alert.alert(
      'Login Failed',
      error?.response?.data?.message ||
        error?.message ||
        'Unable to connect to server',
      [{ text: 'OK' }]
    );
  } finally {
    setIsLoading(false);
  }
};

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-blue-600"
    >
      <StatusBar style="light" />
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 justify-center items-center px-6 py-12">
          
          {/* Logo/Brand Section */}
          <View className="items-center mb-10">
            <View className="w-24 h-24 bg-white/20 rounded-3xl items-center justify-center mb-4 shadow-lg">
              <Text className="text-5xl">🔐</Text>
            </View>
            <Text className="text-4xl font-bold text-white text-center tracking-tight">
              New Moon Lechon Manok and Liempo House
            </Text>
            <Text className="text-white/80 text-center mt-2 text-base">
              Please enter your credentials
            </Text>
          </View>

          {/* Login Card */}
          <View className="w-full bg-white rounded-3xl p-8 shadow-2xl">
            
            <Text className="text-3xl font-bold text-gray-800 text-center mb-2">
              Welcome Back! 👋
            </Text>
            <Text className="text-gray-500 text-center mb-8">
              Sign in to access your account
            </Text>

            {/* Username Input */}
            <View className="mb-5">
              <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">
                Username
              </Text>
              <View className={`flex-row items-center border rounded-xl bg-gray-50 ${
                usernameError ? 'border-red-500' : 'border-gray-300'
              }`}>
                <Text className="text-xl pl-4 pr-2">👤</Text>
                <TextInput
                  className="flex-1 p-3 text-gray-800 text-base"
                  placeholder="Enter your username"
                  placeholderTextColor="#9CA3AF"
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text);
                    setUsernameError('');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {usernameError ? (
                <Text className="text-red-500 text-xs mt-1 ml-1">{usernameError}</Text>
              ) : null}
            </View>

            {/* Password Input */}
            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">
                Password
              </Text>
              <View className={`flex-row items-center border rounded-xl bg-gray-50 ${
                passwordError ? 'border-red-500' : 'border-gray-300'
              }`}>
                <Text className="text-xl pl-4 pr-2">🔒</Text>
                <TextInput
                  className="flex-1 p-3 text-gray-800 text-base"
                  placeholder="Enter your password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setPasswordError('');
                  }}
                />
                <TouchableOpacity 
                  onPress={() => setShowPassword(!showPassword)}
                  className="pr-4"
                >
                  <Text className="text-gray-500 text-lg">
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </Text>
                </TouchableOpacity>
              </View>
              {passwordError ? (
                <Text className="text-red-500 text-xs mt-1 ml-1">{passwordError}</Text>
              ) : null}
            </View>

            {/* Forgot Password */}
            <TouchableOpacity className="mb-8 self-end">
              <Text className="text-blue-600 text-sm font-semibold">
                Forgot Password?
              </Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity 
              className={`bg-blue-600 p-4 rounded-xl items-center shadow-lg ${isLoading ? 'opacity-70' : ''}`}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <View className="flex-row items-center">
                  <ActivityIndicator color="white" size="small" />
                  <Text className="text-white font-bold text-lg ml-2">
                    Logging in...
                  </Text>
                </View>
              ) : (
                <Text className="text-white font-bold text-lg">
                  Login
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View className="flex-row items-center my-8">
              <View className="flex-1 h-px bg-gray-300" />
              <View className="flex-1 h-px bg-gray-300" />
            </View>

            {/* Sign Up Link */}
            <View className="flex-row justify-center mt-2">
              <Text className="text-gray-500 text-sm">Don't have an account? </Text>
              <TouchableOpacity>
                <Text className="text-blue-600 text-sm font-semibold">
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <Text className="text-center text-xs text-gray-400 mt-6">
              Secure Login System
            </Text>

          </View>

          {/* Footer Note */}
          <Text className="text-white/60 text-center text-xs mt-8">
            © 2024 Login System. All rights reserved.
          </Text>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}