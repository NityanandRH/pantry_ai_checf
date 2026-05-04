import { useState, useEffect, useRef } from "react"

/* ─────────────────────────────────────────────────────────────────────────────
   PantryChef — Home Page
   • Works pre-auth (landing) and post-auth (home tab)
   • Your uploaded video as slow-motion background loop
   • Large circular buttons with food photography
   • Features showcase section
   • Streaming hover context panel
───────────────────────────────────────────────────────────────────────────── */

const SPICES = ["🌶","🧄","🫚","🫘","🌿","🧅","🌾","🥬","🍋"]

const FEATURES = [
  {
    icon: "🤖",
    title: "AI Chef Agent",
    desc: "GPT-4o scans your pantry in real-time and crafts recipes using only what you have — no guessing, no missing ingredients.",
  },
  {
    icon: "📸",
    title: "Scan Anything",
    desc: "Photograph your fridge or a dish you want to recreate. AI identifies ingredients and generates the recipe instantly.",
  },
  {
    icon: "🧾",
    title: "Smart Pantry",
    desc: "Track 200+ Indian ingredients with autocomplete, expiry reminders, and category organisation. Never waste food again.",
  },
  {
    icon: "💬",
    title: "Cooking Assistant",
    desc: "Ask anything mid-recipe — substitutions, spice levels, technique tips. Your personal chef answers in seconds.",
  },
  {
    icon: "💡",
    title: "Instant Suggestions",
    desc: "Get 6–8 recipe ideas based on your current pantry with one tap. See exactly what's available and what's missing.",
  },
  {
    icon: "🔍",
    title: "Search Any Dish",
    desc: "Type any dish name and get the full recipe plus a shopping list for missing ingredients — all in one place.",
  },
]

const TAB_INFO = {
  cook: {
    color: "249,115,22",
    photo: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&q=80",
    photoAlt: "Rich Indian curry",
    lines: [
      "Your AI-powered chef.",
      "",
      "The agent scans your pantry, checks availability, and crafts recipes from exactly what you have. Search any dish, scan a photo, or let it surprise you.",
      "",
      "→ Pantry-based AI recipe generation",
      "→ 6–8 smart suggestions on demand",
      "→ AI cooking assistant for any question",
    ],
  },
  pantry: {
    color: "74,222,128",
    photo: "https://images.unsplash.com/photo-1506368249639-73a05d6f6488?w=400&q=80",
    photoAlt: "Fresh spices and vegetables",
    lines: [
      "Your smart ingredient tracker.",
      "",
      "Scan your fridge with a photo, add with intelligent autocomplete, set expiry dates. Your pantry always up to date.",
      "",
      "→ AI fridge scan — detect everything",
      "→ 200+ Indian ingredient autocomplete",
      "→ Expiry reminders & waste prevention",
    ],
  },
  admin: {
    color: "167,139,250",
    photo: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=80",
    photoAlt: "Analytics dashboard",
    lines: [
      "Platform control centre.",
      "",
      "Monitor users, recipe stats, and feedback. Ask AI to summarise what users are saying.",
      "",
      "→ User management & tier control",
      "→ Recipe analytics dashboard",
      "→ LLM-powered feedback analysis",
    ],
  },
}

// ── Streaming text hook ────────────────────────────────────────────────────
function useStreamText(lines, active) {
  const [displayed, setDisplayed] = useState([])
  const timerRef = useRef(null)

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (!active) { setDisplayed([]); return }
    setDisplayed([])
    let lineIdx = 0, charIdx = 0, cur = []

    const tick = () => {
      if (lineIdx >= lines.length) return
      const line = lines[lineIdx]
      if (charIdx === 0) { cur = [...cur, ""]; setDisplayed([...cur]) }
      if (charIdx < line.length) {
        cur[lineIdx] = line.slice(0, charIdx + 1)
        setDisplayed([...cur])
        charIdx++
        const ch = line[charIdx - 1]
        timerRef.current = setTimeout(tick, ch === "." ? 55 : ch === "," ? 38 : 17)
      } else {
        lineIdx++; charIdx = 0
        timerRef.current = setTimeout(tick, lineIdx < lines.length ? 72 : 0)
      }
    }
    timerRef.current = setTimeout(tick, 200)
    return () => clearTimeout(timerRef.current)
  }, [active, lines])

  return displayed
}

