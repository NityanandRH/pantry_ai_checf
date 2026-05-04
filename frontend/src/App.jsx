import { useState, useEffect, useCallback } from "react"
import { useAuth } from "./useAuth"
import api from "./api"
import Home from "./Home"
import Login from "./Login"
import Inventory from "./Inventory"
import RecipeBuilder from "./RecipeBuilder"
import AdminDashboard from "./AdminDashboard"
import ProfileSidebar from "./ProfileSidebar"

const API_BASE = import.meta.env.VITE_API_URL || ""

export default function App() {
  const { user, loading, isAdmin, logout, refreshUser } = useAuth()
  const [activeTab, setActiveTab]       = useState("home")
  const [ingredients, setIngredients]   = useState([])
  const [fetchError, setFetchError]     = useState(false)
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [loadRecipeId, setLoadRecipeId] = useState(null)

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

  // ── Loading spinner ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--page-bg)" }}>
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">🥘</div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
            Loading PantryChef…
          </p>
        </div>
      </div>
    )
  }

  // ── Pre-auth landing page (full-screen, no layout) ───────────────────────
  if (!user) {
    return (
      <Home
        user={null}
        ingredients={[]}
        onNavigate={() => {}}
        onSignIn={() => { window.location.href = "/login" }}
        recipesUsed={0}
        recipeLimit={3}
        expiringCount={0}
      />
    )
  }

  // ── Post-auth values ─────────────────────────────────────────────────────
  const recipeLimit  = user.recipe_limit  ?? 3
  const recipesUsed  = user.recipe_count  ?? 0
  const limitReached = user.limit_reached ?? false

  const expiringCount = ingredients.filter(i => {
    if (!i.expiry_date) return false
    return Math.ceil((new Date(i.expiry_date) - new Date()) / 86400000) <= 3
  }).length

  const TABS = [
    { id: "home",   label: "🏠 Home"      },
    { id: "cook",   label: "👨‍🍳 Cook"     },
    { id: "pantry", label: "🥦 My Pantry" },
    ...(isAdmin ? [{ id: "admin", label: "⚙ Admin" }] : []),
  ]

  // ── Home tab: render FULL SCREEN, completely bypass header/layout ─────────
  if (activeTab === "home") {
    return (
      <>
        <Home
          user={user}
          ingredients={ingredients}
          onNavigate={setActiveTab}
          onSignIn={() => {}}
          recipesUsed={recipesUsed}
          recipeLimit={recipeLimit}
          expiringCount={expiringCount}
        />
        {/* Profile sidebar still accessible from Home user pill */}
        <ProfileSidebar
          user={{ ...user, recipe_limit: user?.recipe_limit ?? 3 }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onLoadRecipe={(id) => { setLoadRecipeId(id); setActiveTab("cook") }}
          onGoToCook={() => setActiveTab("cook")}
          logout={logout}
        />
      </>
    )
  }

  // ── All other tabs: normal header + layout ────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "var(--page-bg)" }}>

      {/* ── Hero header ── */}
      <div className="bg-hero w-full">
        <div className="w-full px-6 sm:px-10 lg:px-16 py-8 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-4xl drop-shadow-lg">🍝</span>
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
              {(user.tier === "free" || user.tier === "pro") && (
                <div className="text-center rounded-xl px-4 py-2"
                  style={{
                    background: limitReached ? "rgba(220,50,50,0.3)" : "rgba(255,255,255,0.1)",
                    border: limitReached ? "1px solid rgba(220,50,50,0.5)" : "none"
                  }}>
                  <div className="text-sm font-black text-white leading-none">{recipesUsed}/{recipeLimit}</div>
                  <div className="text-xs text-orange-200 mt-0.5">{limitReached ? "limit reached" : "today's recipes"}</div>
                </div>
              )}
              <button onClick={() => setActiveTab("pantry")}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                🥕 {ingredients.length} ingredients
              </button>
              {expiringCount > 0 && (
                <button onClick={() => setActiveTab("pantry")}
                  className="bg-amber-500/90 hover:bg-amber-400 text-amber-950 text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                  ⏰ {expiringCount} expiring
                </button>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => setSidebarOpen(true)} className="flex items-center gap-2 group">
                  {user.picture ? (
                    <img src={user.picture} alt={user.name || "User"}
                      className="w-9 h-9 rounded-full border-2 border-white/30 object-cover group-hover:border-orange-400 transition-colors"/>
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white group-hover:opacity-80 transition-opacity"
                      style={{ background: "var(--orange)" }}>
                      {(user.name || user.email || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-semibold text-white leading-none">{user.name || user.email}</div>
                    <div className="text-xs text-orange-300 mt-0.5 capitalize">{user.tier}{user.is_admin ? " · admin" : ""}</div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* ── Tab nav ── */}
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
                🎉 You've used all {recipeLimit} daily recipes!
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Limit resets in 24 hours. Upgrade to Pro for 20 recipes/day.
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
            loadRecipeId={loadRecipeId}
            onLoadRecipeDone={() => setLoadRecipeId(null)}
          />
        )}
        {activeTab === "admin" && isAdmin && (
          <AdminDashboard />
        )}
      </main>

      <footer className="w-full px-6 sm:px-10 lg:px-16 py-4 mt-8"
        style={{ borderTop: "1px solid var(--card-border)" }}>
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          PantryChef v2.3 · AI agent-powered · GPT-4o
        </p>
      </footer>

      {/* ── Profile sidebar ── */}
      <ProfileSidebar
        user={{ ...user, recipe_limit: user?.recipe_limit ?? 3 }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLoadRecipe={(id) => { setLoadRecipeId(id); setActiveTab("cook") }}
        onGoToCook={() => setActiveTab("cook")}
        logout={logout}
      />
    </div>
  )
}