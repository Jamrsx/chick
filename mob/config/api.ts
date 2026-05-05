import { Platform } from "react-native";
import Constants from "expo-constants";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * 🔥 LOCAL IP (CHANGE THIS ONLY)
 * Make sure this is your PC IPv4 address
 */
const API_PORT = 8000;
const DEFAULT_LAN_IP = "192.168.1.22";

const normalizeBase = (url: string) => url.replace(/\/+$/, "");

const getExpoHostIp = () => {
  const constants = Constants as any;
  const hostUri =
    Constants.expoConfig?.hostUri ||
    constants.manifest2?.extra?.expoClient?.hostUri ||
    constants.manifest?.debuggerHost;

  return typeof hostUri === "string" ? hostUri.split(":")[0] : null;
};

const buildApiUrl = (host: string) => `http://${host}:${API_PORT}/api`;

const expoHostIp = getExpoHostIp();
const defaultHost =
  expoHostIp || (Platform.OS === "android" ? "10.0.2.2" : DEFAULT_LAN_IP);

const LOCAL_IP = buildApiUrl(defaultHost);

export const API_BASE_URL = LOCAL_IP;

export const API_FALLBACK_URLS = Array.from(
  new Set(
    [
      API_BASE_URL,
      expoHostIp ? buildApiUrl(expoHostIp) : null,
      buildApiUrl(DEFAULT_LAN_IP),
      Platform.OS === "android" ? buildApiUrl("10.0.2.2") : null,
      buildApiUrl("127.0.0.1"),
    ]
      .filter(Boolean)
      .map((url) => normalizeBase(url as string))
  )
);

/**
 * TOKEN ATTACHER
 */
const attachToken = (config: any, token: string) => {
  if (!config.headers) config.headers = {};
  config.headers.Authorization = `Bearer ${token}`;
  return config;
};

/**
 * AXIOS INSTANCE
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

/**
 * REQUEST INTERCEPTOR
 */
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("token");

    if (token) {
      attachToken(config, token);
    }

    if (config.url && config.url.startsWith('/')) {
      config.url = config.url.replace(/^\/+/, '');
    }

    console.log("[API REQUEST]", `${config.baseURL}/${config.url}`);

    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * RESPONSE INTERCEPTOR
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!error.response) {
      console.log("[NETWORK ERROR]", {
        message: error.message,
        url: error.config?.url,
      });
    }

    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove([
        "token",
        "user",
        "role",
        "isLoggedIn",
      ]);
    }

    return Promise.reject(error);
  }
);

/**
 * LOGIN REQUEST (IMPORTANT FIX)
 */
export const loginRequest = async (username: string, password: string) => {
  const url = `${API_BASE_URL}/login`;

  console.log("[LOGIN URL]", url);

  return axios.post(url, { username, password }, {
    timeout: 30000,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
};