// ── Context panel ──────────────────────────────────────────────────────────
function ContextPanel({ tabKey, visible, fromLeft }) {
  const info = TAB_INFO[tabKey]
  const lines = useStreamText(info?.lines || [], visible)
  const done = lines.length === (info?.lines?.length || 0)

  return (
    <div style={{
      position: "fixed",
      top: "50%",
      [fromLeft ? "left" : "right"]: 0,
      transform: `translateY(-50%) translateX(${visible ? "0%" : fromLeft ? "-110%" : "110%"})`,
      transition: "transform 0.42s cubic-bezier(0.34,1.2,0.64,1)",
      zIndex: 60,
      width: "min(320px, 88vw)",
      maxHeight: "68vh",
      overflowY: "auto",
      background: "rgba(8,3,1,0.93)",
      backdropFilter: "blur(30px)",
      WebkitBackdropFilter: "blur(30px)",
      border: `1px solid rgba(${info?.color},0.28)`,
      borderRadius: fromLeft ? "0 22px 22px 0" : "22px 0 0 22px",
      padding: "24px 20px",
      boxShadow: `0 0 60px rgba(${info?.color},0.12), 0 24px 80px rgba(0,0,0,0.7)`,
      scrollbarWidth: "none",
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: `rgb(${info?.color})`, marginBottom: 16 }}>
        {tabKey === "cook" ? "Cook" : tabKey === "pantry" ? "My Pantry" : "Admin"}
      </div>
      <div>
        {lines.map((line, i) => (
          <p key={i} style={{
            fontSize: line.startsWith("→") ? 12 : i === 0 ? 15 : 12.5,
            fontWeight: line.startsWith("→") ? 700 : i === 0 ? 700 : 400,
            color: line.startsWith("→") ? `rgb(${info?.color})` : i === 0 ? "#fff" : "rgba(255,255,255,0.5)",
            lineHeight: 1.65,
            margin: line === "" ? "5px 0" : "0 0 1px",
          }}>
            {line || "\u00A0"}
            {i === lines.length - 1 && !done && (
              <span style={{
                display: "inline-block", width: 1.5, height: "0.9em",
                background: `rgb(${info?.color})`, marginLeft: 2,
                verticalAlign: "text-bottom", animation: "blink 0.65s step-end infinite",
              }}/>
            )}
          </p>
        ))}
      </div>
      {done && (
        <div style={{
          marginTop: 16, paddingTop: 12,
          borderTop: `1px solid rgba(${info?.color},0.15)`,
          fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
          textTransform: "uppercase", color: `rgba(${info?.color},0.6)`,
          animation: "fadeIn 0.4s ease",
        }}>
          Click to open →
        </div>
      )}
    </div>
  )
}

