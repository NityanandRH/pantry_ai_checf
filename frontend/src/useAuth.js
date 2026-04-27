/**
 * useAuth.js — React hook for authentication state.
 *
 * Reads JWT from localStorage (stored after Cognito callback).
 * Decodes user info (email, name, picture, is_admin) from the JWT payload.
 * Provides login redirect, logout, and loading state.
 *
 * Usage:
 *   const { user, loading, isAdmin, logout } = useAuth()
 */

import { useState, useEffect } from "react"
import api from "./api"

// Cognito Hosted UI config — update these with your actual values
const COGNITO_DOMAIN    = import.meta.env.VITE_COGNITO_DOMAIN    || ""
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || ""
const REDIRECT_URI      = import.meta.env.VITE_REDIRECT_URI      || window.location.origin + "/callback"

/**
 * Decode the payload of a JWT without verifying it.
 * (Verification happens on the backend.)
 */
function decodeJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Build the Cognito Google login URL.
 * Opens Cognito Hosted UI which handles Google OAuth.
 */
export function buildLoginUrl() {
  if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID) {
    // AUTH_DISABLED mode — no redirect needed
    console.warn("Cognito not configured. Set VITE_COGNITO_DOMAIN and VITE_COGNITO_CLIENT_ID in .env")
    return null
  }
  const params = new URLSearchParams({
    client_id:     COGNITO_CLIENT_ID,
    response_type: "token",
    scope:         "email openid profile",
    redirect_uri:  REDIRECT_URI,
    identity_provider: "Google",
  })
  return `${COGNITO_DOMAIN}/oauth2/authorize?${params}`
}

/**
 * Parse the URL fragment after Cognito callback.
 * Cognito returns tokens as URL hash: #access_token=...&id_token=...
 * We use the id_token (contains email, name, picture).
 */
export function parseCognitoCallback() {
  const hash = window.location.hash.substring(1)
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const idToken = params.get("id_token") || params.get("access_token")
  if (!idToken) return null
  // Clean the hash from URL
  window.history.replaceState({}, document.title, window.location.pathname)
  return idToken
}

/**
 * Main auth hook.
 */
export function useAuth() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      // Check for Cognito callback token in URL hash
      const callbackToken = parseCognitoCallback()
      if (callbackToken) {
        localStorage.setItem("pantry_chef_token", callbackToken)
      }

      const token = localStorage.getItem("pantry_chef_token")
      if (!token) {
        setLoading(false)
        return
      }

      // Dev bypass token — skip JWT decode, go straight to /me
      // Backend returns the dev admin user when AUTH_DISABLED=true
      const isDevBypass = token === "dev-bypass-token"

      if (!isDevBypass) {
        // Real JWT — decode and check expiry before hitting the network
        const claims = decodeJwt(token)
        if (!claims) {
          localStorage.removeItem("pantry_chef_token")
          setLoading(false)
          return
        }
        if (claims.exp && claims.exp * 1000 < Date.now()) {
          localStorage.removeItem("pantry_chef_token")
          setLoading(false)
          return
        }
      }

      // Fetch full user profile from backend (includes tier, recipe_count, is_admin)
      try {
        const res = await api.get("/me")
        setUser(res.data)
        localStorage.setItem("pantry_chef_user", JSON.stringify(res.data))
      } catch {
        // Token may be expired — clear and let user log in again
        localStorage.removeItem("pantry_chef_token")
        localStorage.removeItem("pantry_chef_user")
      }

      setLoading(false)
    }

    initAuth()
  }, [])

  const logout = () => {
    localStorage.removeItem("pantry_chef_token")
    localStorage.removeItem("pantry_chef_user")
    setUser(null)
    // Redirect to Cognito logout if configured
    if (COGNITO_DOMAIN && COGNITO_CLIENT_ID) {
      const params = new URLSearchParams({
        client_id:    COGNITO_CLIENT_ID,
        logout_uri:   window.location.origin + "/login",
      })
      window.location.href = `${COGNITO_DOMAIN}/logout?${params}`
    } else {
      window.location.href = "/login"
    }
  }

  const refreshUser = async () => {
    try {
      const res = await api.get("/me")
      setUser(res.data)
    } catch {
      // ignore
    }
  }

  return {
    user,
    loading,
    isLoggedIn: !!user,
    isAdmin:    user?.is_admin ?? false,
    logout,
    refreshUser,
  }
}