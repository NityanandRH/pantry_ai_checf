/**
 * api.js — Pre-configured axios instance for PantryChef.
 *
 * Automatically attaches the JWT Authorization header to every request.
 * Handles 401 responses by redirecting to login.
 *
 * Usage:  import api from './api'
 *         api.get('/inventory')
 *         api.post('/recipe/generate', { filters })
 *
 * Never use raw axios in components — always use this instance.
 */

import axios from "axios"

// In production (Amplify), VITE_API_URL points to App Runner backend URL.
// In local dev, it falls back to "" so Vite proxy forwards to localhost:8000.
const BASE_URL = import.meta.env.VITE_API_URL || ""

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,    // 60s — agent recipe generation can be slow
  // Do NOT set Content-Type here — let axios set it automatically.
  // For JSON requests axios sets application/json.
  // For FormData (image uploads) axios sets multipart/form-data with boundary.
  // Hardcoding application/json breaks file uploads.
})

// ── Request interceptor: attach JWT ──────────────────────────────────────────

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("pantry_chef_token")
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: handle auth errors ──────────────────────────────────

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only clear and redirect if we're NOT already on the login page
      // This prevents redirect loops
      if (!window.location.pathname.includes("/login")) {
        localStorage.removeItem("pantry_chef_token")
        localStorage.removeItem("pantry_chef_user")
        window.location.href = "/login"
      }
    }
    return Promise.reject(error)
  }
)

export default api