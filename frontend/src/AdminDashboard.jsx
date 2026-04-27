/**
 * AdminDashboard.jsx — Admin-only dashboard for PantryChef.
 * Fixed: all array accesses use || [] fallbacks to prevent crashes
 * when API calls return errors or unexpected shapes.
 */

import { useState, useEffect, useRef } from "react"
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import api from "./api"

const CHART_COLORS = ["#e8621a","#d4870a","#1D9E75","#378ADD","#534AB7","#D85A30","#1a9e8a","#9e1a6a"]

const TIER_STYLE = {
  free:    { bg:"#2e1204", color:"#fb923c", border:"#7c3a12" },
  pro:     { bg:"#0d2e16", color:"#4ade80", border:"#1a5c32" },
  credits: { bg:"#1a0d2e", color:"#c4b5fd", border:"#5a2da0" },
}

// ── Small sub-components ──────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="dk-card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest mb-2"
        style={{ color:"var(--text-faint)" }}>{label}</p>
      <p className="text-3xl font-black leading-none"
        style={{ color: color || "var(--text-primary)" }}>{value ?? "—"}</p>
      {sub && <p className="text-xs mt-1.5" style={{ color:"var(--text-muted)" }}>{sub}</p>}
    </div>
  )
}

function Sec({ children }) {
  return <h2 className="text-xs font-black uppercase tracking-widest mb-4"
    style={{ color:"var(--text-faint)" }}>{children}</h2>
}

function TierBadge({ tier }) {
  const s = TIER_STYLE[tier] || TIER_STYLE.free
  return (
    <span className="text-xs font-bold px-2.5 py-1 rounded-full capitalize"
      style={{ background:s.bg, color:s.color, border:`1px solid ${s.border}` }}>
      {tier || "free"}
    </span>
  )
}

function DkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 text-sm shadow-xl"
      style={{ background:"#1c1712", border:"1px solid #352b1e" }}>
      <p className="font-semibold mb-1" style={{ color:"var(--text-primary)" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color:p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

function Skeleton({ h = 200 }) {
  return <div className="skeleton rounded-xl w-full" style={{ height:h }}/>
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats,    setStats]    = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [users,    setUsers]    = useState([])
  const [meta,     setMeta]     = useState({ total:0, page:1, pages:1 })
  const [search,   setSearch]   = useState("")
  const [tierF,    setTierF]    = useState("")
  const [loadSt,   setLoadSt]   = useState(true)
  const [loadAn,   setLoadAn]   = useState(true)
  const [loadUs,   setLoadUs]   = useState(true)
  const [errSt,    setErrSt]    = useState("")
  const [errAn,    setErrAn]    = useState("")
  const [activeChart, setActiveChart] = useState("recipes")

  // Editing
  const [editId,   setEditId]   = useState(null)
  const [editTier, setEditTier] = useState("")
  const [saving,   setSaving]   = useState(false)

  // Chat
  const [msgs,     setMsgs]     = useState([])
  const [input,    setInput]    = useState("")
  const [chatBusy, setChatBusy] = useState(false)
  const endRef = useRef()

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    api.get("/admin/stats")
      .then(r => setStats(r.data))
      .catch(e => setErrSt(e.response?.data?.detail || "Failed to load stats"))
      .finally(() => setLoadSt(false))
  }, [])

  useEffect(() => {
    api.get("/admin/analytics")
      .then(r => setAnalytics(r.data))
      .catch(e => setErrAn(e.response?.data?.detail || "Failed to load analytics"))
      .finally(() => setLoadAn(false))
  }, [])

  const fetchUsers = (page = 1) => {
    setLoadUs(true)
    const p = new URLSearchParams({ page, per_page: 15 })
    if (search) p.set("search", search)
    if (tierF)  p.set("tier", tierF)
    api.get(`/admin/users?${p}`)
      .then(r => {
        setUsers(Array.isArray(r.data?.users) ? r.data.users : [])
        setMeta({
          total: r.data?.total  ?? 0,
          page:  r.data?.page   ?? 1,
          pages: r.data?.pages  ?? 1,
        })
      })
      .catch(() => setUsers([]))
      .finally(() => setLoadUs(false))
  }

  useEffect(() => { fetchUsers(1) }, [search, tierF])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }) }, [msgs])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const saveTier = async (uid) => {
    setSaving(true)
    try { await api.put(`/admin/users/${uid}`, { tier:editTier }); setEditId(null); fetchUsers(meta.page) }
    catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const toggleAdmin = async (u) => {
    try { await api.put(`/admin/users/${u.id}`, { is_admin:!u.is_admin }); fetchUsers(meta.page) }
    catch { /* ignore */ }
  }

  const resetCount = async (uid) => {
    try { await api.put(`/admin/users/${uid}`, { recipe_count:0 }); fetchUsers(meta.page) }
    catch { /* ignore */ }
  }

  const ask = async () => {
    const q = input.trim(); if (!q || chatBusy) return
    const next = [...msgs, { role:"user", content:q }]
    setMsgs(next); setInput(""); setChatBusy(true)
    try {
      const r = await api.post("/admin/ask", { question:q, chat_history:msgs.slice(-6) })
      setMsgs([...next, { role:"assistant", content:r.data.answer }])
    } catch (e) {
      setMsgs([...next, { role:"assistant",
        content: e.response?.status === 403
          ? "Admin access required. Make sure your account has is_admin=true."
          : "Failed to get answer. Check backend is running." }])
    } finally { setChatBusy(false) }
  }

  // Safe array accessors — always return [] even if field missing
  const dailyRecipes  = analytics?.daily_recipes         || []
  const dailySignups  = analytics?.daily_signups          || []
  const cuisines      = analytics?.cuisine_distribution   || []
  const topDishes     = analytics?.top_dishes             || []
  const categories    = analytics?.category_distribution  || []
  const topIngs       = analytics?.top_ingredients        || []
  const safeUsers     = Array.isArray(users) ? users : []

  const SAMPLE_Q = [
    "Which cuisine is most popular?",
    "How many users joined this week?",
    "What are the top 5 searched dishes?",
    "Which users might be churning?",
    "What ingredient appears in most pantries?",
  ]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-8">

      {/* ── KPI cards ── */}
      <div>
        <Sec>Overview</Sec>
        {loadSt ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(8)].map((_,i) => <div key={i} className="dk-card p-5 h-24 skeleton rounded-2xl"/>)}
          </div>
        ) : errSt ? (
          <div className="dk-card p-4 text-sm" style={{ color:"#f87171" }}>{errSt}</div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard label="Total users"     value={stats.total_users}       sub={`${stats.free_users} free · ${stats.pro_users} pro`} />
            <KpiCard label="Active (7 days)" value={stats.active_7d}         sub="unique active users"                                   color="#e8621a"/>
            <KpiCard label="Recipes today"   value={stats.recipes_today}     sub={`${stats.total_recipes} total all time`}               color="#1D9E75"/>
            <KpiCard label="Total recipes"   value={stats.total_recipes}     sub="generated by all users" />
            <KpiCard label="Free users"      value={stats.free_users}        sub="on free tier (3 recipe limit)" />
            <KpiCard label="Pro users"       value={stats.pro_users}         sub="paying subscribers"                                    color="#4ade80"/>
            <KpiCard label="Pantry items"    value={stats.total_ingredients} sub="across all user pantries" />
            <KpiCard label="Feedback given"  value={stats.total_feedback}    sub="recipe ratings submitted" />
          </div>
        ) : null}
      </div>

      {/* ── Charts ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Sec>Activity — last 14 days</Sec>
          <div className="flex gap-2">
            {[{k:"recipes",l:"Recipes"},{k:"signups",l:"Signups"}].map(c => (
              <button key={c.k} onClick={() => setActiveChart(c.k)}
                className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                style={{
                  background: activeChart===c.k ? "var(--orange)" : "var(--input-bg)",
                  color:      activeChart===c.k ? "#fff" : "var(--text-muted)",
                  border:`1px solid ${activeChart===c.k ? "var(--orange)" : "var(--card-border)"}`,
                }}>{c.l}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Line chart */}
          <div className="lg:col-span-2 dk-card p-5">
            <h3 className="text-xs font-bold mb-4 uppercase tracking-widest"
              style={{ color:"var(--text-faint)" }}>
              {activeChart==="recipes" ? "Recipes generated per day" : "New signups per day"}
            </h3>
            {loadAn ? <Skeleton/> : errAn ? (
              <p className="text-xs py-16 text-center" style={{ color:"#f87171" }}>{errAn}</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={activeChart==="recipes" ? dailyRecipes : dailySignups}
                  margin={{ top:5, right:10, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#352b1e"/>
                  <XAxis dataKey="date" tick={{ fontSize:10, fill:"#9c836a" }} interval={2}/>
                  <YAxis tick={{ fontSize:10, fill:"#9c836a" }} allowDecimals={false}/>
                  <Tooltip content={<DkTooltip/>}/>
                  <Line type="monotone" dataKey="count"
                    name={activeChart==="recipes" ? "Recipes" : "Signups"}
                    stroke="#e8621a" strokeWidth={2.5}
                    dot={{ fill:"#e8621a", r:3 }} activeDot={{ r:5 }}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Cuisine pie */}
          <div className="dk-card p-5">
            <h3 className="text-xs font-bold mb-4 uppercase tracking-widest"
              style={{ color:"var(--text-faint)" }}>Top cuisines</h3>
            {loadAn ? <Skeleton/> : cuisines.length === 0 ? (
              <p className="text-xs py-16 text-center" style={{ color:"var(--text-faint)" }}>No recipe data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={cuisines.slice(0,6)} dataKey="count" nameKey="cuisine"
                    cx="50%" cy="50%" outerRadius={70}
                    label={({ cuisine, percent }) => percent > 0.07 ? `${Math.round(percent*100)}%` : ""}
                    labelLine={false}>
                    {cuisines.slice(0,6).map((_,i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [v, n]}
                    contentStyle={{ background:"#1c1712", border:"1px solid #352b1e", borderRadius:8 }}
                    itemStyle={{ color:"#f0dfc8" }}/>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Second row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">

          {/* Top dishes */}
          <div className="lg:col-span-2 dk-card p-5">
            <h3 className="text-xs font-bold mb-4 uppercase tracking-widest"
              style={{ color:"var(--text-faint)" }}>Top generated dishes</h3>
            {loadAn ? <Skeleton/> : topDishes.length === 0 ? (
              <p className="text-xs py-16 text-center" style={{ color:"var(--text-faint)" }}>No recipe data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topDishes.slice(0,8)} layout="vertical"
                  margin={{ top:0, right:10, left:80, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#352b1e" horizontal={false}/>
                  <XAxis type="number" tick={{ fontSize:10, fill:"#9c836a" }} allowDecimals={false}/>
                  <YAxis type="category" dataKey="name" tick={{ fontSize:10, fill:"#f0dfc8" }} width={80}/>
                  <Tooltip content={<DkTooltip/>}/>
                  <Bar dataKey="count" name="Generated" fill="#e8621a" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Category distribution */}
          <div className="dk-card p-5">
            <h3 className="text-xs font-bold mb-4 uppercase tracking-widest"
              style={{ color:"var(--text-faint)" }}>Pantry categories</h3>
            {loadAn ? <Skeleton/> : categories.length === 0 ? (
              <p className="text-xs py-16 text-center" style={{ color:"var(--text-faint)" }}>No ingredient data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categories} margin={{ top:0, right:10, left:-20, bottom:30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#352b1e"/>
                  <XAxis dataKey="category" tick={{ fontSize:9, fill:"#9c836a" }} angle={-35} textAnchor="end"/>
                  <YAxis tick={{ fontSize:10, fill:"#9c836a" }} allowDecimals={false}/>
                  <Tooltip content={<DkTooltip/>}/>
                  <Bar dataKey="count" name="Items" radius={[4,4,0,0]}>
                    {categories.map((_,i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── User table ── */}
      <div>
        <Sec>User management ({meta.total} users)</Sec>

        <div className="flex flex-wrap gap-3 mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search email or name…"
            className="dk-input flex-1" style={{ minWidth:"200px", maxWidth:"360px" }}/>
          <select value={tierF} onChange={e => setTierF(e.target.value)}
            className="dk-input" style={{ width:"130px" }}>
            <option value="">All tiers</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="credits">Credits</option>
          </select>
        </div>

        <div className="dk-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background:"var(--hover-bg)", borderBottom:"1px solid var(--card-border)" }}>
                <tr>
                  {["User","Tier","Recipes","Pantry","Joined","Last active","Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest"
                      style={{ color:"var(--text-faint)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadUs ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm"
                    style={{ color:"var(--text-faint)" }}>Loading…</td></tr>
                ) : safeUsers.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm"
                    style={{ color:"var(--text-faint)" }}>No users found</td></tr>
                ) : safeUsers.map((u, idx) => (
                  <tr key={u.id}
                    style={{ borderBottom: idx < safeUsers.length-1 ? "1px solid var(--card-border)" : "none" }}>

                    {/* Identity */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                          style={{ background:u.is_admin?"#2e1508":"var(--input-bg)",
                                   color:u.is_admin?"#fb923c":"var(--text-muted)",
                                   border:"1px solid var(--card-border)" }}>
                          {(u.name||u.email||"?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color:"var(--text-primary)", maxWidth:"160px" }}>
                            {u.name||"—"}
                          </p>
                          <p className="text-xs truncate" style={{ color:"var(--text-faint)", maxWidth:"160px" }}>
                            {u.email}
                          </p>
                        </div>
                        {u.is_admin && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                            style={{ background:"#2e1508", color:"#fb923c", border:"1px solid #7c3a12" }}>
                            admin
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Tier */}
                    <td className="px-4 py-3">
                      {editId === u.id ? (
                        <div className="flex items-center gap-1.5">
                          <select value={editTier} onChange={e => setEditTier(e.target.value)}
                            className="dk-input" style={{ width:"90px", padding:"4px 8px", fontSize:"11px" }}>
                            <option value="free">free</option>
                            <option value="pro">pro</option>
                            <option value="credits">credits</option>
                          </select>
                          <button onClick={() => saveTier(u.id)} disabled={saving}
                            className="text-xs font-bold px-2 py-1 rounded"
                            style={{ background:"#0d2e16", color:"#4ade80", border:"1px solid #1a5c32" }}>
                            {saving?"…":"Save"}
                          </button>
                          <button onClick={() => setEditId(null)}
                            className="text-xs px-1 py-1" style={{ color:"var(--text-faint)" }}>✕</button>
                        </div>
                      ) : (
                        <TierBadge tier={u.tier}/>
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs font-semibold" style={{ color:"var(--text-primary)" }}>
                      {u.total_recipes ?? 0}
                      {u.tier==="free" && (
                        <span className="ml-1" style={{ color:"var(--text-faint)" }}>
                          ({u.recipe_count ?? 0}/3)
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs" style={{ color:"var(--text-muted)" }}>
                      {u.total_ingredients ?? 0} items
                    </td>

                    <td className="px-4 py-3 text-xs" style={{ color:"var(--text-muted)" }}>
                      {u.created_at
                        ? new Date(u.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"2-digit"})
                        : "—"}
                    </td>

                    <td className="px-4 py-3 text-xs" style={{ color:"var(--text-muted)" }}>
                      {u.last_active
                        ? new Date(u.last_active).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})
                        : "—"}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => { setEditId(u.id); setEditTier(u.tier||"free") }}
                          className="text-xs font-semibold" style={{ color:"#93c5fd" }}>
                          Edit tier
                        </button>
                        <button onClick={() => toggleAdmin(u)}
                          className="text-xs font-semibold"
                          style={{ color:u.is_admin?"#f87171":"#fb923c" }}>
                          {u.is_admin?"Remove admin":"Make admin"}
                        </button>
                        {u.tier==="free" && (u.recipe_count ?? 0) > 0 && (
                          <button onClick={() => resetCount(u.id)}
                            className="text-xs font-semibold" style={{ color:"#4ade80" }}>
                            Reset count
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta.pages > 1 && (
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ borderTop:"1px solid var(--card-border)" }}>
              <p className="text-xs" style={{ color:"var(--text-faint)" }}>
                Page {meta.page} of {meta.pages} · {meta.total} users
              </p>
              <div className="flex gap-2">
                <button onClick={() => fetchUsers(meta.page-1)} disabled={meta.page<=1} className="btn-ghost text-xs" style={{ padding:"4px 10px" }}>← Prev</button>
                <button onClick={() => fetchUsers(meta.page+1)} disabled={meta.page>=meta.pages} className="btn-ghost text-xs" style={{ padding:"4px 10px" }}>Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── LLM Q&A ── */}
      <div>
        <Sec>Ask about your data</Sec>
        <div className="dk-card overflow-hidden">

          <div className="px-5 py-4 flex items-center gap-3"
            style={{ background:"linear-gradient(135deg,#2e1508,#1e0d04)", borderBottom:"1px solid var(--card-border)" }}>
            <span className="text-2xl">🤖</span>
            <div>
              <h3 className="text-sm font-black" style={{ color:"var(--text-primary)" }}>Data analyst AI</h3>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>
                Ask anything about users, recipes, trends — answers from live database data
              </p>
            </div>
          </div>

          {msgs.length === 0 && (
            <div className="px-5 py-4">
              <p className="text-xs font-semibold mb-3" style={{ color:"var(--text-faint)" }}>Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_Q.map(q => (
                  <button key={q} onClick={() => setInput(q)}
                    className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors hover-lift"
                    style={{ background:"var(--input-bg)", border:"1px solid var(--card-border)", color:"var(--text-muted)" }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.length > 0 && (
            <div className="px-5 py-4 max-h-96 overflow-y-auto space-y-4 chat-scroll">
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                  <div className="max-w-2xl px-4 py-3 rounded-2xl text-sm leading-relaxed font-medium"
                    style={m.role==="user"
                      ? { background:"var(--orange)", color:"#fff", borderBottomRightRadius:"4px" }
                      : { background:"var(--hover-bg)", color:"var(--text-primary)", border:"1px solid var(--card-border)", borderBottomLeftRadius:"4px" }}>
                    {m.content}
                  </div>
                </div>
              ))}
              {chatBusy && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl text-sm flex items-center gap-2"
                    style={{ background:"var(--hover-bg)", color:"var(--text-muted)", border:"1px solid var(--card-border)" }}>
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    <span className="animate-pulse text-xs">Querying database and analysing…</span>
                  </div>
                </div>
              )}
              <div ref={endRef}/>
            </div>
          )}

          <div className="px-5 py-4 flex gap-2" style={{ borderTop:"1px solid var(--card-border)" }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key==="Enter" && !e.shiftKey && ask()}
              placeholder="e.g. Which users have used all their free recipes?"
              disabled={chatBusy} className="dk-input flex-1"/>
            <button onClick={ask} disabled={chatBusy||!input.trim()}
              className="btn-orange flex-shrink-0" style={{ padding:"0.5rem 1.2rem", borderRadius:"0.625rem" }}>
              Ask →
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}