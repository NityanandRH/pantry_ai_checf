/**
 * ProfileSidebar.jsx — Slide-in sidebar for user profile.
 *
 * Three tabs:
 *   Profile  — name, email, tier, usage stats, sign out
 *   Recipes  — history of generated recipes, click to load back
 *   Feedback — star rating + category + message → POST /app-feedback
 */

import { useState, useEffect } from "react"
import api from "./api"

const MEAL_ICON = {
  breakfast:"🌅", lunch:"☀️", dinner:"🌙", snacks:"🍿", dessert:"🍰",
}

const TIER_STYLE = {
  free:    { bg:"#2e1204", color:"#fb923c", border:"#7c3a12" },
  pro:     { bg:"#0d2e16", color:"#4ade80", border:"#1a5c32" },
  credits: { bg:"#1a0d2e", color:"#c4b5fd", border:"#5a2da0" },
}

const FB_CATEGORIES = [
  { val:"general",  label:"💬 General"         },
  { val:"ui",       label:"🎨 UI / Design"      },
  { val:"feature",  label:"✨ Feature request"  },
  { val:"bug",      label:"🐛 Bug report"       },
  { val:"other",    label:"📝 Other"            },
]

function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(star => (
        <button key={star}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="text-2xl transition-transform hover:scale-110"
          style={{ color: star <= (hover || value) ? "#f59e0b" : "var(--text-faint)" }}>
          ★
        </button>
      ))}
    </div>
  )
}

