import { useState, useEffect, useCallback } from "react"
import { useAuth } from "./useAuth"
import api from "./api"
import Login from "./Login"
import Inventory from "./Inventory"
import RecipeBuilder from "./RecipeBuilder"
import AdminDashboard from "./AdminDashboard"

// In production: VITE_API_URL = https://d1hb9gg7lgcnhq.cloudfront.net
// In local dev:  VITE_API_URL = "" so Vite proxy forwards to localhost:8000
const API_BASE = import.meta.env.VITE_API_URL || ""

export default function App() {
  const { user, loading, isAdmin, logout, refreshUser } = useAuth()
  const [activeTab, setActiveTab]     = useState("cook")
  const [ingredients, setIngredients] = useState([])
  const [fetchError, setFetchError]   = useState(false)

  const fetchIngredients = useCallback(async () => {
    if (!user) return
    try {
      const res = await api.get("/inventory")
      setIngredients(res.data)
      setFetchError(false)
    } catch {
      setFetchError(true)
    }
  }, [user])

  useEffect(() => { fetchIngredients() }, [fetchIngredients])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--page-bg)" }}>
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">🍳</div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
            Loading PantryChef…
          </p>
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  const recipeLimit  = user.recipe_limit     ?? 3
  const recipesUsed  = user.recipe_count     ?? 0
  const limitReached = user.limit_reached    ?? false

  const expiringCount = ingredients.filter(i => {
    if (!i.expiry_date) return false
    return Math.ceil((new Date(i.expiry_date) - new Date()) / 86400000) <= 3
  }).length

  const TABS = [
    { id: "cook",   label: "🍽 Cook"      },
    { id: "pantry", label: "🥕 My Pantry" },
    ...(isAdmin ? [{ id: "admin", label: "⚙ Admin" }] : []),
  ]

  return (
    <div className="min-h-screen" style={{ background: "var(--page-bg)" }}>

      {/* ── Hero header ── */}
      <div className="bg-hero w-full">
        <div className="w-full px-6 sm:px-10 lg:px-16 py-8 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-4xl drop-shadow-lg">🍳</span>
              <div>
                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow">
                  PantryChef
                </h1>
                <p className="text-orange-200 text-xs sm:text-sm font-medium mt-0.5">
                  Cook delicious meals from ingredients you already have
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {user.tier === "free" && (
                <div className="text-center rounded-xl px-4 py-2"
                  style={{ background: limitReached ? "rgba(220,50,50,0.3)" : "rgba(255,255,255,0.1)", border: limitReached ? "1px solid rgba(220,50,50,0.5)" : "none" }}>
                  <div className="text-sm font-black text-white leading-none">{recipesUsed}/{recipeLimit}</div>
                  <div className="text-xs text-orange-200 mt-0.5">{limitReached ? "limit reached" : "free recipes"}</div>
                </div>
              )}
              <div className="text-center bg-white/10 rounded-xl px-4 py-2">
                <div className="text-2xl font-black text-white leading-none">{ingredients.length}</div>
                <div className="text-xs text-orange-200 mt-0.5">ingredients</div>
              </div>
              {expiringCount > 0 && (
                <button onClick={() => setActiveTab("pantry")}
                  className="bg-amber-500/90 hover:bg-amber-400 text-amber-950 text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                  ⏰ {expiringCount} expiring
                </button>
              )}
              <div className="flex items-center gap-2">
                {user.picture ? (
                  <img src={user.picture} alt={user.name || "User"}
                    className="w-9 h-9 rounded-full border-2 border-white/30 object-cover"/>
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white"
                    style={{ background: "var(--orange)" }}>
                    {(user.name || user.email || "?")[0].toUpperCase()}
                  </div>
                )}
                <div className="hidden sm:block">
                  <div className="text-xs font-semibold text-white leading-none">{user.name || user.email}</div>
                  <div className="text-xs text-orange-300 mt-0.5 capitalize">{user.tier}{user.is_admin ? " · admin" : ""}</div>
                </div>
                <button onClick={logout} className="text-xs text-white/60 hover:text-white ml-1 transition-colors">
                  Sign out
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-1">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 rounded-t-xl text-sm font-bold transition-all ${
                  activeTab === tab.id
                    ? "text-orange-600"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
                style={activeTab === tab.id ? { background: "var(--page-bg)" } : {}}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Error banners ── */}
      {fetchError && (
        <div className="w-full px-6 sm:px-10 lg:px-16 pt-4">
          <div className="rounded-xl px-4 py-3 text-sm flex items-center justify-between"
            style={{ background: "#2e0d0d", border: "1px solid #7c2020", color: "#fca5a5" }}>
            <span>Cannot reach backend.</span>
            <button onClick={fetchIngredients} className="text-xs underline ml-4" style={{ color: "#fca5a5" }}>Retry</button>
          </div>
        </div>
      )}

      {limitReached && activeTab === "cook" && (
        <div className="w-full px-6 sm:px-10 lg:px-16 pt-4">
          <div className="rounded-xl px-5 py-4 flex items-center justify-between"
            style={{ background: "#2e1508", border: "1px solid #7c3a12" }}>
            <div>
              <p className="text-sm font-bold" style={{ color: "#fb923c" }}>
                🎉 You've used all {recipeLimit} free recipes!
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Upgrade to Pro (₹99/mo) for unlimited recipe generation.
              </p>
            </div>
            <button className="btn-orange flex-shrink-0 ml-4" style={{ padding: "0.5rem 1.2rem" }}>
              Upgrade
            </button>
          </div>
        </div>
      )}

      {/* ── Page content ── */}
      <main className="w-full px-6 sm:px-10 lg:px-16 py-6">
        {activeTab === "pantry" && (
          <Inventory
            ingredients={ingredients}
            refreshInventory={fetchIngredients}
            API={API_BASE}
          />
        )}
        {activeTab === "cook" && (
          <RecipeBuilder
            ingredients={ingredients}
            API={API_BASE}
            onGoToPantry={() => setActiveTab("pantry")}
            user={user}
            onRecipeGenerated={refreshUser}
          />
        )}
        {activeTab === "admin" && isAdmin && (
          <AdminDashboard />
        )}
      </main>

      <footer className="w-full px-6 sm:px-10 lg:px-16 py-4 mt-8"
        style={{ borderTop: "1px solid var(--card-border)" }}>
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          PantryChef v2.2 · AI agent-powered · GPT-4o
        </p>
      </footer>
    </div>
  )
}