// ── Photo circle button ────────────────────────────────────────────────────
function PhotoCircleBtn({ tabKey, size, pos, labelPos, delay, onHover, onClick, isHovered }) {
  const info = TAB_INFO[tabKey]
  const [pressed, setPressed] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const label = tabKey === "cook" ? "Cook" : tabKey === "pantry" ? "My Pantry" : "Admin"

  return (
    <div style={{
      position: "absolute", ...pos, zIndex: 20,
      animation: `floatIn 0.78s ${delay}s cubic-bezier(0.34,1.56,0.64,1) both`,
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>

        {labelPos === "above" && (
          <span style={{
            fontSize: 12, fontWeight: 800, letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: isHovered ? `rgb(${info.color})` : "rgba(255,255,255,0.55)",
            transition: "color 0.25s",
            textShadow: isHovered ? `0 0 20px rgba(${info.color},0.7)` : "none",
          }}>{label}</span>
        )}

        <div style={{ position: "relative", width: size, height: size }}>
          {/* Pulse rings */}
          {[size + 20, size + 38].map((s, i) => (
            <div key={i} style={{
              position: "absolute",
              width: s, height: s,
              borderRadius: "50%",
              border: `${i === 0 ? 1.5 : 1}px solid rgba(${info.color},${i === 0 ? 0.3 : 0.15})`,
              top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              animation: isHovered ? "none" : `pulseRing ${2.6 + i * 0.8}s ${delay + i * 1.2}s ease-in-out infinite`,
              opacity: isHovered ? 0 : 1,
              transition: "opacity 0.2s",
              pointerEvents: "none",
            }}/>
          ))}

          {/* Button */}
          <button
            onMouseEnter={() => onHover(tabKey)}
            onMouseLeave={() => onHover(null)}
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => { setPressed(false); onClick() }}
            onClick={onClick}
            style={{
              width: "100%", height: "100%",
              borderRadius: "50%",
              border: "none", cursor: "pointer",
              overflow: "hidden",
              position: "relative",
              transform: pressed ? "scale(0.91)" : isHovered ? "scale(1.1)" : "scale(1)",
              transition: "all 0.32s cubic-bezier(0.34,1.56,0.64,1)",
              outline: `${isHovered ? 3 : 2}px solid rgba(${info.color},${isHovered ? 0.8 : 0.3})`,
              outlineOffset: isHovered ? 5 : 2,
              boxShadow: isHovered
                ? `0 0 50px rgba(${info.color},0.55), 0 0 100px rgba(${info.color},0.2)`
                : `0 8px 32px rgba(0,0,0,0.55)`,
              animation: isHovered ? "none" : `breathe 4s ${delay}s ease-in-out infinite`,
              padding: 0,
            }}
          >
            {/* Food photo */}
            <img
              src={info.photo}
              alt={info.photoAlt}
              onLoad={() => setImgLoaded(true)}
              style={{
                width: "100%", height: "100%",
                objectFit: "cover",
                filter: isHovered ? "brightness(0.7) saturate(1.2)" : "brightness(0.5) saturate(0.9)",
                transition: "filter 0.35s ease",
                opacity: imgLoaded ? 1 : 0,
                transition: "filter 0.35s ease, opacity 0.4s ease",
              }}
            />

            {/* Overlay gradient */}
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: isHovered
                ? `radial-gradient(circle at center, rgba(${info.color},0.35) 0%, rgba(0,0,0,0.1) 100%)`
                : `radial-gradient(circle at center, rgba(${info.color},0.12) 0%, rgba(0,0,0,0.55) 100%)`,
              transition: "background 0.35s ease",
            }}/>

            {/* Emoji overlay when not hovered */}
            {!isHovered && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: size * 0.28,
              }}>
                {tabKey === "cook" ? "👨‍🍳" : tabKey === "pantry" ? "🥦" : "⚙️"}
              </div>
            )}

            {/* Loading fallback bg */}
            {!imgLoaded && (
              <div style={{
                position: "absolute", inset: 0,
                background: `radial-gradient(circle, rgba(${info.color},0.2), rgba(0,0,0,0.6))`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: size * 0.35,
              }}>
                {tabKey === "cook" ? "👨‍🍳" : tabKey === "pantry" ? "🥦" : "⚙️"}
              </div>
            )}
          </button>
        </div>

        {(labelPos === "below" || !labelPos) && (
          <span style={{
            fontSize: 12, fontWeight: 800, letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: isHovered ? `rgb(${info.color})` : "rgba(255,255,255,0.55)",
            transition: "color 0.25s",
            textShadow: isHovered ? `0 0 20px rgba(${info.color},0.7)` : "none",
          }}>{label}</span>
        )}
      </div>
    </div>
  )
}