export default function ProfileSidebar({ user, isOpen, onClose, onLoadRecipe, onGoToCook, logout }) {
  const [activeTab, setActiveTab] = useState("profile")
  const [history, setHistory]     = useState([])
  const [histLoading, setHistLoading] = useState(false)

  // Feedback form state
  const [fbRating, setFbRating]     = useState(0)
  const [fbCategory, setFbCategory] = useState("general")
  const [fbMessage, setFbMessage]   = useState("")
  const [fbSubmitting, setFbSubmitting] = useState(false)
  const [fbDone, setFbDone]         = useState(false)
  const [fbError, setFbError]       = useState("")

  // Load recipe history when Recipes tab is opened
  const [histLoaded, setHistLoaded] = useState(false)
  const [histError, setHistError]   = useState(false)

  useEffect(() => {
    if (activeTab === "recipes" && isOpen && !histLoaded) {
      setHistLoading(true); setHistError(false)
      api.get("/recipe/history?limit=30")
        .then(r => { setHistory(r.data || []); setHistLoaded(true) })
        .catch(() => { setHistError(true); setHistLoaded(true) })
        .finally(() => setHistLoading(false))
    }
  }, [activeTab, isOpen])

  // Reset on every sidebar open so fresh recipes appear
  useEffect(() => {
    if (isOpen) {
      setActiveTab("profile")           // ← add this line
      setFbDone(false); setFbError(""); setFbRating(0)
      setFbCategory("general"); setFbMessage("")
      setHistLoaded(false); setHistory([])
    }
  }, [isOpen])

  const handleLoadRecipe = (recipeId) => {
    onLoadRecipe(recipeId)
    onClose()
    onGoToCook()
  }

  const handleFbSubmit = async () => {
    if (fbRating === 0) { setFbError("Please select a star rating"); return }
    setFbSubmitting(true); setFbError("")
    try {
      await api.post("/app-feedback", {
        rating: fbRating, category: fbCategory, message: fbMessage || null,
      })
      setFbDone(true)
    } catch (e) {
      setFbError(e.response?.data?.detail || "Failed to submit. Please try again.")
    } finally {
      setFbSubmitting(false)
    }
  }

  const tierStyle = TIER_STYLE[user?.tier] || TIER_STYLE.free

  const TABS = [
    { id: "profile",  label: "👤 Profile"  },
    { id: "recipes",  label: "🍽 Recipes"  },
    { id: "feedback", label: "💬 Feedback" },
  ]

  return (
    <>
      {/* ── Backdrop ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={onClose}
        />
      )}

      {/* ── Sidebar panel ── */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col"
        style={{
          width: "360px",
          maxWidth: "100vw",
          background: "var(--card-bg)",
          borderLeft: "1px solid var(--card-border)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s ease",
          boxShadow: isOpen ? "-8px 0 40px rgba(0,0,0,0.5)" : "none",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--card-border)", flexShrink: 0 }}>
          <h2 className="text-sm font-black" style={{ color: "var(--text-primary)" }}>
            My Account
          </h2>
          <button onClick={onClose}
            className="text-lg transition-colors"
            style={{ color: "var(--text-faint)" }}>✕</button>
        </div>

        {/* Tab bar */}
        <div className="flex" style={{ borderBottom: "1px solid var(--card-border)", flexShrink: 0 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex-1 py-3 text-xs font-bold transition-colors"
              style={{
                color: activeTab === tab.id ? "var(--orange)" : "var(--text-faint)",
                borderBottom: activeTab === tab.id ? "2px solid var(--orange)" : "2px solid transparent",
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto chat-scroll">

          {/* ══ PROFILE TAB ══════════════════════════════════════════════════ */}
          {activeTab === "profile" && (
            <div className="p-5 space-y-5">
              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                {user?.picture ? (
                  <img src={user.picture} alt={user.name}
                    className="w-16 h-16 rounded-full object-cover"
                    style={{ border: "2px solid var(--card-border)" }}/>
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black"
                    style={{ background: "var(--orange)", color: "#fff" }}>
                    {(user?.name || user?.email || "?")[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-black text-base leading-tight truncate"
                    style={{ color: "var(--text-primary)" }}>
                    {user?.name || "User"}
                  </p>
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {user?.email}
                  </p>
                  <span className="inline-block text-xs font-bold px-2.5 py-0.5 rounded-full mt-1.5 capitalize"
                    style={{ background: tierStyle.bg, color: tierStyle.color, border: `1px solid ${tierStyle.border}` }}>
                    {user?.tier} plan
                  </span>
                </div>
              </div>

              <hr style={{ borderColor: "var(--card-border)" }}/>

              {/* Usage stats */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-3"
                  style={{ color: "var(--text-faint)" }}>Usage</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Recipes generated", value: user?.recipe_count ?? 0 },
                    { label: user?.tier === "credits" ? "Credits balance" : "Recipes left today",
                      value: user?.tier === "credits"
                        ? `${user?.credits_balance ?? 0} cr`
                        : `${Math.max(0, (user?.recipe_limit ?? 3) - (user?.recipe_count ?? 0))} / ${user?.recipe_limit ?? 3}` },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-3 text-center"
                      style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}>
                      <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{s.value}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-faint)" }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {user?.tier === "free" && (
                <div className="rounded-xl p-4"
                  style={{ background: "#2e1508", border: "1px solid #7c3a12" }}>
                  <p className="text-sm font-bold" style={{ color: "#fb923c" }}>
                    Upgrade to Pro ✨
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    This tiny amount you'd spend anywhere — but here it saves your day with unlimited recipes, smart pantry management, and a personal chef in your pocket. ₹99/mo.
                  </p>
                  <button className="btn-orange mt-3 text-xs" style={{ padding: "0.4rem 1rem" }}>
                    Upgrade now
                  </button>
                </div>
              )}

              <hr style={{ borderColor: "var(--card-border)" }}/>

              {/* Member since */}
              {user?.created_at && (
                <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                  Member since {new Date(user.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
                </p>
              )}

              <button onClick={logout}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors"
                style={{ background: "#2e0d0d", color: "#fca5a5", border: "1px solid #7c2020" }}>
                Sign out
              </button>
            </div>
          )}

          {/* ══ RECIPES TAB ══════════════════════════════════════════════════ */}
          {activeTab === "recipes" && (
            <div className="p-4">
              {histLoading ? (
                <div className="text-center py-10">
                  <div className="text-2xl mb-2 animate-bounce">🍳</div>
                  <p className="text-xs" style={{ color: "var(--text-faint)" }}>Loading recipes…</p>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-3">🍽</div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {histError ? "Could not load recipes" : "No recipes yet"}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {histError ? "Check your connection and try again" : "Generate your first recipe in the Cook tab"}
                  </p>
                  {histError && (
                    <button onClick={() => setHistLoaded(false)}
                      className="btn-ghost mt-3 text-xs" style={{ padding: "0.4rem 1rem" }}>
                      Retry
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs font-black uppercase tracking-widest mb-3"
                    style={{ color: "var(--text-faint)" }}>
                    {history.length} recent recipe{history.length !== 1 ? "s" : ""}
                  </p>
                  <div className="space-y-2">
                    {history.map(recipe => (
                      <button
                        key={recipe.id}
                        onClick={() => handleLoadRecipe(recipe.id)}
                        className="w-full text-left rounded-xl p-3 transition-all hover-lift"
                        style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                              {recipe.is_favourite ? "❤️ " : ""}{recipe.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {recipe.cuisine && (
                                <span className="text-xs" style={{ color: "var(--orange)" }}>{recipe.cuisine}</span>
                              )}
                              {recipe.cook_time_minutes && (
                                <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                                  ⏱ {recipe.cook_time_minutes}m
                                </span>
                              )}
                              <span className="text-xs px-1.5 py-0.5 rounded"
                                style={{
                                  background: recipe.mode === "pantry" ? "#0d2e16" : "#1a0d2e",
                                  color: recipe.mode === "pantry" ? "#4ade80" : "#c4b5fd",
                                  fontSize: "0.65rem",
                                }}>
                                {recipe.mode === "pantry" ? "pantry" : "search"}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                              {new Date(recipe.generated_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--orange)" }}>Load →</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ FEEDBACK TAB ═════════════════════════════════════════════════ */}
          {activeTab === "feedback" && (
            <div className="p-5">
              {fbDone ? (
                <div className="text-center py-10">
                  <div className="text-5xl mb-4">🙏</div>
                  <p className="font-black text-lg" style={{ color: "var(--text-primary)" }}>
                    Thank you!
                  </p>
                  <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
                    Your feedback helps us make PantryChef better.
                  </p>
                  <button
                    onClick={() => { setFbDone(false); setFbRating(0); setFbMessage(""); setFbCategory("general") }}
                    className="btn-ghost mt-4 text-xs" style={{ padding: "0.5rem 1.2rem" }}>
                    Submit another
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest mb-1"
                      style={{ color: "var(--text-faint)" }}>How would you rate PantryChef?</p>
                    <StarRating value={fbRating} onChange={setFbRating}/>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest mb-2"
                      style={{ color: "var(--text-faint)" }}>Category</label>
                    <div className="flex flex-wrap gap-2">
                      {FB_CATEGORIES.map(c => (
                        <button key={c.val}
                          onClick={() => setFbCategory(c.val)}
                          className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
                          style={{
                            background: fbCategory === c.val ? "var(--orange)" : "var(--input-bg)",
                            color:      fbCategory === c.val ? "#fff" : "var(--text-muted)",
                            border:     `1px solid ${fbCategory === c.val ? "var(--orange)" : "var(--card-border)"}`,
                          }}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest mb-2"
                      style={{ color: "var(--text-faint)" }}>Tell us more (optional)</label>
                    <textarea
                      value={fbMessage}
                      onChange={e => setFbMessage(e.target.value)}
                      placeholder="What do you love? What could be better? Any feature you wish existed?"
                      rows={5}
                      className="dk-input"
                      style={{ resize: "none" }}
                    />
                  </div>

                  {fbError && (
                    <p className="text-xs" style={{ color: "#f87171" }}>{fbError}</p>
                  )}

                  <button
                    onClick={handleFbSubmit}
                    disabled={fbSubmitting || fbRating === 0}
                    className="btn-orange w-full justify-center"
                    style={{ padding: "0.75rem", width: "100%" }}>
                    {fbSubmitting ? "Submitting…" : "Submit feedback"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}