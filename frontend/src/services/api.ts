import axios, { AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'localhost:3000';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

let refreshPromise: Promise<string> | null = null;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const siteData = localStorage.getItem('site-storage');
  if (siteData) {
    try {
      const parsed = JSON.parse(siteData);
      const siteId = parsed?.state?.currentSiteId;
      if (siteId) config.headers['x-site-id'] = siteId;
    } catch {}
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = axios
          .post(`${API_URL}/api/auth/refresh`, {
            refreshToken: localStorage.getItem('refreshToken'),
          })
          .then((r) => {
            const { accessToken, refreshToken } = r.data;
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            return accessToken;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }
      try {
        const newToken = await refreshPromise;
        original.headers!.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('auth-storage');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
