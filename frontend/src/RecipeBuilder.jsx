import { useState, useEffect, useRef } from "react"
import api from "./api"

const CUISINES   = ["","Indian","North Indian","South Indian","Italian","Chinese","Continental"]
const MEAL_TYPES = ["","Breakfast","Lunch","Dinner","Snacks","Dessert"]
const COOK_TIMES = ["","Under 15 min","15–30 min","30–60 min","Over 1 hour"]
const SKILLS     = ["","Beginner","Intermediate","Chef"]
const DIETS      = ["","Veg","Non-veg","Vegan"]
const METHODS    = ["","With fire","Without fire"]
const DETAILS    = ["","Quick","Medium","Detailed"]
const DIET_PREFS = ["","Regular","Diabetic-friendly","Low-sodium","High-protein","Low-calorie"]
const ALLERGENS  = ["gluten","dairy","nuts","eggs","soy"]

const EMPTY_FILTERS = {
  cuisine:"", meal_type:"", cook_time:"", skill_level:"",
  diet_type:"", cook_method:"", detail_level:"", diet_preference:"",
  servings:2, allergies:[],
}

const FEEDBACK_OPTIONS = [
  {val:"loved_it",label:"😍 Loved it"},
  {val:"too_spicy",label:"🌶 Too spicy"},
  {val:"too_bland",label:"😐 Too bland"},
  {val:"too_complex",label:"😓 Too complex"},
  {val:"other",label:"💬 Other"},
]

const MEAL_BG = {
  breakfast:"linear-gradient(135deg,#1a1200,#2e1e00)",
  lunch:"linear-gradient(135deg,#0d1a10,#0d2e14)",
  dinner:"linear-gradient(135deg,#0a0d1a,#0d102e)",
  snacks:"linear-gradient(135deg,#1a0d08,#2e1408)",
  dessert:"linear-gradient(135deg,#1a0d16,#2e0d20)",
}

const DIFF_COLOR = {
  beginner:    { bg:"rgba(74,222,128,0.12)", color:"#4ade80" },
  intermediate:{ bg:"rgba(251,191,36,0.12)", color:"#fbbf24" },
  chef:        { bg:"rgba(248,113,113,0.12)", color:"#f87171" },
}

const genId = () =>
  typeof crypto!=="undefined"&&crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

