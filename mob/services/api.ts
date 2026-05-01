import axios, { AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, API_FALLBACK_URLS, } from '../config/api';

/**
 * ----------------------------------------
 * AXIOS BASE CONFIG
 * ----------------------------------------
 */
const API_CONFIG = {
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
};

const apiClient = axios.create(API_CONFIG);

/**
 * ----------------------------------------
 * ATTACH TOKEN
 * ----------------------------------------
 */
const attachAuthToken = (config: any, token: string) => {
  if (!config.headers) config.headers = {};

  if (typeof config.headers.set === 'function') {
    config.headers.set('Authorization', `Bearer ${token}`);
  } else {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
};

/**
 * ----------------------------------------
 * REQUEST INTERCEPTOR
 * ----------------------------------------
 */
apiClient.interceptors.request.use(
  async (config: any) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        attachAuthToken(config, token);
      }
    } catch (error) {
      console.error('[API] Token attach error:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * ----------------------------------------
 * RESPONSE INTERCEPTOR
 * ----------------------------------------
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401) {
      console.log('[API] 401 Unauthorized → clearing session');
      await AsyncStorage.multiRemove([
        'token',
        'user',
        'role',
        'isLoggedIn',
        'currentStaffUsername',
      ]);
    }

    return Promise.reject(error);
  }
);

/**
 * ----------------------------------------
 * LOGIN REQUEST (SMART FALLBACK)
 * ----------------------------------------
 */
const loginRequest = async (username: string, password: string) => {
  let lastNetworkError: any = null;

  for (const baseUrl of API_FALLBACK_URLS) {
    try {
      console.log('[LOGIN]:', `${baseUrl}/login`);

      const response = await axios.post(
        `${baseUrl}/login`,
        { username, password },
        {
          timeout: 10000,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

  

      return response;
    } catch (error: any) {
      if (error?.response) {
        throw error;
      }

      lastNetworkError = error;
      console.log('[LOGIN NETWORK ERROR]', {
        url: `${baseUrl}/login`,
        message: error?.message,
      });
    }
  }

  throw lastNetworkError || new Error('Unable to connect to the server');
};

/**
 * ----------------------------------------
 * API METHODS
 * ----------------------------------------
 */
export const api = {
  /**
   * LOGIN
   */
  login: async (username: string, password: string) => {
    const response = await loginRequest(username, password);

    const token = response.data?.token;
    if (!token) {
      throw new Error('No token returned from login');
    }

    const user = response.data.user;
    const role = response.data.role || user?.role || '';

    await AsyncStorage.multiSet([
      ['token', token],
      ['user', JSON.stringify(user)],
      ['role', role],
      ['isLoggedIn', 'true'],
      ['currentStaffUsername', user?.username || username],
    ]);

    return response.data;
  },

  logout: async () => {
    await apiClient.post('logout');
    await AsyncStorage.multiRemove([
      'token',
      'user',
      'role',
      'isLoggedIn',
      'currentStaffUsername',
    ]);
  },

  getCurrentUser: async () => {
    const res = await apiClient.get('me');
    return res.data;
  },

  /**
   * BRANCHES
   */
  getBranches: async () => (await apiClient.get('branches')).data,
  getBranchDetails: async (id: any) => (await apiClient.get(`branches/${id}`)).data,
  getBranchSales: async (id: any, date: string | null = null) =>
    (await apiClient.get(`branches/${id}/sales`, { params: date ? { date } : {} })).data,

  /**
   * PRODUCTS
   */
  getProducts: async (search = '') =>
    (await apiClient.get('products', { params: search ? { search } : {} })).data,

  createProduct: async (data: any) =>
    (await apiClient.post('products', data)).data,

  restockProduct: async (productId: any, branchId: any, quantity: number) =>
    (await apiClient.post(`products/${productId}/restock`, {
      branch_id: branchId,
      quantity,
    })).data,

  deleteProduct: async (id: any) =>
    (await apiClient.delete(`products/${id}`)).data,

  /**
   * STAFF
   */
  getStaff: async (branchId: any = null) =>
    (await apiClient.get('staff', {
      params: branchId ? { branch_id: branchId } : {},
    })).data,

  createStaff: async (data: any) =>
    (await apiClient.post('staff', data)).data,

  /**
   * ATTENDANCE
   */
  getAttendance: async (date: string | null = null, branchId: any = null) =>
    (await apiClient.get('attendance', {
      params: {
        ...(date && { date }),
        ...(branchId && { branch_id: branchId }),
      },
    })).data,

  timeIn: async (userId: any, branchId: any, timeIn: string) =>
    (await apiClient.post('attendance/time-in', {
      user_id: userId,
      branch_id: branchId,
      time_in: timeIn,
    })).data,

  timeOut: async (attendanceId: any, timeOut: string) =>
    (await apiClient.put(`attendance/${attendanceId}/time-out`, {
      time_out: timeOut,
    })).data,

  /**
   * PAYROLL
   */
  getPayroll: async (date: string, branchId: any = null) =>
    (await apiClient.get('attendance/payroll/report', {
      params: {
        date,
        ...(branchId && { branch_id: branchId }),
      },
    })).data,
};

export default apiClient;
