import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
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
  const isUserActive = (value: any) => value === true || value === 1 || value === '1';

  const clearLocalSession = async () => {
    await AsyncStorage.multiRemove([
      'token',
      'user',
      'role',
      'isLoggedIn',
      'currentStaffUsername',
    ]);
    setUser(null);
    setIsAuthenticated(false);
  };

  const enforceActiveUser = async (source: 'bootstrap' | 'poll' | 'foreground') => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const currentUser = await api.getCurrentUser();
      const active = isUserActive(currentUser?.is_active);
      console.log('[AUTH] active check', { source, is_active: currentUser?.is_active, active });

      if (!active) {
        console.log('[AUTH] account disabled; forcing logout', { source, user_id: currentUser?.id });
        await clearLocalSession();
        return;
      }

      setUser(currentUser);
      await AsyncStorage.setItem('user', JSON.stringify(currentUser));
    } catch (e: any) {
      console.log('[AUTH] active check error', source, e?.response?.status, e?.message);
      // If backend says unauthorized/forbidden, clear local session.
      if (e?.response?.status === 401 || e?.response?.status === 403) {
        await clearLocalSession();
      }
    }
  };

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
        await enforceActiveUser('bootstrap');
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
      await enforceActiveUser('bootstrap');

      return { success: true };
    } catch (error: any) {
      console.log('[LOGIN ERROR]', error);

      const status = error?.response?.status;

      let msg = 'Invalid username or password';

      if (!error?.response) {
        msg = 'Cannot connect to the server. Check that the backend is running and your phone is on the same network.';
      } else if (status === 401 || status === 403) {
        msg = error?.response?.data?.message || 'Invalid username or password';
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
      await clearLocalSession();
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      enforceActiveUser('poll');
    }, 15000);

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        enforceActiveUser('foreground');
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [isAuthenticated]);

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
