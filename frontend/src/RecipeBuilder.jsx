import { useState, useEffect, useRef } from "react"
import axios from "axios"

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

const genId = () =>
  typeof crypto!=="undefined"&&crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)+Date.now().toString(36)

// ── Small helpers ─────────────────────────────────────────────────────────────

function Spinner({ size=4 }) {
  return (
    <svg className={`animate-spin h-${size} w-${size} flex-shrink-0`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

function FilterSel({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-faint)"}}>{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} className="dk-input">
        {options.map(o=><option key={o} value={o}>{o||"Any"}</option>)}
      </select>
    </div>
  )
}

function IngStatusList({ ingStatus }) {
  if (!ingStatus) return null
  return (
    <div className="space-y-3">
      {ingStatus.available?.length>0 && (
        <div>
          <p className="text-xs font-black uppercase tracking-wider mb-1.5" style={{color:"#4ade80"}}>✓ Available in pantry</p>
          <div className="flex flex-wrap gap-1.5">
            {ingStatus.available.map((n,i)=>(
              <span key={i} className="pill-ok text-xs px-2.5 py-1 rounded-full font-medium">{n}</span>
            ))}
          </div>
        </div>
      )}
      {ingStatus.low_qty?.length>0 && (
        <div>
          <p className="text-xs font-black uppercase tracking-wider mb-1.5" style={{color:"#fbbf24"}}>⚠ Low quantity</p>
          {ingStatus.low_qty.map((item,i)=>(
            <div key={i} className="flex items-center gap-2 py-1 text-sm">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:"#d97706"}}/>
              <span style={{color:"var(--text-primary)"}}>{item.name}</span>
              <span className="text-xs" style={{color:"var(--text-faint)"}}>have {item.have}, need {item.need}</span>
            </div>
          ))}
        </div>
      )}
      {ingStatus.missing?.length>0 && (
        <div>
          <p className="text-xs font-black uppercase tracking-wider mb-1.5" style={{color:"#f87171"}}>✗ Need to buy</p>
          <div className="flex flex-wrap gap-1.5">
            {ingStatus.missing.map((item,i)=>(
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

// ── Main ──────────────────────────────────────────────────────────────────────

export default function RecipeBuilder({ ingredients, API, onGoToPantry }) {
  const [searchTerm, setSearchTerm]   = useState("")
  const [searchBusy, setSearchBusy]   = useState(false)
  const [filters, setFilters]         = useState(EMPTY_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [genBusy, setGenBusy]         = useState(false)
  const [agentMsg, setAgentMsg]       = useState("")

  const [recipe, setRecipe]           = useState(null)
  const [recipeId, setRecipeId]       = useState(null)
  const [recipeMode, setRecipeMode]   = useState(null)
  const [ingStatus, setIngStatus]     = useState(null)
  const [shoppingList, setShoppingList] = useState([])
  const [shopCopied, setShopCopied]   = useState(false)
  const [validResult, setValidResult] = useState(null)

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

  const flash = (msg,type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:"smooth"}) },[chatMsgs])
  useEffect(()=>{ setChatMsgs([]); setFbDone(false); setShowFeedback(false); setFbRating(""); setFbNotes(""); setValidResult(null) },[recipeId])

  const applyRecipe = (data, id, mode, ingStatusObj=null, shopList=[]) => {
    setRecipe(data.recipe_json||data)
    setRecipeId(id); setRecipeMode(mode)
    setIngStatus(ingStatusObj); setShoppingList(shopList)
    setIsFav(data.is_favourite||false); setError(null)
    setTimeout(()=>recipeRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),150)
  }

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

  // ── Mode B ────────────────────────────────────────────────────────────────

  const handleSearch = async () => {
    const term=searchTerm.trim(); if(!term) return
    setSearchBusy(true); setError(null)
    try {
      const res = await axios.post(`${API}/recipe/search`,{dish_name:term})
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
      const res = await axios.post(`${API}/recipe/generate`,{
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
    } catch(e) { setError("Generation failed: "+(e.response?.data?.detail||e.message)) }
    finally { setGenBusy(false) }
  }

  const handlePrev = async () => {
    if (histIdx<=0) return
    try {
      const res = await axios.get(`${API}/recipe/${history[histIdx-1].id}`)
      setHistIdx(histIdx-1); applyRecipe(res.data, history[histIdx-1].id, "pantry")
    } catch { flash("Could not load previous recipe","err") }
  }

  const validateRecipe = async () => {
    if (!recipeId) return
    try {
      const res = await axios.get(`${API}/recipe/${recipeId}/validate`)
      setValidResult(res.data); flash("Checked against current pantry")
    } catch { flash("Validation failed","err") }
  }

  const toggleFav = async () => {
    if (!recipeId) return
    try {
      const res = await axios.post(`${API}/recipe/${recipeId}/favourite`)
      setIsFav(res.data.is_favourite)
      flash(res.data.is_favourite?"Saved to favourites!":"Removed from favourites")
    } catch { flash("Failed","err") }
  }

  const submitFeedback = async () => {
    if (!fbRating) { flash("Select a rating first","err"); return }
    try {
      await axios.post(`${API}/recipe/${recipeId}/feedback`,{rating:fbRating,notes:fbNotes})
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

  const showVariations = async () => {
    if (!recipe?.name) return
    setSearchBusy(true); setError(null)
    try {
      const res = await axios.post(`${API}/recipe/search`,{dish_name:recipe.name})
      applyRecipe(res.data, res.data.id, "direct", res.data.ingredient_status, res.data.shopping_list||[])
    } catch { setError("Could not load variations") }
    finally { setSearchBusy(false) }
  }

  const sendChat = async () => {
    const msg=chatInput.trim(); if(!msg||!recipeId||chatBusy) return
    const next=[...chatMsgs,{role:"user",content:msg}]
    setChatMsgs(next); setChatInput(""); setChatBusy(true)
    try {
      const res = await axios.post(`${API}/recipe/${recipeId}/chat`,{message:msg,chat_history:chatMsgs})
      setChatMsgs([...next,{role:"assistant",content:res.data.reply}])
    } catch { setChatMsgs([...next,{role:"assistant",content:"Sorry, couldn't answer that. Try again."}]) }
    finally { setChatBusy(false) }
  }

  const submitUserRecipe = async () => {
    if (!urf.name.trim()) { flash("Name is required","err"); return }
    setUrfBusy(true)
    try {
      await axios.post(`${API}/user-recipes`,{
        name:urf.name.trim(), cuisine:urf.cuisine||null,
        ingredients:urf.ingredients.split("\n").map(s=>s.trim()).filter(Boolean),
        steps:urf.steps.split("\n").map(s=>s.trim()).filter(Boolean),
      })
      setUrf({name:"",cuisine:"",ingredients:"",steps:""}); setShowURF(false); flash("Recipe saved!")
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

      {/* ── Desktop: 2-column grid. Left = controls, Right = recipe ── */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ═══ LEFT COLUMN — search + filters + cook ═══ */}
        <div className="w-full lg:w-96 flex-shrink-0 space-y-4">

          {/* ── Mode B: Dish search ── */}
          <div className="dk-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔍</span>
              <div>
                <h3 className="text-sm font-black" style={{color:"var(--text-primary)"}}>Search a dish</h3>
                <p className="text-xs" style={{color:"var(--text-faint)"}}>Full recipe + what you have vs need</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleSearch()}
                placeholder="Idli, Biryani, Pasta…"
                className="dk-input flex-1"/>
              <button onClick={handleSearch} disabled={searchBusy||!searchTerm.trim()}
                className="btn-orange px-4 flex-shrink-0" style={{borderRadius:"0.625rem",padding:"0.5rem 1rem"}}>
                {searchBusy ? <Spinner/> : "Go"}
              </button>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{background:"var(--card-border)"}}/>
            <span className="text-xs font-bold" style={{color:"var(--text-faint)"}}>OR</span>
            <div className="flex-1 h-px" style={{background:"var(--card-border)"}}/>
          </div>

          {/* ── Mode A: Filters + Cook ── */}
          <div className="dk-card overflow-hidden">
            {/* Cook banner */}
            <div className="bg-cook-banner px-5 py-5" style={{minHeight:80}}>
              <h3 className="text-sm font-black" style={{color:"var(--text-primary)"}}>Cook from your pantry</h3>
              <p className="text-xs mt-0.5" style={{color:"var(--text-muted)"}}>
                AI agent checks real availability before generating
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Filters toggle */}
              <button onClick={()=>setShowFilters(v=>!v)}
                className="w-full flex items-center justify-between text-sm font-semibold transition-colors"
                style={{color:"var(--text-muted)"}}>
                <span>⚙ Filters {Object.values(filters).some(v=>v&&v!==[]&&v!==0&&v!==""&&(Array.isArray(v)?v.length>0:true))?"(active)":""}</span>
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

              {/* Big CTA */}
              {ingredients.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm font-semibold mb-1" style={{color:"var(--text-primary)"}}>Pantry is empty</p>
                  <p className="text-xs mb-3" style={{color:"var(--text-muted)"}}>Add ingredients first</p>
                  <button onClick={onGoToPantry} className="btn-orange" style={{width:"100%",justifyContent:"center"}}>
                    Go to My Pantry →
                  </button>
                </div>
              ) : (
                <button onClick={callGenerate} disabled={genBusy}
                  className="btn-orange w-full justify-center py-4 text-base font-black"
                  style={{width:"100%",borderRadius:"0.875rem",padding:"1rem"}}>
                  {genBusy
                    ? <><Spinner size={5}/><span className="text-sm font-semibold">{agentMsg}</span></>
                    : <><span className="text-xl">🍳</span> Cook something today</>
                  }
                </button>
              )}
              <p className="text-xs text-center" style={{color:"var(--text-faint)"}}>
                {genBusy
                  ? <span style={{color:"var(--orange)"}} className="font-semibold animate-pulse">Checking {ingredients.length} ingredients…</span>
                  : `${ingredients.length} ingredient${ingredients.length!==1?"s":""} available · No hallucinations`}
              </p>

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
              <span className="text-xs font-semibold" style={{color:"var(--text-faint)"}}>
                {histIdx+1} / {history.length}
              </span>
              <button onClick={callGenerate} disabled={genBusy}
                className="text-sm font-bold transition-colors"
                style={{color:genBusy?"var(--text-faint)":"var(--orange)"}}>
                {genBusy?"…":"Next →"}
              </button>
            </div>
          )}

          {/* Submit user recipe */}
          <div className="dk-card overflow-hidden">
            <button onClick={()=>setShowURF(v=>!v)}
              className="w-full px-5 py-4 text-sm font-semibold text-left flex items-center gap-2 transition-colors"
              style={{color:"var(--text-muted)"}}>
              <span>📝</span>
              {showURF ? "▲ Hide form" : "Submit your own recipe"}
            </button>
            {showURF && (
              <div className="px-5 pb-5 space-y-3" style={{borderTop:"1px solid var(--card-border)"}}>
                <div className="grid grid-cols-2 gap-3 pt-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-faint)"}}>Name *</label>
                    <input value={urf.name} onChange={e=>setUrf(f=>({...f,name:e.target.value}))}
                      placeholder="Mum's Special Dal" className="dk-input"/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-faint)"}}>Cuisine</label>
                    <input value={urf.cuisine} onChange={e=>setUrf(f=>({...f,cuisine:e.target.value}))}
                      placeholder="South Indian" className="dk-input"/>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-faint)"}}>Ingredients (one per line) *</label>
                  <textarea value={urf.ingredients} onChange={e=>setUrf(f=>({...f,ingredients:e.target.value}))}
                    placeholder={"200g urad dal\n1 tsp cumin\n500ml water"} rows={4}
                    className="dk-input" style={{resize:"none",fontFamily:"monospace",fontSize:"0.8rem"}}/>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-faint)"}}>Steps (one per line) *</label>
                  <textarea value={urf.steps} onChange={e=>setUrf(f=>({...f,steps:e.target.value}))}
                    placeholder={"Soak dal for 4 hours\nGrind to a paste\nFerment for 8 hours"} rows={5}
                    className="dk-input" style={{resize:"none"}}/>
                </div>
                <div className="flex gap-2">
                  <button onClick={submitUserRecipe} disabled={urfBusy} className="btn-orange">
                    {urfBusy?"Saving…":"Save Recipe"}
                  </button>
                  <button onClick={()=>{setShowURF(false);setUrf({name:"",cuisine:"",ingredients:"",steps:""})}} className="btn-ghost">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT COLUMN — recipe card + chat ═══ */}
        <div className="flex-1 min-w-0 space-y-5" ref={recipeRef}>
          {!recipe && (
            <div className="dk-card text-center py-20">
              <div className="text-6xl mb-4">🍽</div>
              <p className="font-bold text-lg" style={{color:"var(--text-primary)"}}>Your recipe will appear here</p>
              <p className="text-sm mt-1" style={{color:"var(--text-muted)"}}>
                Search a dish above or click "Cook something today"
              </p>
            </div>
          )}

          {recipe && (
            <div className="dk-card overflow-hidden">

              {/* Header */}
              <div className="recipe-hdr px-6 py-6"
                style={{background: MEAL_BG[recipe.meal_type?.toLowerCase()] || "linear-gradient(135deg,#1e1204,#2e1a08)"}}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {recipe.cuisine   && <span className="tag-orange">{recipe.cuisine}</span>}
                      {recipe.meal_type && <span className="tag-dim">{recipe.meal_type}</span>}
                      {recipe.difficulty&&<span className={`tag-dim diff-${recipe.difficulty?.toLowerCase()}`}
                        style={{background:undefined,padding:"2px 10px",borderRadius:"999px",fontSize:"0.7rem",fontWeight:600}}>
                        {recipe.difficulty}
                      </span>}
                      {recipeMode==="direct"&&<span className="tag-dim" style={{background:"#1a0d2e",color:"#c4b5fd",border:"1px solid #7c3fb5"}}>Full recipe</span>}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black leading-tight" style={{color:"var(--text-primary)"}}>{recipe.name}</h2>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm" style={{color:"var(--text-muted)"}}>
                      {recipe.cook_time_minutes&&<span>⏱ {recipe.cook_time_minutes} min</span>}
                      {recipe.servings&&<span>👥 {recipe.servings} servings</span>}
                      {recipe.calorie_estimate&&<span>🔥 {recipe.calorie_estimate}</span>}
                    </div>
                  </div>
                </div>
                {/* Action row */}
                <div className="flex flex-wrap gap-2 mt-4">
                  <button onClick={toggleFav}
                    className={`btn-ghost ${isFav?"":""}` }
                    style={isFav?{background:"#7f1d1d",color:"#fca5a5",borderColor:"#7c2020"}:{}}>
                    {isFav?"❤️ Saved":"🤍 Save"}
                  </button>
                  {!fbDone ? (
                    <button onClick={()=>setShowFeedback(v=>!v)} className="btn-ghost">💬 Feedback</button>
                  ) : (
                    <span className="text-xs font-bold flex items-center px-3" style={{color:"#4ade80"}}>✓ Thanks!</span>
                  )}
                  <button onClick={showVariations} disabled={searchBusy} className="btn-ghost">🔀 Variations</button>
                  <button onClick={shareRecipe} className="btn-ghost">📤 Share</button>
                </div>
              </div>

              {/* Feedback panel */}
              {showFeedback && !fbDone && (
                <div className="px-6 py-4" style={{borderBottom:"1px solid var(--card-border)",background:"var(--hover-bg)"}}>
                  <p className="text-sm font-bold mb-3" style={{color:"var(--text-primary)"}}>How was this recipe?</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {FEEDBACK_OPTIONS.map(o=>(
                      <button key={o.val} onClick={()=>setFbRating(o.val)}
                        className={`fb-btn ${fbRating===o.val?"active":""}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <textarea value={fbNotes} onChange={e=>setFbNotes(e.target.value)}
                    placeholder="Any other notes? (optional)" rows={2}
                    className="dk-input mb-3" style={{resize:"none"}}/>
                  <div className="flex gap-2">
                    <button onClick={submitFeedback} className="btn-orange" style={{padding:"0.4rem 1.2rem"}}>Submit</button>
                    <button onClick={()=>setShowFeedback(false)} className="btn-ghost" style={{padding:"0.4rem 1rem"}}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Health warnings */}
              {recipe.health_warnings?.length>0 && (
                <div className="px-6 py-3" style={{borderBottom:"1px solid var(--card-border)",background:"#2e1e04"}}>
                  <p className="text-xs font-black mb-1" style={{color:"#fbbf24"}}>⚠️ Health notes</p>
                  {recipe.health_warnings.map((w,i)=><p key={i} className="text-xs" style={{color:"#fcd34d"}}>{w}</p>)}
                </div>
              )}

              {/* Mode B: status summary */}
              {recipeMode==="direct" && ingStatus && (
                <div className="px-6 py-4" style={{borderBottom:"1px solid var(--card-border)"}}>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      {label:"Available", count:ingStatus.available?.length||0, cls:"pill-ok", bg:"#0d2e1a"},
                      {label:"Low qty",   count:ingStatus.low_qty?.length||0,   cls:"pill-low",bg:"#2e1e04"},
                      {label:"To buy",    count:ingStatus.missing?.length||0,   cls:"pill-bad",bg:"#2e0d0d"},
                    ].map(s=>(
                      <div key={s.label} className="rounded-xl py-3 text-center" style={{background:s.bg,border:"1px solid var(--card-border)"}}>
                        <div className={`text-2xl font-black ${s.cls}`} style={{border:"none",background:"transparent",padding:0}}>{s.count}</div>
                        <div className="text-xs font-semibold mt-0.5" style={{color:"var(--text-muted)"}}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <IngStatusList ingStatus={ingStatus}/>
                </div>
              )}

              {/* Validation result */}
              {validResult && (
                <div className="px-6 py-4" style={{borderBottom:"1px solid var(--card-border)",background:"var(--hover-bg)"}}>
                  <p className="text-xs font-black mb-2" style={{color:"#93c5fd"}}>📋 Current pantry check</p>
                  <IngStatusList ingStatus={validResult}/>
                </div>
              )}

              {/* Recipe body: 2-col (ingredients + steps) */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-5 gap-6">

                {/* Ingredients */}
                <div className="md:col-span-2">
                  <h3 className="text-sm font-black mb-3 flex items-center gap-2" style={{color:"var(--text-primary)"}}>🧂 Ingredients</h3>
                  {recipeMode==="pantry" ? (
                    <div className="space-y-1.5">
                      {(recipe.ingredients_used||[]).map((ing,i)=>(
                        <div key={i} className="flex items-center justify-between py-1.5 text-sm"
                          style={{borderBottom:"1px solid var(--card-border)"}}>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:"var(--orange)"}}/>
                            <span className="font-medium" style={{color:"var(--text-primary)"}}>{ing.name}</span>
                          </div>
                          {ing.quantity&&<span className="text-xs" style={{color:"var(--text-faint)"}}>{ing.quantity}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <IngStatusList ingStatus={ingStatus}/>
                  )}

                  {/* Shopping list */}
                  {recipeMode==="direct" && shoppingList.length>0 && (
                    <div className="mt-4 pt-4" style={{borderTop:"1px solid var(--card-border)"}}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black" style={{color:"#f87171"}}>🛒 Shopping ({shoppingList.length})</span>
                        <button onClick={()=>{
                          navigator.clipboard?.writeText(shoppingList.join("\n"))
                          setShopCopied(true); setTimeout(()=>setShopCopied(false),2000)
                        }} className="text-xs font-semibold" style={{color:"var(--orange)"}}>
                          {shopCopied?"✓ Copied!":"Copy"}
                        </button>
                      </div>
                      <div className="rounded-xl px-3 py-2 space-y-1" style={{background:"#2e0d0d",border:"1px solid #7c2020"}}>
                        {shoppingList.map((item,i)=><p key={i} className="text-xs" style={{color:"#fca5a5"}}>{item}</p>)}
                      </div>
                    </div>
                  )}

                  {/* Validate button */}
                  {recipeMode==="pantry" && !validResult && (
                    <button onClick={validateRecipe}
                      className="btn-ghost mt-4 w-full justify-center text-xs"
                      style={{padding:"0.5rem",width:"100%"}}>
                      🔄 Check against current pantry
                    </button>
                  )}
                </div>

                {/* Steps */}
                <div className="md:col-span-3">
                  <h3 className="text-sm font-black mb-3 flex items-center gap-2" style={{color:"var(--text-primary)"}}>👩‍🍳 Method</h3>
                  <ol className="space-y-3">
                    {(recipe.steps||[]).map((step,i)=>(
                      <li key={i} className="flex gap-3">
                        <span className="step-num">{i+1}</span>
                        <p className="text-sm leading-relaxed pt-0.5" style={{color:"var(--text-primary)"}}>{step}</p>
                      </li>
                    ))}
                  </ol>
                  {recipe.serving_suggestion&&(
                    <div className="flex items-start gap-2 mt-4 pt-4" style={{borderTop:"1px solid var(--card-border)"}}>
                      <span className="text-base flex-shrink-0">🍽</span>
                      <p className="text-sm" style={{color:"var(--text-muted)"}}>{recipe.serving_suggestion}</p>
                    </div>
                  )}
                  {recipe.cooking_tips?.length>0 && (
                    <div className="mt-3 rounded-xl px-4 py-3" style={{background:"#0d1a2e",border:"1px solid #1a3a6e"}}>
                      <p className="text-xs font-black mb-1.5" style={{color:"#93c5fd"}}>💡 Tips</p>
                      {recipe.cooking_tips.map((t,i)=><p key={i} className="text-xs leading-relaxed" style={{color:"#bfdbfe"}}>{t}</p>)}
                    </div>
                  )}
                  {recipeMode==="direct"&&recipe.variations?.length>0 && (
                    <div className="mt-3 rounded-xl px-4 py-3" style={{background:"#1a0d2e",border:"1px solid #5a2da0"}}>
                      <p className="text-xs font-black mb-1.5" style={{color:"#c4b5fd"}}>🔀 Variations</p>
                      {recipe.variations.map((v,i)=><p key={i} className="text-xs leading-relaxed" style={{color:"#ddd6fe"}}>• {v}</p>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Chat */}
          {recipe && recipeId && (
            <div className="dk-card overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-3"
                style={{background:"linear-gradient(135deg,#2e1508,#1e0d04)",borderBottom:"1px solid var(--card-border)"}}>
                <span className="text-2xl">👨‍🍳</span>
                <div>
                  <h3 className="text-sm font-black" style={{color:"var(--text-primary)"}}>Cooking assistant</h3>
                  <p className="text-xs" style={{color:"var(--text-muted)"}}>Ask anything about "{recipe.name}"</p>
                </div>
              </div>

              {chatMsgs.length===0 && (
                <div className="px-5 py-4 flex flex-wrap gap-2">
                  {["How do I know when the oil is ready?","Can I use ghee instead?","How to make it less spicy?","What to serve with this?"].map(q=>(
                    <button key={q} onClick={()=>setChatInput(q)}
                      className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors hover-lift"
                      style={{background:"var(--input-bg)",border:"1px solid var(--card-border)",color:"var(--text-muted)"}}>
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {chatMsgs.length>0 && (
                <div className="px-5 py-4 max-h-72 overflow-y-auto space-y-3 chat-scroll">
                  {chatMsgs.map((msg,i)=>(
                    <div key={i} className={`flex ${msg.role==="user"?"justify-end":"justify-start"}`}>
                      <div className="max-w-xs sm:max-w-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed font-medium"
                        style={msg.role==="user"
                          ? {background:"var(--orange)",color:"#fff",borderBottomRightRadius:"4px"}
                          : {background:"var(--hover-bg)",color:"var(--text-primary)",border:"1px solid var(--card-border)",borderBottomLeftRadius:"4px"}}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatBusy && (
                    <div className="flex justify-start">
                      <div className="px-4 py-2.5 rounded-2xl text-sm flex items-center gap-2"
                        style={{background:"var(--hover-bg)",color:"var(--text-muted)",border:"1px solid var(--card-border)"}}>
                        <Spinner size={3}/><span className="animate-pulse">Thinking…</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef}/>
                </div>
              )}

              <div className="px-5 py-4 flex gap-2" style={{borderTop:"1px solid var(--card-border)"}}>
                <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendChat()}
                  placeholder="e.g. Can I skip the soaking step?"
                  disabled={chatBusy}
                  className="dk-input flex-1"/>
                <button onClick={sendChat} disabled={chatBusy||!chatInput.trim()}
                  className="btn-orange flex-shrink-0" style={{padding:"0.5rem 1.2rem",borderRadius:"0.625rem"}}>
                  Send →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}