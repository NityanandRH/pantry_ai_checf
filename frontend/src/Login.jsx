/**
 * Login.jsx — Sign-in page.
 * Shows Google login button which redirects to Cognito Hosted UI.
 * When AUTH_DISABLED=true (local dev), shows a bypass button instead.
 */

import { useEffect } from "react"
import { buildLoginUrl } from "./useAuth"

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === "true"

export default function Login() {
  const loginUrl = buildLoginUrl()

  // If token arrives in URL hash (Cognito callback), reload App which will pick it up
  useEffect(() => {
    if (window.location.hash.includes("id_token") || window.location.hash.includes("access_token")) {
      window.location.href = "/"
    }
  }, [])

  const handleDevBypass = () => {
    // In dev mode, backend returns a fake user — just set a dummy token
    localStorage.setItem("pantry_chef_token", "dev-bypass-token")
    window.location.href = "/"
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{
        background: "var(--page-bg)",
        backgroundImage: `
          linear-gradient(135deg, rgba(180,60,10,0.88) 0%, rgba(12,8,4,0.82) 100%),
          url('https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=1920&q=80')
        `,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}>

      <div className="w-full max-w-md mx-4">
        {/* Card */}
        <div className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>

          {/* Header */}
          <div className="px-8 pt-10 pb-6 text-center">
            <div className="text-5xl mb-4">🥘</div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
              PantryChef
            </h1>
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              Cook delicious meals from what you already have
            </p>
          </div>

          {/* Divider */}
          <div style={{ height: "1px", background: "var(--card-border)", margin: "0 2rem" }} />

          {/* Sign-in section */}
          <div className="px-8 py-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-center mb-6"
              style={{ color: "var(--text-faint)" }}>
              Sign in to continue
            </p>

            {AUTH_DISABLED ? (
              /* Dev bypass button */
              <div>
                <button onClick={handleDevBypass}
                  className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-bold text-sm transition-all"
                  style={{
                    background: "var(--orange)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                  }}>
                  🔧 Continue as Dev Admin (AUTH_DISABLED=true)
                </button>
                <p className="text-xs text-center mt-3"
                  style={{ color: "var(--text-faint)" }}>
                  Auth is disabled — set AUTH_DISABLED=false and configure Cognito for production
                </p>
              </div>
            ) : loginUrl ? (
              /* Real Google login */
              <a href={loginUrl}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-bold text-sm transition-all"
                style={{
                  background: "#fff",
                  color: "#1f1f1f",
                  border: "1px solid #e0e0e0",
                  textDecoration: "none",
                  cursor: "pointer",
                  display: "flex",
                }}>
                {/* Google G logo */}
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </a>
            ) : (
              /* Cognito not configured */
              <div className="text-center rounded-xl p-4"
                style={{ background: "var(--hover-bg)", border: "1px solid var(--card-border)" }}>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Cognito not configured. Set <code style={{ color: "var(--orange)" }}>VITE_COGNITO_DOMAIN</code> and <code style={{ color: "var(--orange)" }}>VITE_COGNITO_CLIENT_ID</code> in your frontend <code>.env</code> file.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 pb-8 text-center">
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              By signing in you agree to our terms of service.
              Your pantry data is private and never shared.
            </p>
          </div>
        </div>

        {/* Features below card */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          {[
            { icon: "🤖", text: "AI agent checks real ingredients" },
            { icon: "🔒", text: "Your data is private" },
            { icon: "🍽", text: "3 free recipes to start" },
          ].map((f) => (
            <div key={f.text} className="text-center rounded-xl p-3"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-2xl mb-1">{f.icon}</div>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
