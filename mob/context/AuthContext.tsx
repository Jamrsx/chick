import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

type AuthContextValue = {
  user: any;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const storedUser = await AsyncStorage.getItem('user');

      if (token && storedUser) {
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
      }
    } catch (e) {
      console.log('load user error', e);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const data = await api.login(username, password);

      setUser(data.user);
      setIsAuthenticated(true);

      return { success: true };
    } catch (error: any) {
      console.log('[LOGIN ERROR]', error);

      const status = error?.response?.status;

      let msg = 'Invalid username or password';

      if (!error?.response) {
        msg = 'Cannot connect to the server. Check that the backend is running and your phone is on the same network.';
      } else if (status === 401 || status === 403) {
        msg = 'Invalid username or password';
      } else if (error?.response?.data?.message) {
        msg = 'Login failed. Please try again.';
      }

      return {
        success: false,
        error: msg,
      };
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (e) {
      console.log('logout error', e);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