function Spinner({ size=4 }) {
  return (
    <svg className={`animate-spin h-${size} w-${size}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  )
}

function FilterSel({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-faint)"}}>{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} className="dk-input text-xs">
        {options.map(o=><option key={o} value={o}>{o||"Any"}</option>)}
      </select>
    </div>
  )
}

function IngStatusBadge({ ingStatus }) {
  if (!ingStatus) return null
  const { available=[], low_qty=[], missing=[] } = ingStatus
  return (
    <div className="space-y-2 mt-3">
      {available.length>0&&(
        <div>
          <p className="text-xs font-black uppercase tracking-wider mb-1.5" style={{color:"#4ade80"}}>✓ Have it</p>
          <div className="flex flex-wrap gap-1.5">
            {available.map((item,i)=>(
              <span key={i} className="pill-ok text-xs px-2.5 py-1 rounded-full font-medium">
                {item.name}{item.quantity&&` (${item.quantity})`}
              </span>
            ))}
          </div>
        </div>
      )}
      {low_qty.length>0&&(
        <div>
          <p className="text-xs font-black uppercase tracking-wider mb-1.5" style={{color:"#d97706"}}>⚠ Low qty</p>
          {low_qty.map((item,i)=>(
            <div key={i} className="flex items-center gap-2 py-1 text-sm">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:"#d97706"}}/>
              <span style={{color:"var(--text-primary)"}}>{item.name}</span>
              <span className="text-xs" style={{color:"var(--text-faint)"}}>have {item.have}, need {item.need}</span>
            </div>
          ))}
        </div>
      )}
      {missing.length>0&&(
        <div>
          <p className="text-xs font-black uppercase tracking-wider mb-1.5" style={{color:"#f87171"}}>✗ Need to buy</p>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((item,i)=>(
              <span key={i} className="pill-bad text-xs px-2.5 py-1 rounded-full font-medium">
                {item.name}{item.quantity&&` (${item.quantity})`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Suggestion Card ───────────────────────────────────────────────────────────
function SuggestionCard({ suggestion, onCook, loading }) {
  const diff = DIFF_COLOR[suggestion.difficulty] || DIFF_COLOR.beginner
  const allCookable = suggestion.missing_count === 0

  return (
    <div
      className="dk-card p-4 hover-lift transition-all"
      style={{
        borderColor: allCookable ? "rgba(74,222,128,0.2)" : "var(--card-border)",
        cursor:"default",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black truncate" style={{color:"var(--text-primary)"}}>{suggestion.name}</p>
          <p className="text-xs mt-0.5" style={{color:"var(--orange)"}}>{suggestion.cuisine}</p>
        </div>
        {allCookable && (
          <span style={{
            fontSize:"0.65rem", fontWeight:800, color:"#4ade80",
            background:"rgba(74,222,128,0.12)", padding:"0.2rem 0.5rem",
            borderRadius:"99px", whiteSpace:"nowrap", flexShrink:0,
          }}>✓ Ready</span>
        )}
        {suggestion.missing_count > 0 && (
          <span style={{
            fontSize:"0.65rem", fontWeight:800, color:"#fbbf24",
            background:"rgba(251,191,36,0.12)", padding:"0.2rem 0.5rem",
            borderRadius:"99px", whiteSpace:"nowrap", flexShrink:0,
          }}>+{suggestion.missing_count} needed</span>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {suggestion.cook_time_minutes && (
          <span className="text-xs" style={{color:"var(--text-faint)"}}>⏱ {suggestion.cook_time_minutes}m</span>
        )}
        {suggestion.meal_type && (
          <span className="text-xs" style={{color:"var(--text-faint)"}}>
            {suggestion.meal_type.charAt(0).toUpperCase()+suggestion.meal_type.slice(1)}
          </span>
        )}
        <span style={{
          fontSize:"0.65rem", fontWeight:700, borderRadius:"99px",
          padding:"0.15rem 0.5rem",
          background: diff.bg, color: diff.color,
        }}>
          {suggestion.difficulty}
        </span>
      </div>

      {/* Key ingredients */}
      {suggestion.key_ingredients?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {suggestion.key_ingredients.slice(0,5).map((ing,i)=>(
            <span key={i} style={{
              fontSize:"0.65rem", fontWeight:600,
              background:"var(--input-bg)", border:"1px solid var(--card-border)",
              color:"var(--text-faint)", borderRadius:"99px", padding:"0.1rem 0.45rem",
            }}>{ing}</span>
          ))}
        </div>
      )}

      {/* Reason */}
      {suggestion.reason && (
        <p className="text-xs mb-3" style={{color:"var(--text-faint)", fontStyle:"italic"}}>
          {suggestion.reason}
        </p>
      )}

      {/* Cook button */}
      <button
        onClick={() => onCook(suggestion.name)}
        disabled={loading}
        className="btn-orange w-full justify-center"
        style={{width:"100%", padding:"0.5rem", borderRadius:"0.625rem", fontSize:"0.8rem"}}
      >
        {loading ? <><Spinner size={3}/> Loading…</> : "🍳 Cook this"}
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function RecipeBuilder({ ingredients, API, onGoToPantry, user, onRecipeGenerated, loadRecipeId, onLoadRecipeDone }) {
  const [searchTerm, setSearchTerm]   = useState("")
  const [searchBusy, setSearchBusy]   = useState(false)
  const [filters, setFilters]         = useState(EMPTY_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [genBusy, setGenBusy]         = useState(false)
  const [agentMsg, setAgentMsg]       = useState("")

  // Suggestions state
  const [suggestions, setSuggestions]         = useState([])
  const [sugLoading, setSugLoading]           = useState(false)
  const [sugError, setSugError]               = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [cookingId, setCookingId]             = useState(null) // which suggestion is being cooked
  const [shownSuggestions, setShownSuggestions] = useState([])

  const [recipe, setRecipe]               = useState(null)
  const [recipeId, setRecipeId]           = useState(null)
  const [recipeMode, setRecipeMode]       = useState(null)
  const [ingStatus, setIngStatus]         = useState(null)
  const [shoppingList, setShoppingList]   = useState([])
  const [variationsHighlighted, setVariationsHighlighted] = useState(false)
  const variationsRef = useRef()
  const [shopCopied, setShopCopied]   = useState(false)
  const [validResult, setValidResult] = useState(null)

  // Dish image scan state
  const [dishScanBusy, setDishScanBusy]     = useState(false)
  const [dishScanResult, setDishScanResult] = useState(null)  // {name, confidence, alternatives, cuisine, description}
  const [dishConfirmName, setDishConfirmName] = useState("")   // editable confirmed name
  const dishImgRef = useRef()

  const [sessionId]                   = useState(genId)
  const [history, setHistory]         = useState([])
  const [histIdx, setHistIdx]         = useState(-1)
  const [alreadyShown, setAlreadyShown] = useState([])

  const [isFav, setIsFav]             = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [fbRating, setFbRating]       = useState("")
  const [fbNotes, setFbNotes]         = useState("")
  const [fbDone, setFbDone]           = useState(false)

  const [chatMsgs, setChatMsgs]       = useState([])
  const [chatInput, setChatInput]     = useState("")
  const [chatBusy, setChatBusy]       = useState(false)
  const chatEndRef = useRef()

  const [showURF, setShowURF]         = useState(false)
  const [urf, setUrf]                 = useState({name:"",cuisine:"",ingredients:"",steps:""})
  const [urfBusy, setUrfBusy]         = useState(false)
  const [error, setError]             = useState(null)
  const [toast, setToast]             = useState(null)
  const recipeRef = useRef()

  const flash = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:"smooth"}) },[chatMsgs])
  useEffect(()=>{ setChatMsgs([]); setFbDone(false); setShowFeedback(false); setFbRating(""); setFbNotes(""); setValidResult(null) },[recipeId])

  const applyRecipe = (data, id, mode, ingStatusObj=null, shopList=[]) => {
    setRecipe(data.recipe_json||data)
    setRecipeId(id); setRecipeMode(mode)
    setIngStatus(ingStatusObj); setShoppingList(shopList)
    setIsFav(data.is_favourite||false); setError(null)
    setShowSuggestions(false) // hide suggestions when recipe loads
    setTimeout(()=>recipeRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),150)
  }

  // Load recipe from history when triggered via sidebar
  useEffect(() => {
    if (!loadRecipeId) return
    api.get(`/recipe/${loadRecipeId}`)
      .then(res => {
        const data = res.data
        const recipeData = typeof data.recipe_json === "string"
          ? JSON.parse(data.recipe_json)
          : data.recipe_json
        applyRecipe(recipeData, data.id, data.mode || "pantry")
      })
      .catch(() => flash("Could not load recipe", "err"))
      .finally(() => onLoadRecipeDone?.())
  }, [loadRecipeId])

  // Agent status ticker
  const AGENT_MSGS = [
    "Surveying your pantry…",
    "Checking ingredient availability…",
    "Verifying quantities…",
    "Crafting your recipe…",
    "Almost ready…",
  ]
  useEffect(()=>{
    if (!genBusy) { setAgentMsg(""); return }
    let i=0; setAgentMsg(AGENT_MSGS[0])
    const t = setInterval(()=>{ i=(i+1)%AGENT_MSGS.length; setAgentMsg(AGENT_MSGS[i]) },2200)
    return ()=>clearInterval(t)
  },[genBusy])

  // ── Suggestions ───────────────────────────────────────────────────────────
  const handleGetSuggestions = async () => {
    if (!ingredients.length) { setError("Your pantry is empty. Add ingredients first."); return }
    setSugLoading(true); setSugError(""); setError(null)
    try {
      const res = await api.post("/recipe/suggestions", {
        filters: { ...filters },
        already_shown: shownSuggestions,
      })
      const list = res.data.suggestions || []
      setSuggestions(list)
      setShownSuggestions(prev => [...prev, ...list.map(s => s.name)])
      setShowSuggestions(true)
    } catch(e) {
      setSugError("Could not load suggestions. Try again.")
    } finally {
      setSugLoading(false)
    }
  }

  const handleCookSuggestion = async (dishName) => {
    setCookingId(dishName)
    setSearchBusy(true); setError(null)
    try {
      const res = await api.post("/recipe/search", { dish_name: dishName })
      applyRecipe(res.data, res.data.id, "direct", res.data.ingredient_status, res.data.shopping_list||[])
      setHistory([]); setHistIdx(-1); setAlreadyShown([])
    } catch(e) { setError("Could not load recipe: "+(e.response?.data?.detail||e.message)) }
    finally { setSearchBusy(false); setCookingId(null) }
  }

  const handleRefreshSuggestions = () => {
    setSuggestions([])
    handleGetSuggestions()
  }

  // ── Dish image scan ───────────────────────────────────────────────────────
  const handleDishScan = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setDishScanBusy(true); setDishScanResult(null); setError(null)
    try {
      // Compress before upload
      const compressed = await new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
          const MAX = 1024
          const scale = Math.min(MAX / img.width, MAX / img.height, 1)
          const canvas = document.createElement("canvas")
          canvas.width  = Math.round(img.width  * scale)
          canvas.height = Math.round(img.height * scale)
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url)
          canvas.toBlob(b => b ? resolve(b) : reject("Compression failed"), "image/jpeg", 0.85)
        }
        img.onerror = reject
        img.src = url
      })
      const fd = new FormData(); fd.append("file", compressed, "dish.jpg")
      const res = await api.post("/recipe/identify-dish", fd)
      if (!res.data.name) { flash("Could not identify dish — try a clearer photo", "err"); return }
      setDishScanResult(res.data)
      setDishConfirmName(res.data.name)
    } catch(e) { flash("Scan failed: "+(e.response?.data?.detail||e.message), "err") }
    finally { setDishScanBusy(false); if(dishImgRef.current) dishImgRef.current.value="" }
  }

  const handleConfirmDish = () => {
    if (!dishConfirmName.trim()) return
    setSearchTerm(dishConfirmName.trim())
    setDishScanResult(null)
    // Trigger search with confirmed name directly
    setSearchBusy(true); setError(null)
    api.post("/recipe/search", { dish_name: dishConfirmName.trim() })
      .then(res => {
        applyRecipe(res.data, res.data.id, "direct", res.data.ingredient_status, res.data.shopping_list||[])
        setHistory([]); setHistIdx(-1); setAlreadyShown([])
      })
      .catch(e => setError("Search failed: "+(e.response?.data?.detail||e.message)))
      .finally(() => setSearchBusy(false))
  }

  // ── Mode B ────────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    const term=searchTerm.trim(); if(!term) return
    setSearchBusy(true); setError(null)
    try {
      const res = await api.post(`/recipe/search`,{dish_name:term})
      applyRecipe(res.data, res.data.id, "direct", res.data.ingredient_status, res.data.shopping_list||[])
      setHistory([]); setHistIdx(-1); setAlreadyShown([])
    } catch(e) { setError("Search failed: "+(e.response?.data?.detail||e.message)) }
    finally { setSearchBusy(false) }
  }

  // ── Mode A ────────────────────────────────────────────────────────────────
  const callGenerate = async () => {
    if (!ingredients.length) { setError("Your pantry is empty. Add ingredients first."); return }
    setGenBusy(true); setError(null); setSearchTerm("")
    try {
      const res = await api.post(`/recipe/generate`,{
        filters:{...filters}, already_shown:alreadyShown, session_id:sessionId,
      })
      if (res.data.error) {
        setError(res.data.message||"Could not generate a recipe. Try different filters or add more ingredients.")
        return
      }
      const newId   = res.data.id
      const newName = (res.data.recipe_json||{}).name||res.data.name||"Recipe"
      const newHistory = [...history.slice(0,histIdx+1),{id:newId,name:newName}]
      setHistory(newHistory); setHistIdx(newHistory.length-1)
      setAlreadyShown(p=>[...p,newName])
      applyRecipe(res.data, newId, "pantry")
      onRecipeGenerated?.()
    } catch(e) { setError("Generation failed: "+(e.response?.data?.detail||e.message)) }
    finally { setGenBusy(false) }
  }

  const handlePrev = async () => {
    if (histIdx<=0) return
    try {
      const res = await api.get(`/recipe/${history[histIdx-1].id}`)
      setHistIdx(histIdx-1); applyRecipe(res.data, history[histIdx-1].id, "pantry")
    } catch { flash("Could not load previous recipe","err") }
  }

  const validateRecipe = async () => {
    if (!recipeId) return
    try {
      const res = await api.get(`/recipe/${recipeId}/validate`)
      setValidResult(res.data); flash("Checked against current pantry")
    } catch { flash("Validation failed","err") }
  }

  const toggleFav = async () => {
    if (!recipeId) return
    try {
      const res = await api.post(`/recipe/${recipeId}/favourite`)
      setIsFav(res.data.is_favourite)
      flash(res.data.is_favourite?"Saved to favourites!":"Removed from favourites")
    } catch { flash("Failed","err") }
  }

  const submitFeedback = async () => {
    if (!fbRating) { flash("Select a rating first","err"); return }
    try {
      await api.post(`/recipe/${recipeId}/feedback`,{rating:fbRating,notes:fbNotes})
      setFbDone(true); setShowFeedback(false); flash("Thanks for your feedback!")
    } catch { flash("Failed to save","err") }
  }

  const shareRecipe = () => {
    if (!recipe) return
    const ings=(recipe.ingredients_used||recipe.ingredients||[]).map(i=>`• ${i.name}${i.quantity?" — "+i.quantity:""}`).join("\n")
    const steps=(recipe.steps||[]).map((s,i)=>`${i+1}. ${s}`).join("\n")
    navigator.clipboard?.writeText(`🍳 *${recipe.name}* — PantryChef\n\nIngredients:\n${ings}\n\nMethod:\n${steps}`)
      .then(()=>flash("Copied for WhatsApp!")).catch(()=>flash("Copy not supported","err"))
  }

  const showVariations = () => {
    if (!recipe?.variations?.length) {
      recipeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      flash("No variations available for this recipe. Try searching the dish directly.")
      return
    }
    variationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    setVariationsHighlighted(true)
    setTimeout(()=>setVariationsHighlighted(false), 2000)
  }

  const submitUrf = async () => {
    if (!urf.name.trim()||!urf.ingredients.trim()||!urf.steps.trim()) {
      flash("Fill in at least name, ingredients and steps","err"); return
    }
    setUrfBusy(true)
    try {
      await api.post("/user-recipe", urf)
      setShowURF(false); setUrf({name:"",cuisine:"",ingredients:"",steps:""})
      flash("Recipe submitted!")
    } catch { flash("Failed to save","err") }
    finally { setUrfBusy(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-2xl border ${
          toast.type==="err" ? "bg-red-950 border-red-700 text-red-300" : "bg-emerald-950 border-emerald-700 text-emerald-300"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ═══ LEFT COLUMN — search + filters + cook ═══ */}
        <div className="w-full lg:w-96 flex-shrink-0 space-y-4">

          {/* ── Mode B: Recipe search ── */}
          <div className="dk-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔍</span>
              <div>
                <h3 className="text-sm font-black" style={{color:"var(--text-primary)"}}>Search a recipe</h3>
                <p className="text-xs" style={{color:"var(--text-faint)"}}>Full recipe + what you have vs need</p>
              </div>
            </div>

            {/* Text search row */}
            <div className="flex gap-2 mb-3">
              <input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleSearch()}
                placeholder="Idli, Biryani, Pasta…"
                className="dk-input flex-1"/>
              <button onClick={handleSearch} disabled={searchBusy||!searchTerm.trim()}
                className="btn-orange flex-shrink-0"
                style={{borderRadius:"0.625rem",padding:"0.5rem 1rem"}}>
                {searchBusy ? <Spinner size={4}/> : "Go"}
              </button>
            </div>

            {/* Image scan row */}
            <input ref={dishImgRef} type="file" accept="image/*" className="hidden" onChange={handleDishScan}/>
            <button
              onClick={()=>dishImgRef.current.click()}
              disabled={dishScanBusy || searchBusy}
              className="w-full btn-ghost text-xs"
              style={{padding:"0.5rem", borderRadius:"0.625rem", display:"flex", alignItems:"center", justifyContent:"center", gap:"0.4rem"}}
            >
              {dishScanBusy
                ? <><Spinner size={3}/> Identifying dish…</>
                : <><span>📷</span> Scan a dish photo</>
              }
            </button>

            {/* Dish confirmation card */}
            {dishScanResult && (
              <div className="mt-3 p-4 rounded-xl" style={{background:"var(--input-bg)", border:"1px solid var(--card-border)"}}>
                <p className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--orange)"}}>
                  📷 Dish identified
                </p>

                {/* Confidence badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span style={{
                    fontSize:"0.65rem", fontWeight:700, borderRadius:"99px", padding:"0.15rem 0.5rem",
                    background: dishScanResult.confidence==="high" ? "rgba(74,222,128,0.15)" : "rgba(251,191,36,0.15)",
                    color: dishScanResult.confidence==="high" ? "#4ade80" : "#fbbf24",
                  }}>
                    {dishScanResult.confidence} confidence
                  </span>
                  {dishScanResult.cuisine && (
                    <span className="text-xs" style={{color:"var(--text-faint)"}}>{dishScanResult.cuisine}</span>
                  )}
                </div>

                {/* Editable dish name */}
                <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-muted)"}}>
                  Is this correct? Edit if needed:
                </label>
                <input
                  value={dishConfirmName}
                  onChange={e=>setDishConfirmName(e.target.value)}
                  className="dk-input mb-2 font-semibold"
                  style={{color:"var(--text-primary)"}}
                />

                {/* Description */}
                {dishScanResult.description && (
                  <p className="text-xs mb-3" style={{color:"var(--text-faint)", fontStyle:"italic"}}>
                    {dishScanResult.description}
                  </p>
                )}

                {/* Alternatives */}
                {dishScanResult.alternatives?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs mb-1.5" style={{color:"var(--text-faint)"}}>Or pick an alternative:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {dishScanResult.alternatives.map((alt, i) => (
                        <button
                          key={i}
                          onClick={()=>setDishConfirmName(alt)}
                          style={{
                            fontSize:"0.72rem", fontWeight:600, borderRadius:"99px",
                            padding:"0.2rem 0.65rem", cursor:"pointer",
                            background: dishConfirmName===alt ? "rgba(249,115,22,0.15)" : "var(--card-bg)",
                            border: `1px solid ${dishConfirmName===alt ? "var(--orange)" : "var(--card-border)"}`,
                            color: dishConfirmName===alt ? "var(--orange)" : "var(--text-muted)",
                          }}
                        >
                          {alt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmDish}
                    disabled={!dishConfirmName.trim() || searchBusy}
                    className="btn-orange flex-1 justify-center"
                    style={{padding:"0.5rem", fontSize:"0.8rem"}}
                  >
                    {searchBusy ? <><Spinner size={3}/> Finding…</> : "✓ Yes, find this recipe"}
                  </button>
                  <button
                    onClick={()=>setDishScanResult(null)}
                    className="btn-ghost"
                    style={{padding:"0.5rem 0.75rem", fontSize:"0.8rem"}}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Divider ── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{background:"var(--card-border)"}}/>
            <span className="text-xs font-bold" style={{color:"var(--text-faint)"}}>OR</span>
            <div className="flex-1 h-px" style={{background:"var(--card-border)"}}/>
          </div>

          {/* ── Mode A: Filters + Cook + Suggestions ── */}
          <div className="dk-card overflow-hidden">
            {/* Cook banner */}
            <div className="bg-cook-banner px-5 py-5" style={{minHeight:80}}>
              <h3 className="text-sm font-black" style={{color:"var(--text-primary)"}}>Cook from your pantry</h3>
              <p className="text-xs mt-0.5" style={{color:"var(--text-muted)"}}>
                Get suggestions or let the AI agent pick for you
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Filters toggle */}
              <button onClick={()=>setShowFilters(v=>!v)}
                className="w-full flex items-center justify-between text-sm font-semibold transition-colors"
                style={{color:"var(--text-muted)"}}>
                <span>⚙ Filters {Object.values(filters).some(v=>Array.isArray(v)?v.length>0:(v!==0&&v!==""))?"(active)":""}</span>
                <span style={{color:"var(--orange)"}}>{showFilters?"▲ Hide":"▼ Show"}</span>
              </button>

              {showFilters && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <FilterSel label="Cuisine"      value={filters.cuisine}         onChange={v=>setFilters(f=>({...f,cuisine:v}))}         options={CUISINES}/>
                    <FilterSel label="Meal type"    value={filters.meal_type}       onChange={v=>setFilters(f=>({...f,meal_type:v}))}       options={MEAL_TYPES}/>
                    <FilterSel label="Cook time"    value={filters.cook_time}       onChange={v=>setFilters(f=>({...f,cook_time:v}))}       options={COOK_TIMES}/>
                    <FilterSel label="Diet"         value={filters.diet_type}       onChange={v=>setFilters(f=>({...f,diet_type:v}))}       options={DIETS}/>
                    <FilterSel label="Method"       value={filters.cook_method}     onChange={v=>setFilters(f=>({...f,cook_method:v}))}     options={METHODS}/>
                    <FilterSel label="Skill"        value={filters.skill_level}     onChange={v=>setFilters(f=>({...f,skill_level:v}))}     options={SKILLS}/>
                    <FilterSel label="Detail"       value={filters.detail_level}    onChange={v=>setFilters(f=>({...f,detail_level:v}))}    options={DETAILS}/>
                    <FilterSel label="Diet pref"    value={filters.diet_preference} onChange={v=>setFilters(f=>({...f,diet_preference:v}))} options={DIET_PREFS}/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-faint)"}}>Servings</label>
                    <input type="number" min="1" max="10" value={filters.servings}
                      onChange={e=>setFilters(f=>({...f,servings:parseInt(e.target.value)||2}))}
                      className="dk-input" style={{width:"5rem"}}/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{color:"var(--text-faint)"}}>Avoid allergens</label>
                    <div className="flex flex-wrap gap-2">
                      {ALLERGENS.map(a=>{
                        const active = filters.allergies.includes(a)
                        return (
                          <label key={a} className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input type="checkbox" checked={active}
                              onChange={e=>setFilters(f=>({...f,allergies:e.target.checked?[...f.allergies,a]:f.allergies.filter(x=>x!==a)}))}
                              className="accent-orange-500 w-3.5 h-3.5"/>
                            <span className="text-xs font-medium capitalize" style={{color:"var(--text-muted)"}}>{a}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <button onClick={()=>setFilters(EMPTY_FILTERS)}
                    className="text-xs" style={{color:"var(--text-faint)"}}>↩ Reset filters</button>
                </div>
              )}

              {ingredients.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm font-semibold mb-1" style={{color:"var(--text-primary)"}}>Pantry is empty</p>
                  <p className="text-xs mb-3" style={{color:"var(--text-muted)"}}>Add ingredients first</p>
                  <button onClick={onGoToPantry} className="btn-orange" style={{width:"100%",justifyContent:"center"}}>
                    Go to My Pantry →
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Get / Show / Refresh Suggestions button */}
                  <button
                    onClick={
                      sugLoading ? undefined
                      : showSuggestions ? handleRefreshSuggestions
                      : suggestions.length > 0 ? () => setShowSuggestions(true)  // just reveal, no re-fetch
                      : handleGetSuggestions
                    }
                    disabled={sugLoading || genBusy}
                    className="w-full justify-center"
                    style={{
                      width:"100%", borderRadius:"0.875rem", padding:"0.875rem",
                      background:"var(--input-bg)",
                      border:"1px solid var(--card-border)",
                      color:"var(--text-primary)", fontWeight:800, fontSize:"0.9rem",
                      cursor: sugLoading||genBusy ? "not-allowed" : "pointer",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:"0.5rem",
                      transition:"all 0.15s",
                    }}
                    onMouseEnter={e=>{if(!sugLoading&&!genBusy){e.currentTarget.style.borderColor="var(--orange)";e.currentTarget.style.color="var(--orange)"}}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--card-border)";e.currentTarget.style.color="var(--text-primary)"}}
                  >
                    {sugLoading
                      ? <><Spinner size={4}/><span className="text-sm">Finding recipes…</span></>
                      : showSuggestions
                        ? <><span>🔄</span> Refresh suggestions</>
                        : suggestions.length > 0
                          ? <><span>💡</span> Show {suggestions.length} suggestions</>
                          : <><span>💡</span> Get suggestions ({ingredients.length} ingredients)</>
                    }
                  </button>

                  {/* Generate now button */}
                  <button onClick={callGenerate} disabled={genBusy || sugLoading}
                    className="btn-orange w-full justify-center py-4 text-base font-black"
                    style={{width:"100%",borderRadius:"0.875rem",padding:"0.875rem"}}>
                    {genBusy
                      ? <><Spinner size={5}/><span className="text-sm font-semibold">{agentMsg}</span></>
                      : <><span className="text-xl">🍳</span> Surprise me</>
                    }
                  </button>
                </div>
              )}

              <p className="text-xs text-center" style={{color:"var(--text-faint)"}}>
                {genBusy
                  ? <span style={{color:"var(--orange)"}} className="font-semibold animate-pulse">Checking {ingredients.length} ingredients…</span>
                  : sugLoading
                    ? <span style={{color:"var(--orange)"}} className="font-semibold animate-pulse">Scanning your pantry…</span>
                    : `${ingredients.length} ingredient${ingredients.length!==1?"s":""} available`}
              </p>

              {/* Suggestions error */}
              {sugError && (
                <div className="rounded-xl px-4 py-3 text-xs font-medium" style={{background:"#2e0d0d",color:"#fca5a5",border:"1px solid #7c2020"}}>
                  {sugError}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-xl px-4 py-3 text-xs font-medium" style={{background:"#2e0d0d",color:"#fca5a5",border:"1px solid #7c2020"}}>
                  {error}
                  {error.includes("pantry")&&<button onClick={onGoToPantry} className="underline ml-2">Add ingredients →</button>}
                </div>
              )}
            </div>
          </div>

          {/* Session nav */}
          {recipeMode==="pantry" && history.length>0 && (
            <div className="dk-card px-5 py-3 flex items-center justify-between">
              <button onClick={handlePrev} disabled={histIdx<=0}
                className="text-sm font-bold transition-colors"
                style={{color:histIdx<=0?"var(--text-faint)":"var(--text-muted)",cursor:histIdx<=0?"not-allowed":"pointer"}}>
                ← Prev
              </button>
              <span className="text-xs" style={{color:"var(--text-faint)"}}>
                {histIdx+1} / {history.length}
              </span>
              <button onClick={callGenerate} disabled={genBusy}
                className="text-sm font-bold transition-colors"
                style={{color:genBusy?"var(--text-faint)":"var(--orange)"}}>
                Next →
              </button>
            </div>
          )}

          {/* User Recipe Form */}
          <div className="dk-card overflow-hidden">
            <button onClick={()=>setShowURF(v=>!v)}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold"
              style={{color:"var(--text-muted)"}}>
              <span>📝 Add your own recipe</span>
              <span style={{color:"var(--orange)"}}>{showURF?"▲":"▼"}</span>
            </button>
            {showURF && (
              <div className="px-5 pb-5 space-y-3">
                <input value={urf.name} onChange={e=>setUrf(f=>({...f,name:e.target.value}))}
                  placeholder="Recipe name" className="dk-input"/>
                <input value={urf.cuisine} onChange={e=>setUrf(f=>({...f,cuisine:e.target.value}))}
                  placeholder="Cuisine (optional)" className="dk-input"/>
                <textarea value={urf.ingredients} onChange={e=>setUrf(f=>({...f,ingredients:e.target.value}))}
                  placeholder="Ingredients (one per line)" rows={4} className="dk-input"/>
                <textarea value={urf.steps} onChange={e=>setUrf(f=>({...f,steps:e.target.value}))}
                  placeholder="Steps (one per line)" rows={4} className="dk-input"/>
                <button onClick={submitUrf} disabled={urfBusy} className="btn-orange">
                  {urfBusy?"Saving…":"Submit recipe"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT COLUMN — recipe display ═══ */}
        <div className="flex-1 min-w-0">
          {/* ── Suggestions — shown in main area above recipe ── */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-black" style={{color:"var(--text-primary)"}}>
                    💡 Recipe ideas from your pantry
                  </p>
                  <p className="text-xs mt-0.5" style={{color:"var(--text-faint)"}}>
                    Click any recipe to get the full instructions
                  </p>
                </div>
                <button
                  onClick={()=>setShowSuggestions(false)}
                  style={{
                    color:"var(--text-faint)", background:"var(--input-bg)",
                    border:"1px solid var(--card-border)", borderRadius:"99px",
                    padding:"0.25rem 0.75rem", fontSize:"0.75rem", cursor:"pointer", fontWeight:600,
                  }}
                >
                  Hide
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {suggestions.map((sug, i) => (
                  <SuggestionCard
                    key={i}
                    suggestion={sug}
                    onCook={handleCookSuggestion}
                    loading={cookingId === sug.name && searchBusy}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Unhide bar — shown when suggestions exist but are hidden */}
          {!showSuggestions && suggestions.length > 0 && (
            <div className="mb-4 flex items-center justify-between px-4 py-2.5 rounded-xl"
              style={{background:"var(--input-bg)", border:"1px solid var(--card-border)"}}>
              <p className="text-xs font-semibold" style={{color:"var(--text-faint)"}}>
                💡 {suggestions.length} recipe suggestions hidden
              </p>
              <button
                onClick={()=>setShowSuggestions(true)}
                style={{
                  color:"var(--orange)", background:"none", border:"none",
                  fontSize:"0.75rem", cursor:"pointer", fontWeight:700,
                }}
              >
                Show ↓
              </button>
            </div>
          )}

          {/* ── Empty state / Recipe ── */}
          {!recipe ? (
            <div className="dk-card text-center py-20">
              <div className="text-6xl mb-4">🍽</div>
              <p className="font-bold text-xl mb-2" style={{color:"var(--text-primary)"}}>
                What are we cooking today?
              </p>
              <p className="text-sm" style={{color:"var(--text-muted)"}}>
                Get suggestions or search for a dish to get started
              </p>
            </div>
          ) : (
            <div ref={recipeRef}>
              <div
                className="dk-card overflow-hidden"
                style={{background: MEAL_BG[recipe.meal_type?.toLowerCase()] || "var(--card-bg)"}}
              >
                {/* Recipe header */}
                <div className="px-6 py-6">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-2xl font-black mb-1" style={{color:"var(--text-primary)"}}>{recipe.name}</h2>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {recipe.cuisine&&<span style={{color:"var(--orange)",fontWeight:700}}>{recipe.cuisine}</span>}
                        {recipe.cook_time_minutes&&<span style={{color:"var(--text-faint)"}}>⏱ {recipe.cook_time_minutes} min</span>}
                        {recipe.servings&&<span style={{color:"var(--text-faint)"}}>👥 {recipe.servings}</span>}
                        {recipe.difficulty&&(
                          <span style={{
                            ...DIFF_COLOR[recipe.difficulty],
                            padding:"0.15rem 0.5rem", borderRadius:"99px", fontWeight:700
                          }}>{recipe.difficulty}</span>
                        )}
                        {recipe.calorie_estimate&&<span style={{color:"var(--text-faint)"}}>🔥 {recipe.calorie_estimate}</span>}
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={toggleFav} title={isFav?"Remove fav":"Save fav"}
                        style={{fontSize:"1.4rem",background:"none",border:"none",cursor:"pointer",filter:isFav?"none":"grayscale(1)",opacity:isFav?1:0.5}}>
                        ❤️
                      </button>
                      <button onClick={shareRecipe} className="btn-ghost" style={{padding:"0.4rem 0.75rem",fontSize:"0.75rem"}}>
                        Share
                      </button>
                    </div>
                  </div>

                  {/* Ingredient status (Mode A only) */}
                  {recipeMode==="pantry" && ingStatus && <IngStatusBadge ingStatus={ingStatus}/>}

                  {/* Shopping list (Mode B only) */}
                  {recipeMode==="direct" && shoppingList?.length>0&&(
                    <div className="mt-3 p-3 rounded-xl" style={{background:"rgba(0,0,0,0.2)"}}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-black uppercase tracking-wider" style={{color:"#fbbf24"}}>🛒 Shopping list</p>
                        <button onClick={()=>{
                          navigator.clipboard?.writeText(shoppingList.map(i=>`• ${i.name}${i.quantity?" ("+i.quantity+")":""}`).join("\n"))
                            .then(()=>{setShopCopied(true);setTimeout(()=>setShopCopied(false),2000)})
                        }} className="text-xs" style={{color:"var(--text-faint)"}}>
                          {shopCopied?"✓ Copied":"Copy"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {shoppingList.map((item,i)=>(
                          <span key={i} className="pill-bad text-xs px-2.5 py-1 rounded-full font-medium">
                            {item.name}{item.quantity&&` (${item.quantity})`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Ingredients */}
                <div className="px-6 pb-4">
                  <h3 className="text-xs font-black uppercase tracking-widest mb-3" style={{color:"var(--text-faint)"}}>
                    Ingredients
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {(recipe.ingredients_used||recipe.ingredients||[]).map((ing,i)=>(
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:"var(--orange)"}}/>
                        <span style={{color:"var(--text-primary)",fontWeight:500}}>{ing.name}</span>
                        {(ing.quantity||ing.is_optional)&&(
                          <span className="text-xs ml-auto" style={{color:"var(--text-faint)"}}>
                            {ing.quantity}{ing.is_optional?" (opt)":""}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Steps */}
                <div className="px-6 pb-4">
                  <h3 className="text-xs font-black uppercase tracking-widest mb-3" style={{color:"var(--text-faint)"}}>
                    Method
                  </h3>
                  <ol className="space-y-3">
                    {(recipe.steps||[]).map((step,i)=>(
                      <li key={i} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full text-xs font-black flex items-center justify-center"
                          style={{background:"var(--orange)",color:"#fff"}}>{i+1}</span>
                        <p className="text-sm leading-relaxed pt-0.5" style={{color:"var(--text-primary)"}}>{step}</p>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Tips + serving */}
                {(recipe.cooking_tips?.length>0||recipe.serving_suggestion)&&(
                  <div className="px-6 pb-4 space-y-3">
                    {recipe.cooking_tips?.length>0&&(
                      <div className="p-3 rounded-xl" style={{background:"rgba(249,115,22,0.08)"}}>
                        <p className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--orange)"}}>💡 Tips</p>
                        {recipe.cooking_tips.map((t,i)=><p key={i} className="text-xs" style={{color:"var(--text-muted)"}}>{t}</p>)}
                      </div>
                    )}
                    {recipe.serving_suggestion&&(
                      <p className="text-xs italic" style={{color:"var(--text-faint)"}}>🍽 {recipe.serving_suggestion}</p>
                    )}
                  </div>
                )}

                {/* Variations */}
                {recipe.variations?.length>0&&(
                  <div ref={variationsRef} className="px-6 pb-4">
                    <p className={`text-xs font-black uppercase tracking-wider mb-2 transition-colors ${variationsHighlighted?"text-orange-400":""}`}
                      style={{color:variationsHighlighted?"var(--orange)":"var(--text-faint)"}}>
                      ✨ Variations
                    </p>
                    <div className="space-y-1">
                      {recipe.variations.map((v,i)=>(
                        <p key={i} className="text-xs" style={{color:"var(--text-muted)"}}>{v}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Health warnings */}
                {recipe.health_warnings?.length>0&&(
                  <div className="px-6 pb-4">
                    <div className="p-3 rounded-xl" style={{background:"rgba(248,113,113,0.08)"}}>
                      <p className="text-xs font-black uppercase tracking-wider mb-1" style={{color:"#f87171"}}>⚠ Health notes</p>
                      {recipe.health_warnings.map((w,i)=><p key={i} className="text-xs" style={{color:"#fca5a5"}}>{w}</p>)}
                    </div>
                  </div>
                )}

                {/* Action toolbar */}
                <div className="px-6 pb-6 flex flex-wrap gap-2">
                  <button onClick={validateRecipe} className="btn-ghost text-xs" style={{padding:"0.4rem 0.75rem"}}>
                    ✓ Check pantry
                  </button>
                  <button onClick={showVariations} className="btn-ghost text-xs" style={{padding:"0.4rem 0.75rem"}}>
                    ✨ Variations
                  </button>
                  {!showFeedback&&!fbDone&&(
                    <button onClick={()=>setShowFeedback(true)} className="btn-ghost text-xs" style={{padding:"0.4rem 0.75rem"}}>
                      💬 Feedback
                    </button>
                  )}
                </div>

                {/* Validation result */}
                {validResult && (
                  <div className="mx-6 mb-4 p-3 rounded-xl text-xs" style={{background:"rgba(0,0,0,0.2)"}}>
                    <p className="font-bold mb-1" style={{color:validResult.fully_available?"#4ade80":"#fbbf24"}}>
                      {validResult.fully_available?"✓ All ingredients available":"⚠ Some items missing/low"}
                    </p>
                    {validResult.missing_now?.length>0&&(
                      <p style={{color:"#f87171"}}>Missing: {validResult.missing_now.join(", ")}</p>
                    )}
                  </div>
                )}

                {/* Feedback */}
                {showFeedback&&!fbDone&&(
                  <div className="mx-6 mb-6 p-4 rounded-xl" style={{background:"rgba(0,0,0,0.2)"}}>
                    <p className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--text-faint)"}}>Rate this recipe</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {FEEDBACK_OPTIONS.map(o=>(
                        <button key={o.val} onClick={()=>setFbRating(o.val)}
                          className="text-xs px-3 py-1.5 rounded-xl font-semibold transition-all"
                          style={{
                            background:fbRating===o.val?"rgba(249,115,22,0.2)":"var(--input-bg)",
                            border:`1px solid ${fbRating===o.val?"var(--orange)":"var(--card-border)"}`,
                            color:fbRating===o.val?"var(--orange)":"var(--text-muted)",
                          }}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <textarea value={fbNotes} onChange={e=>setFbNotes(e.target.value)}
                      placeholder="Notes (optional)…" rows={2} className="dk-input mb-3 text-xs"/>
                    <div className="flex gap-2">
                      <button onClick={submitFeedback} disabled={!fbRating} className="btn-orange text-xs" style={{padding:"0.4rem 0.875rem"}}>
                        Submit
                      </button>
                      <button onClick={()=>setShowFeedback(false)} className="btn-ghost text-xs" style={{padding:"0.4rem 0.875rem"}}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {fbDone&&<p className="px-6 pb-4 text-xs" style={{color:"#4ade80"}}>✓ Thanks for your feedback!</p>}
              </div>

              {/* Chat */}
              <div className="dk-card mt-4">
                <div className="px-5 py-4" style={{borderBottom:"1px solid var(--card-border)"}}>
                  <h3 className="text-sm font-black" style={{color:"var(--text-primary)"}}>💬 Cooking assistant</h3>
                  <p className="text-xs mt-0.5" style={{color:"var(--text-faint)"}}>Ask anything about this recipe</p>
                </div>
                <div className="px-5 py-4 space-y-3" style={{maxHeight:300,overflowY:"auto"}}>
                  {chatMsgs.length===0&&(
                    <p className="text-xs text-center" style={{color:"var(--text-faint)"}}>
                      e.g. "Can I substitute X?" or "How spicy will this be?"
                    </p>
                  )}
                  {chatMsgs.map((m,i)=>(
                    <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                      <div className="max-w-xs px-3 py-2 rounded-2xl text-xs leading-relaxed"
                        style={{
                          background:m.role==="user"?"var(--orange)":"var(--input-bg)",
                          color:m.role==="user"?"#fff":"var(--text-primary)",
                          borderRadius:m.role==="user"?"1rem 1rem 0.25rem 1rem":"1rem 1rem 1rem 0.25rem",
                        }}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatBusy&&(
                    <div className="flex justify-start">
                      <div className="px-3 py-2 rounded-2xl text-xs" style={{background:"var(--input-bg)",color:"var(--text-faint)"}}>
                        Thinking…
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef}/>
                </div>
                <div className="px-5 pb-4 flex gap-2">
                  <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
                    onKeyDown={e=>{
                      if(e.key==="Enter"&&chatInput.trim()&&!chatBusy){
                        const msg=chatInput.trim(); setChatInput(""); setChatBusy(true)
                        const newMsgs=[...chatMsgs,{role:"user",content:msg}]
                        setChatMsgs(newMsgs)
                        api.post(`/recipe/${recipeId}/chat`,{message:msg, chat_history:chatMsgs})
                          .then(r=>{setChatMsgs(m=>[...m,{role:"assistant",content:r.data.reply}])})
                          .catch(()=>{setChatMsgs(m=>[...m,{role:"assistant",content:"Sorry, couldn't respond."}])})
                          .finally(()=>setChatBusy(false))
                      }
                    }}
                    placeholder="Ask about this recipe…"
                    className="dk-input flex-1 text-xs"/>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}