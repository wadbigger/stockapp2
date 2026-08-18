import axios from 'axios'
import { usePlatformStore } from '../store/platformStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const platformApi = axios.create({
  baseURL: `${API_URL}/api/platform`,
  headers: { 'Content-Type': 'application/json' },
})

platformApi.interceptors.request.use((config) => {
  const token = usePlatformStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default platformApi