// ── Feature card ───────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, delay }) {
  return (
    <div style={{
      animation: `slideUp 0.6s ${delay}s both`,
      background: "rgba(255,255,255,0.04)",
      backdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 18, padding: "22px 20px",
      transition: "all 0.25s ease",
    }}
    onMouseEnter={e => {
      e.currentTarget.style.background = "rgba(249,115,22,0.07)"
      e.currentTarget.style.borderColor = "rgba(249,115,22,0.25)"
      e.currentTarget.style.transform = "translateY(-3px)"
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = "rgba(255,255,255,0.04)"
      e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"
      e.currentTarget.style.transform = "translateY(0)"
    }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
      <div style={{
        fontSize: 14, fontWeight: 800, color: "#fff",
        marginBottom: 6, letterSpacing: "-0.01em",
      }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>{desc}</div>
    </div>
  )
}

function SpiceParticle({ emoji, s }) {
  return (
    <span style={{
      position: "absolute", fontSize: s.size, opacity: 0,
      animation: `floatSpice ${s.dur}s ${s.delay}s ease-in-out infinite`,
      left: s.left, top: s.top, filter: "blur(0.4px)",
      pointerEvents: "none", userSelect: "none", zIndex: 1,
    }}>{emoji}</span>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Home({ user, ingredients, onNavigate, onSignIn, recipesUsed, recipeLimit, expiringCount }) {
  const [loaded, setLoaded] = useState(false)
  const [clock, setClock] = useState("")
  const [hoveredTab, setHoveredTab] = useState(null)
  const [showFeatures, setShowFeatures] = useState(false)
  const videoRef = useRef()
  const featuresRef = useRef()

  const isLoggedIn = !!user

  const particles = useRef(
    SPICES.map(e => ({
      emoji: e,
      s: {
        size: `${Math.random() * 14 + 10}px`,
        dur: Math.random() * 12 + 14,
        delay: Math.random() * 12,
        left: `${Math.random() * 92}%`,
        top: `${Math.random() * 88}%`,
      }
    }))
  ).current

  const getGreeting = () => {
    const h = new Date().getHours()
    return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Good night"
  }

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 80)
    const upd = () => setClock(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }))
    upd()
    const iv = setInterval(upd, 60000)
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [])

  // Slow motion video — keep retrying until playbackRate takes effect
  useEffect(() => {
    const setSlowMo = () => {
      if (videoRef.current) {
        videoRef.current.playbackRate = 0.45
      }
    }
    setSlowMo()
    // Retry every 200ms for 3s in case video hasn't loaded yet
    const iv = setInterval(setSlowMo, 200)
    const cleanup = setTimeout(() => clearInterval(iv), 3000)
    return () => { clearInterval(iv); clearTimeout(cleanup) }
  }, [])

  const handleVideoLoaded = () => {
    if (videoRef.current) videoRef.current.playbackRate = 0.45
  }

  const firstName = (user?.name || user?.email || "Chef").split(/[\s@]/)[0]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500;600;700;800&display=swap');

        @keyframes floatSpice {
          0%   { opacity:0; transform:translateY(20px) rotate(0deg) scale(0.8); }
          15%  { opacity:0.25; }
          50%  { opacity:0.15; transform:translateY(-40px) rotate(12deg) scale(1.1); }
          85%  { opacity:0.25; }
          100% { opacity:0; transform:translateY(20px) rotate(-5deg) scale(0.8); }
        }
        @keyframes floatIn {
          from { opacity:0; transform:scale(0.35) translateY(50px); }
          to   { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes slideUp {
          from { opacity:0; transform:translateY(36px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes shimmerText {
          0%,100% { background-position:0% 50%; }
          50%     { background-position:100% 50%; }
        }
        @keyframes pulseRing {
          0%,100% { transform:translate(-50%,-50%) scale(1); opacity:0.38; }
          50%     { transform:translate(-50%,-50%) scale(1); opacity:0.38; }
          50%     { transform:translate(-50%,-50%) scale(1.2); opacity:0.1; }
        }
        @keyframes breathe {
          0%,100% { transform:scale(1) translateY(0); }
          50%     { transform:scale(1.02) translateY(-6px); }
        }
        @keyframes driftBg {
          0%,100% { background-position:0% 50%; }
          50%     { background-position:100% 50%; }
        }
        @keyframes grain {
          0%,100%{transform:translate(0,0)} 10%{transform:translate(-2%,-3%)}
          20%{transform:translate(3%,2%)} 30%{transform:translate(-1%,4%)}
          40%{transform:translate(4%,-1%)} 50%{transform:translate(-3%,3%)}
          60%{transform:translate(2%,-4%)} 70%{transform:translate(-4%,1%)}
          80%{transform:translate(3%,-2%)} 90%{transform:translate(-2%,4%)}
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes bounce {
          0%,100% { transform:translateY(0); }
          50%     { transform:translateY(6px); }
        }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { display:none; }
      `}</style>

      <div style={{
        position: "relative",
        fontFamily: "'DM Sans', sans-serif",
        opacity: loaded ? 1 : 0,
        transition: "opacity 0.55s ease",
        minHeight: "100vh",
        overflowX: "hidden",
      }}>

        {/* ════════════════════════════════════════════════════════
            SECTION 1 — HERO (full viewport)
        ════════════════════════════════════════════════════════ */}
        <div style={{ position: "relative", height: "100vh", overflow: "hidden" }}>

          {/* Your uploaded video — slow motion 0.45x */}
          <video
            ref={videoRef}
            autoPlay muted loop playsInline
            onLoadedData={handleVideoLoaded}
            onCanPlay={handleVideoLoaded}
            onPlay={handleVideoLoaded}
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover", zIndex: 0,
            }}
          >
            <source src="/bg-video.mp4" type="video/mp4"/>
          </video>

          {/* CSS animated bg fallback */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 0,
            background: `
              radial-gradient(ellipse 80% 55% at 12% 90%, rgba(175,55,0,0.65) 0%, transparent 60%),
              radial-gradient(ellipse 55% 70% at 88% 10%, rgba(115,38,0,0.55) 0%, transparent 60%),
              radial-gradient(ellipse 100% 45% at 50% 100%, rgba(70,18,0,0.8) 0%, transparent 55%),
              linear-gradient(135deg,#0c0502 0%,#190903 35%,#100703 65%,#040201 100%)
            `,
            backgroundSize: "200% 200%",
            animation: "driftBg 24s ease-in-out infinite",
          }}/>

          {/* Dark overlay */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 2,
            background: `
              linear-gradient(to bottom, rgba(4,2,1,0.78) 0%, rgba(4,2,1,0.45) 40%, rgba(4,2,1,0.95) 100%),
              radial-gradient(ellipse at 50% 45%, transparent 25%, rgba(0,0,0,0.6) 100%)
            `,
          }}/>

          {/* Grain */}
          <div style={{
            position: "absolute", inset: "-50%", zIndex: 3, pointerEvents: "none",
            opacity: 0.038, animation: "grain 0.5s steps(2) infinite",
            background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}/>

          {/* Particles */}
          <div style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none", overflow: "hidden" }}>
            {particles.map((p, i) => <SpiceParticle key={i} emoji={p.emoji} s={p.s}/>)}
          </div>

          {/* Streaming context panels */}
          {isLoggedIn && (["cook","pantry",...(user?.is_admin?["admin"]:[])]).map(key => (
            <ContextPanel key={key} tabKey={key} visible={hoveredTab===key} fromLeft={key==="cook"}/>
          ))}

          {/* ── Hero content ── */}
          <div style={{
            position: "relative", zIndex: 10,
            height: "100%", display: "flex", flexDirection: "column",
            padding: "28px 28px 32px", boxSizing: "border-box",
          }}>

            {/* Top bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", animation: "slideUp 0.7s 0.1s both" }}>
              {/* Logo */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: "linear-gradient(135deg,#f97316,#dc4a00)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, boxShadow: "0 4px 18px rgba(249,115,22,0.4)",
                }}>🍲</div>
                <div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em" }}>PantryChef</div>
                  {isLoggedIn && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>{clock}</div>}
                </div>
              </div>

              {/* Right: user pill or sign in */}
              {isLoggedIn ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(255,255,255,0.07)", backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 99, padding: "5px 14px 5px 7px",
                }}>
                  <div style={{
                    width: 25, height: 25, borderRadius: "50%",
                    background: "linear-gradient(135deg,#f97316,#dc4a00)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: "#fff",
                    overflow: "hidden", flexShrink: 0,
                  }}>
                    {user?.picture
                      ? <img src={user.picture} style={{ width:"100%",height:"100%",objectFit:"cover" }} alt=""/>
                      : (user?.name||user?.email||"?")[0].toUpperCase()
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", lineHeight: 1 }}>{firstName}</div>
                    <div style={{ fontSize: 9, color: "#f97316", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {user?.tier||"free"}{user?.is_admin?" · admin":""}
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={onSignIn}
                  style={{
                    background: "linear-gradient(135deg,#f97316,#dc4a00)",
                    border: "none", borderRadius: 99, padding: "9px 22px",
                    fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer",
                    boxShadow: "0 4px 20px rgba(249,115,22,0.4)",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = "scale(1.04)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                >
                  Sign in with Google
                </button>
              )}
            </div>

            {/* Central hero */}
            <div style={{ flex: 1, position: "relative" }}>

              {/* Hero text */}
              <div style={{
                position: "absolute", top: "8%", left: "5%", maxWidth: 480,
                animation: "slideUp 0.8s 0.3s both",
              }}>
                {isLoggedIn && (
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.15em",
                    textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 12,
                  }}>
                    {getGreeting()}, {firstName} 👋
                  </div>
                )}

                <h1 style={{
                  fontFamily: "'Playfair Display',serif",
                  fontSize: "clamp(38px,5.5vw,70px)",
                  fontWeight: 900, lineHeight: 1.0,
                  letterSpacing: "-0.025em", margin: "0 0 14px",
                  backgroundImage: "linear-gradient(135deg,#fff 18%,#ffb87a 52%,#f97316 85%)",
                  backgroundSize: "200% 200%",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  animation: "slideUp 0.8s 0.3s both, shimmerText 6s 1.3s ease infinite",
                }}>
                  {isLoggedIn ? "What are we\ncooking today?" : "Cook anything\nwith what\nyou have."}
                </h1>

                <p style={{
                  fontSize: "clamp(12px,1.5vw,15px)",
                  color: "rgba(255,255,255,0.4)", lineHeight: 1.65, fontWeight: 400, margin: "0 0 24px",
                  animation: "slideUp 0.7s 0.5s both",
                }}>
                  {isLoggedIn
                    ? "Hover a button to explore what's waiting for you."
                    : "Your AI-powered personal chef. Turn pantry ingredients into delicious recipes in seconds."
                  }
                </p>

                {/* Pre-auth CTA */}
                {!isLoggedIn && (
                  <div style={{ animation: "slideUp 0.7s 0.6s both", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button
                      onClick={onSignIn}
                      style={{
                        background: "linear-gradient(135deg,#f97316,#dc4a00)",
                        border: "none", borderRadius: 99, padding: "13px 32px",
                        fontSize: 15, fontWeight: 800, color: "#fff", cursor: "pointer",
                        boxShadow: "0 6px 28px rgba(249,115,22,0.45)",
                        transition: "all 0.25s ease",
                        letterSpacing: "-0.01em",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.04) translateY(-2px)"; e.currentTarget.style.boxShadow = "0 10px 36px rgba(249,115,22,0.55)" }}
                      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1) translateY(0)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(249,115,22,0.45)" }}
                    >
                      🍳 Start cooking free
                    </button>
                    <button
                      onClick={() => { setShowFeatures(true); setTimeout(() => featuresRef.current?.scrollIntoView({ behavior: "smooth" }), 100) }}
                      style={{
                        background: "rgba(255,255,255,0.08)", backdropFilter: "blur(16px)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: 99, padding: "13px 28px",
                        fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)",
                        cursor: "pointer", transition: "all 0.25s ease",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)" }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)" }}
                    >
                      See features ↓
                    </button>
                  </div>
                )}
              </div>

              {/* ── Photo circle buttons (post-auth only) ── */}
              {isLoggedIn && (
                <>
                  {/* Cook — large, bottom-left quadrant, bigger */}
                  <PhotoCircleBtn
                    tabKey="cook" size={178}
                    pos={{ bottom: "20%", left: "20%" }}
                    labelPos="below" delay={0.58}
                    isHovered={hoveredTab==="cook"}
                    onHover={setHoveredTab}
                    onClick={() => onNavigate("cook")}
                  />

                  {/* My Pantry — slightly smaller, upper-right, pulled inward */}
                  <PhotoCircleBtn
                    tabKey="pantry" size={150}
                    pos={{ bottom: "38%", right: "18%" }}
                    labelPos="above" delay={0.72}
                    isHovered={hoveredTab==="pantry"}
                    onHover={setHoveredTab}
                    onClick={() => onNavigate("pantry")}
                  />

                  {/* Admin — medium, lower-right, tucked near pantry */}
                  {user?.is_admin && (
                    <PhotoCircleBtn
                      tabKey="admin" size={102}
                      pos={{ bottom: "12%", right: "12%" }}
                      labelPos="below" delay={0.88}
                      isHovered={hoveredTab==="admin"}
                      onHover={setHoveredTab}
                      onClick={() => onNavigate("admin")}
                    />
                  )}

                  <div style={{
                    position: "absolute", bottom: "6%", left: "50%", transform: "translateX(-50%)",
                    fontSize: 10, color: "rgba(255,255,255,0.2)", fontWeight: 600,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    whiteSpace: "nowrap", animation: "slideUp 0.7s 1.1s both",
                  }}>
                    hover to explore · click to open
                  </div>
                </>
              )}

              {/* Pre-auth floating feature pills */}
              {!isLoggedIn && (
                <div style={{
                  position: "absolute", bottom: "18%", right: "6%",
                  display: "flex", flexDirection: "column", gap: 10, maxWidth: 200,
                  animation: "slideUp 0.7s 0.7s both",
                }}>
                  {["3 free recipes to start", "AI checks real ingredients", "Your data is private"].map((f, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 99, padding: "8px 14px",
                    }}>
                      <span style={{ fontSize: 14 }}>{["🎁","🤖","🔒"][i]}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom stats (post-auth) */}
            {isLoggedIn && (
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 8,
                justifyContent: "center", alignItems: "center",
                animation: "slideUp 0.7s 0.95s both",
              }}>
                {[
                  { icon: "🥕", val: ingredients?.length||0, label: "Ingredients" },
                  { icon: "📋", val: `${recipesUsed||0}/${recipeLimit||3}`, label: "Today" },
                  { icon: user?.tier==="pro"?"⭐":"✨", val: user?.tier==="pro"?"Pro":"Free", label: "Plan" },
                ].map(s => (
                  <div key={s.label} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    background: "rgba(255,255,255,0.05)", backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.09)", borderRadius: 99, padding: "7px 16px",
                  }}>
                    <span style={{ fontSize: 13 }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{s.val}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.38)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.label}</div>
                    </div>
                  </div>
                ))}
                {expiringCount > 0 && (
                  <div onClick={() => onNavigate("pantry")} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.28)",
                    borderRadius: 99, padding: "7px 16px", cursor: "pointer",
                  }}>
                    <span style={{ fontSize: 13 }}>⏰</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24", lineHeight: 1 }}>{expiringCount}</div>
                      <div style={{ fontSize: 9, color: "rgba(251,191,36,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>expiring</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Pre-auth scroll arrow */}
            {!isLoggedIn && (
              <div style={{ textAlign: "center", animation: "slideUp 0.7s 0.9s both" }}>
                <div style={{
                  fontSize: 20, color: "rgba(255,255,255,0.3)",
                  animation: "bounce 1.6s ease-in-out infinite", cursor: "pointer",
                }} onClick={() => { setShowFeatures(true); setTimeout(() => featuresRef.current?.scrollIntoView({ behavior: "smooth" }), 100) }}>
                  ↓
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            SECTION 2 — FEATURES (pre-auth only, scrolls in)
        ════════════════════════════════════════════════════════ */}
        {!isLoggedIn && (
          <div ref={featuresRef} style={{
            position: "relative",
            background: "linear-gradient(to bottom, #040201 0%, #0d0502 40%, #080302 100%)",
            padding: "80px 28px 100px",
            minHeight: "100vh",
          }}>
            {/* Subtle bg texture */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.03,
              background: "radial-gradient(ellipse 80% 40% at 50% 0%, rgba(249,115,22,0.8) 0%, transparent 70%)",
            }}/>

            <div style={{ position: "relative", maxWidth: 960, margin: "0 auto" }}>
              {/* Section header */}
              <div style={{ textAlign: "center", marginBottom: 56 }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.16em",
                  textTransform: "uppercase", color: "#f97316", marginBottom: 14,
                }}>
                  What PantryChef can do
                </div>
                <h2 style={{
                  fontFamily: "'Playfair Display',serif",
                  fontSize: "clamp(30px,4vw,48px)",
                  fontWeight: 900, color: "#fff",
                  margin: "0 0 14px", letterSpacing: "-0.02em",
                }}>
                  Your kitchen, supercharged.
                </h2>
                <p style={{
                  fontSize: 15, color: "rgba(255,255,255,0.4)", lineHeight: 1.65,
                  maxWidth: 440, margin: "0 auto",
                }}>
                  From AI-powered recipe generation to smart pantry tracking — everything you need to cook better.
                </p>
              </div>

              {/* Features grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 16,
                marginBottom: 64,
              }}>
                {FEATURES.map((f, i) => (
                  <FeatureCard key={i} {...f} delay={i * 0.08}/>
                ))}
              </div>

              {/* Final CTA */}
              <div style={{ textAlign: "center" }}>
                <p style={{
                  fontSize: 13, color: "rgba(255,255,255,0.35)",
                  marginBottom: 20, fontWeight: 500,
                }}>
                  Free to start. No credit card needed.
                </p>
                <button
                  onClick={onSignIn}
                  style={{
                    background: "linear-gradient(135deg,#f97316,#dc4a00)",
                    border: "none", borderRadius: 99, padding: "16px 48px",
                    fontSize: 17, fontWeight: 800, color: "#fff", cursor: "pointer",
                    boxShadow: "0 8px 36px rgba(249,115,22,0.45)",
                    transition: "all 0.25s ease",
                    letterSpacing: "-0.01em",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.04) translateY(-2px)"; e.currentTarget.style.boxShadow = "0 14px 44px rgba(249,115,22,0.55)" }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1) translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 36px rgba(249,115,22,0.45)" }}
                >
                  Start cooking free →
                </button>
                <div style={{ marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>
                  Sign in with Google · 3 free recipes to start
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}