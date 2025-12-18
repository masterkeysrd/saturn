import { localStore } from "../localstorage";
import axios, { type AxiosInstance } from "axios";

const AUTH_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const EXPIRE_TIME_KEY = "expire_time";
const UNAUTHORIZED_STATUS = 401;

export type TokenPairJson = {
  token?: string;
  refreshToken?: string;
  expireTime?: string;
};

let instance = axios.create({
  headers: { "Content-Type": "application/json" },
});
setupInterceptors();

export const getAxios = () => {
  return instance;
};

export const setAxios = (newInstance: AxiosInstance) => {
  instance = newInstance;
  setupInterceptors();
};

function setupInterceptors() {
  instance.interceptors.request.use((config) => {
    const token = localStore.load(AUTH_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  let isRefreshing = false;
  let failedQueue: Array<{
    resolve: (value?: unknown) => void;
    reject: (error: any) => void;
  }> = [];

  const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach((prom) => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });
    failedQueue = [];
  };

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      if (
        error.response?.status === UNAUTHORIZED_STATUS &&
        !originalRequest._retry
      ) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return instance(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = localStore.load(REFRESH_TOKEN_KEY);
          if (!refreshToken) {
            throw new Error("No refresh token available");
          }

          const response = await instance.post<TokenPairJson>(
            "/api/v1/identity/sessions:refresh",
            {
              refreshToken,
            },
          );
          const tokenPair = response.data;
          saveAuthTokens(tokenPair);
          const token = tokenPair.token || "";

          instance.defaults.headers.Authorization = `Bearer ${token}`;
          processQueue(null, token || "");
          return instance(originalRequest);
        } catch (err) {
          console.error("Token refresh failed:", err);
          processQueue(err, null);
          clearAuthTokens();
          return Promise.reject(err);
        } finally {
          isRefreshing = false;
        }
      }
      return Promise.reject(error);
    },
  );
}

export function saveAuthTokens(tokenPair: TokenPairJson): void {
  localStore.save(AUTH_TOKEN_KEY, tokenPair.token || "");
  localStore.save(REFRESH_TOKEN_KEY, tokenPair.refreshToken || "");
  localStore.save(EXPIRE_TIME_KEY, tokenPair.expireTime || "");
}

export function clearAuthTokens(): void {
  localStore.remove(AUTH_TOKEN_KEY);
  localStore.remove(REFRESH_TOKEN_KEY);
  localStore.remove(EXPIRE_TIME_KEY);
}
