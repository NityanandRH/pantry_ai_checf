import { useState, useRef, useEffect } from "react"
import api from "./api"
import { searchIngredients, getByCategory } from "./ingredientsList"

const CATEGORIES = ["spices","lentils","vegetables","fruits","oils","flours","dairy","protein","grains","other"]
const UNITS      = ["g","kg","ml","litre","pieces","tbsp","tsp","cup","bunch","packet"]
const EMPTY_FORM = { name:"", category:"vegetables", quantity:"", unit:"g", expiry_days:"" }

const CAT_EMOJI = {
  spices:"🌶", lentils:"🫘", vegetables:"🥦", fruits:"🍎",
  oils:"🫙", flours:"🌾", dairy:"🥛", protein:"🥩", grains:"🍚", other:"📦",
}

// Expiry days options for the dropdown
const EXPIRY_OPTIONS = [
  { label:"1 day",    value:1  },
  { label:"2 days",   value:2  },
  { label:"3 days",   value:3  },
  { label:"5 days",   value:5  },
  { label:"1 week",   value:7  },
  { label:"2 weeks",  value:14 },
  { label:"1 month",  value:30 },
  { label:"2 months", value:60 },
  { label:"3 months", value:90 },
  { label:"6 months", value:180},
  { label:"1 year",   value:365},
  { label:"Custom date…", value:"custom" },
]

function daysToDate(days) {
  if (!days || days === "custom") return ""
  const d = new Date()
  d.setDate(d.getDate() + parseInt(days))
  return d.toISOString().split("T")[0]
}

function expiryStatus(d) {
  if (!d) return null
  const diff = Math.ceil((new Date(d) - new Date()) / 86400000)
  if (diff < 0)  return { label:"Expired",   cls:"pill-bad",  icon:"⚠" }
  if (diff <= 3) return { label:`${diff}d`,   cls:"pill-low",  icon:"⏰" }
  return {
    label: new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short"}),
    cls: "tag-dim", icon: ""
  }
}

// ── Smart Name Input with Autocomplete ──────────────────────────────────────
function IngredientAutocomplete({ value, onChange, onSelect }) {
  const [open, setOpen]         = useState(false)
  const [suggestions, setSugs]  = useState([])
  const [activeIdx, setActive]  = useState(-1)
  const wrapRef = useRef()

  useEffect(() => {
    const results = searchIngredients(value)
    setSugs(results)
    setOpen(results.length > 0 && value.trim().length > 0)
    setActive(-1)
  }, [value])

  // Close on outside click
  useEffect(() => {
    let touchStartY = 0
    const onTouchStart = e => { touchStartY = e.touches[0]?.clientY || 0 }
    const onTouchEnd = e => {
      const moved = Math.abs((e.changedTouches[0]?.clientY || 0) - touchStartY) > 10
      if (!moved && wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onMouseDown = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("touchstart", onTouchStart, { passive:true })
    document.addEventListener("touchend", onTouchEnd, { passive:true })
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("touchstart", onTouchStart)
      document.removeEventListener("touchend", onTouchEnd)
    }
  }, [])

  const handleKey = e => {
    if (!open) return
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(i+1, suggestions.length-1)) }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive(i => Math.max(i-1, -1)) }
    if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pick(suggestions[activeIdx]) }
    if (e.key === "Escape") setOpen(false)
  }

  const pick = (item) => {
    onSelect(item)
    setOpen(false)
    setSugs([])
  }

  return (
    <div ref={wrapRef} style={{position:"relative"}}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKey}
        onFocus={() => suggestions.length > 0 && value.trim() && setOpen(true)}
        placeholder="Type to search…"
        className="dk-input"
        autoComplete="off"
        autoFocus
      />
      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 4px)", left:0, right:0,
          background:"var(--card-bg)", border:"1px solid var(--card-border)",
          borderRadius:"0.75rem", boxShadow:"0 8px 32px rgba(0,0,0,0.4)",
          zIndex:100, overflow:"hidden",
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.name}
              onMouseDown={() => pick(s)}
              style={{
                padding:"0.6rem 0.875rem",
                background: i === activeIdx ? "var(--hover-bg)" : "transparent",
                cursor:"pointer",
                borderBottom: i < suggestions.length-1 ? "1px solid var(--card-border)" : "none",
                display:"flex", alignItems:"center", gap:"0.5rem",
              }}
            >
              <span style={{fontSize:"1rem"}}>{CAT_EMOJI[s.category]}</span>
              <span style={{color:"var(--text-primary)", fontSize:"0.85rem", fontWeight:500}}>{s.name}</span>
              <span style={{
                marginLeft:"auto", fontSize:"0.65rem", fontWeight:700,
                color:"var(--orange)", background:"rgba(249,115,22,0.12)",
                padding:"0.15rem 0.5rem", borderRadius:"99px", textTransform:"uppercase"
              }}>{s.category}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Category quick-pick pills ─────────────────────────────────────────────
function CategoryQuickPick({ selectedCategory, onCategoryChange }) {
  const [activeCat, setActiveCat] = useState(selectedCategory)
  const [quickPicks, setQuickPicks] = useState([])
  const [showPicks, setShowPicks] = useState(false)

  const handleCat = (cat) => {
    setActiveCat(cat)
    onCategoryChange(cat)
    setQuickPicks(getByCategory(cat).slice(0, 12))
    setShowPicks(true)
  }

  return (
    <div>
      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => handleCat(cat)}
            style={{
              padding:"0.3rem 0.75rem",
              borderRadius:"99px",
              fontSize:"0.72rem",
              fontWeight:700,
              cursor:"pointer",
              transition:"all 0.15s",
              background: activeCat === cat ? "var(--orange)" : "var(--input-bg)",
              border: `1px solid ${activeCat === cat ? "var(--orange)" : "var(--card-border)"}`,
              color: activeCat === cat ? "#fff" : "var(--text-muted)",
            }}
          >
            {CAT_EMOJI[cat]} {cat.charAt(0).toUpperCase()+cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Quick ingredient picks for selected category */}
      {showPicks && quickPicks.length > 0 && (
        <div style={{marginTop:"0.5rem"}}>
          <p style={{fontSize:"0.7rem", color:"var(--text-faint)", marginBottom:"0.4rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em"}}>
            Quick add {activeCat}:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickPicks.map(item => (
              <button
                key={item.name}
                type="button"
                onClick={() => onCategoryChange(activeCat, item.name)}
                style={{
                  padding:"0.25rem 0.65rem",
                  borderRadius:"99px",
                  fontSize:"0.72rem",
                  fontWeight:600,
                  cursor:"pointer",
                  background:"var(--input-bg)",
                  border:"1px solid var(--card-border)",
                  color:"var(--text-muted)",
                  transition:"all 0.15s",
                }}
                onMouseEnter={e=>{e.target.style.borderColor="var(--orange)";e.target.style.color="var(--orange)"}}
                onMouseLeave={e=>{e.target.style.borderColor="var(--card-border)";e.target.style.color="var(--text-muted)"}}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────
export default function Inventory({ ingredients, refreshInventory, API }) {
  const [showAdd, setShowAdd]         = useState(false)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [useCustomDate, setCustomDate] = useState(false)
  const [customDateVal, setCustomDateVal] = useState("")
  const [editId, setEditId]           = useState(null)
  const [editForm, setEditForm]       = useState({})
  const [delConfirm, setDelConfirm]   = useState(null)
  const [catFilter, setCatFilter]     = useState("all")
  const [scanning, setScanning]       = useState(false)
  const [scanned, setScanned]         = useState([])
  const [selected, setSelected]       = useState({})
  const [addingScanned, setAddingScanned] = useState(false)
  const [csvBusy, setCsvBusy]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState(null)
  const imgRef = useRef(); const csvRef = useRef()

  const flash = (msg, type="ok") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const visible = catFilter === "all" ? ingredients : ingredients.filter(i => i.category === catFilter)
  const grouped = visible.reduce((a,i) => { (a[i.category]=a[i.category]||[]).push(i); return a }, {})

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const getExpiryDate = () => {
    if (useCustomDate) return customDateVal || null
    return form.expiry_days ? daysToDate(form.expiry_days) : null
  }

  const handleAdd = async () => {
    if (!form.name.trim()) { flash("Name is required","err"); return }
    setSaving(true)
    try {
      await api.post(`/inventory`, {
        name: form.name.trim(), category: form.category,
        quantity: form.quantity ? parseFloat(form.quantity) : null,
        unit: form.unit || null,
        expiry_date: getExpiryDate(),
      })
      setForm(EMPTY_FORM); setCustomDate(false); setCustomDateVal("")
      setShowAdd(false); refreshInventory(); flash("Ingredient added!")
    } catch(e) { flash(e.response?.data?.detail||"Failed to add","err") }
    finally { setSaving(false) }
  }

  const startEdit = (item) => {
    setEditId(item.id)
    setEditForm({ name:item.name, category:item.category, quantity:item.quantity??'', unit:item.unit??'', expiry_date:item.expiry_date??'' })
  }

  const saveEdit = async (id) => {
    try {
      await api.put(`/inventory/${id}`, {
        name:editForm.name.trim(), category:editForm.category,
        quantity:editForm.quantity?parseFloat(editForm.quantity):null,
        unit:editForm.unit||null, expiry_date:editForm.expiry_date||null,
      })
      setEditId(null); refreshInventory(); flash("Updated!")
    } catch { flash("Update failed","err") }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/inventory/${id}`)
      setDelConfirm(null); refreshInventory(); flash("Deleted")
    } catch { flash("Delete failed","err") }
  }

  // ── Image scan ────────────────────────────────────────────────────────────
  const handleScan = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setScanning(true); setScanned([])
    try {
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
          canvas.toBlob(blob => blob ? resolve(blob) : reject("Compression failed"),
            "image/jpeg", 0.85)
        }
        img.onerror = reject
        img.src = url
      })

      // Convert to base64 JSON — avoids WAF multipart blocking
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(",")[1])
        reader.readAsDataURL(compressed)
      })

      const res = await api.post(`/inventory/scan-image`, { image_b64: base64 })
      const items = res.data.extracted_ingredients||[]
      if (!items.length) { flash("No ingredients detected","err"); return }
      setScanned(items)
      setSelected(Object.fromEntries(items.map((_,i)=>[i,true])))
    } catch(e) {
      const detail = e.response?.data?.detail
      if (e.response?.status === 402 && detail?.error === "SCAN_LIMIT_REACHED") {
        flash(detail.message || "Scan limit reached. Upgrade to Pro.", "err")
      } else {
        flash("Scan failed: " + (detail?.message || detail || e.message), "err")
      }
    }
  }

  const addScanned = async () => {
    const toAdd = scanned.filter((_,i)=>selected[i])
    if (!toAdd.length) return
    setAddingScanned(true)
    try {
      await Promise.all(toAdd.map(item => api.post(`/inventory`, {
        name:item.name, category:item.category||"other", quantity:null, unit:item.estimated_unit||null,
      })))
      setScanned([]); setSelected({}); refreshInventory()
      flash(`Added ${toAdd.length} item${toAdd.length>1?"s":""}!`)
    } catch { flash("Failed to add some items","err") }
    finally { setAddingScanned(false) }
  }

  const handleCsv = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setCsvBusy(true)
    const fd = new FormData(); fd.append("file", file)
    try {
      const res = await api.post(`/inventory/bulk-import`, fd)
      refreshInventory(); flash(`Imported ${res.data.imported} item${res.data.imported!==1?"s":""}!`)
    } catch { flash("Import failed","err") }
    finally { setCsvBusy(false); if(csvRef.current) csvRef.current.value="" }
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

      {/* ── Pantry banner ── */}
      <div className="bg-pantry-banner rounded-2xl overflow-hidden mb-6 relative" style={{minHeight:120}}>
        <div className="relative z-10 px-6 py-6">
          <h2 className="text-2xl font-black" style={{color:"var(--text-primary)"}}>My Pantry</h2>
          <p className="text-sm mt-1" style={{color:"var(--text-muted)"}}>
            {ingredients.length === 0
              ? "Your pantry is empty — add ingredients to get started"
              : `${ingredients.length} ingredient${ingredients.length!==1?"s":""} across ${new Set(ingredients.map(i=>i.category)).size} categories`}
          </p>
          {ingredients.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {CATEGORIES.filter(c=>ingredients.some(i=>i.category===c)).map(c=>(
                <span key={c} className={`text-xs px-2.5 py-1 rounded-full font-semibold ${("cat-"+c)}`}
                  style={{fontSize:"0.7rem"}}>
                  {CAT_EMOJI[c]} {c} ({ingredients.filter(i=>i.category===c).length})
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Action bar ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button onClick={()=>setShowAdd(v=>!v)} className="btn-orange hover-lift">
          + Add Ingredient
        </button>
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleScan}/>
        <button onClick={()=>imgRef.current.click()} disabled={scanning} className="btn-ghost hover-lift">
          {scanning ? "⏳ Scanning…" : "📷 Scan Image"}
        </button>
        <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsv}/>
        <button onClick={()=>csvRef.current.click()} disabled={csvBusy} className="btn-ghost hover-lift">
          {csvBusy ? "Importing…" : "📥 Import CSV"}
        </button>
        <span className="text-xs ml-2" style={{color:"var(--text-faint)"}}>
          CSV: <code className="px-1 py-0.5 rounded text-xs" style={{background:"var(--input-bg)",color:"var(--text-muted)"}}>name, category, quantity, unit, expiry_date</code>
        </span>
      </div>

      {/* ── Smart Add Form ── */}
      {showAdd && (
        <div className="dk-card p-5 mb-5 hover-lift">
          <h3 className="text-sm font-bold mb-1" style={{color:"var(--text-primary)"}}>Add ingredient</h3>
          <p className="text-xs mb-4" style={{color:"var(--text-faint)"}}>Type to search or pick a category below</p>

          {/* Category quick-pick */}
          <div className="mb-4">
            <CategoryQuickPick
              selectedCategory={form.category}
              onCategoryChange={(cat, name) => {
                setForm(f => ({ ...f, category: cat, ...(name ? { name } : {}) }))
              }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Name with autocomplete */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-2">
              <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-muted)"}}>Name *</label>
              <IngredientAutocomplete
                value={form.name}
                onChange={name => setForm(f => ({ ...f, name }))}
                onSelect={item => setForm(f => ({ ...f, name: item.name, category: item.category }))}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-muted)"}}>Category *</label>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="dk-input">
                {CATEGORIES.map(c=><option key={c} value={c}>{CAT_EMOJI[c]} {c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-muted)"}}>Quantity</label>
              <input type="number" value={form.quantity} onChange={e=>setForm(f=>({...f,quantity:e.target.value}))}
                placeholder="500" min="0" className="dk-input"/>
            </div>

            {/* Unit */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-muted)"}}>Unit</label>
              <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} className="dk-input">
                <option value="">—</option>
                {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            {/* Expiry — days picker */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-muted)"}}>
                Expires in
              </label>
              {!useCustomDate ? (
                <select
                  value={form.expiry_days}
                  onChange={e => {
                    if (e.target.value === "custom") { setCustomDate(true); return }
                    setForm(f => ({ ...f, expiry_days: e.target.value }))
                  }}
                  className="dk-input"
                >
                  <option value="">No expiry</option>
                  {EXPIRY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <div style={{display:"flex", gap:"0.4rem", alignItems:"center"}}>
                  <input
                    type="date"
                    value={customDateVal}
                    onChange={e => setCustomDateVal(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="dk-input"
                    style={{flex:1, colorScheme:"dark"}}
                  />
                  <button
                    type="button"
                    onClick={() => { setCustomDate(false); setCustomDateVal("") }}
                    style={{color:"var(--text-faint)", fontSize:"1rem", background:"none", border:"none", cursor:"pointer"}}
                  >✕</button>
                </div>
              )}
              {/* Preview calculated date */}
              {!useCustomDate && form.expiry_days && (
                <p style={{fontSize:"0.68rem", color:"var(--orange)", marginTop:"0.25rem"}}>
                  📅 {new Date(daysToDate(form.expiry_days)).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button onClick={handleAdd} disabled={saving} className="btn-orange">
              {saving ? "Saving…" : "Save ingredient"}
            </button>
            <button onClick={()=>{setShowAdd(false);setForm(EMPTY_FORM);setCustomDate(false);setCustomDateVal("")}} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Scan confirmation ── */}
      {scanned.length > 0 && (
        <div className="dk-card p-5 mb-5" style={{borderColor:"#7c3a12"}}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold" style={{color:"#fb923c"}}>
              📷 {scanned.length} ingredient{scanned.length!==1?"s":""} detected
            </h3>
            <button onClick={()=>{setScanned([]);setSelected({})}} style={{color:"var(--text-faint)",background:"none",border:"none",cursor:"pointer",fontSize:"1rem"}}>✕</button>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {scanned.map((item,i)=>(
              <button key={i} onClick={()=>setSelected(s=>({...s,[i]:!s[i]}))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: selected[i] ? "rgba(249,115,22,0.15)" : "var(--input-bg)",
                  border: `1px solid ${selected[i] ? "var(--orange)" : "var(--card-border)"}`,
                  color: selected[i] ? "var(--orange)" : "var(--text-muted)",
                }}>
                {selected[i] ? "✓ " : ""}{item.name}
                {item.estimated_quantity && <span style={{opacity:0.6}}>{item.estimated_quantity}</span>}
              </button>
            ))}
          </div>
          <button onClick={addScanned} disabled={addingScanned || !Object.values(selected).some(Boolean)}
            className="btn-orange">
            {addingScanned ? "Adding…" : `Add ${Object.values(selected).filter(Boolean).length} selected`}
          </button>
        </div>
      )}

      {/* ── Category filter tabs ── */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {["all",...CATEGORIES].map(cat => {
          const count = cat==="all" ? ingredients.length : ingredients.filter(i=>i.category===cat).length
          if (cat!=="all" && count===0) return null
          const isActive = catFilter===cat
          return (
            <button key={cat} onClick={()=>setCatFilter(cat)}
              className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all hover-lift"
              style={{
                background: isActive ? "var(--orange)" : "var(--card-bg)",
                border: `1px solid ${isActive ? "var(--orange)" : "var(--card-border)"}`,
                color: isActive ? "#fff" : "var(--text-muted)",
              }}>
              {cat==="all" ? `All (${count})` : `${CAT_EMOJI[cat]} ${cat.charAt(0).toUpperCase()+cat.slice(1)} (${count})`}
            </button>
          )
        })}
      </div>

      {/* ── Ingredient table(s) ── */}
      {visible.length === 0 ? (
        <div className="dk-card text-center py-16">
          <div className="text-6xl mb-4">🥗</div>
          <p className="font-bold text-lg" style={{color:"var(--text-primary)"}}>
            {ingredients.length===0 ? "Your pantry is empty" : "Nothing in this category"}
          </p>
          <p className="text-sm mt-1 mb-6" style={{color:"var(--text-muted)"}}>
            {ingredients.length===0
              ? "Add ingredients manually or scan your fridge to get started instantly"
              : "Switch category or add ingredients"}
          </p>
          {ingredients.length===0 && (
            <div className="flex gap-3 justify-center flex-wrap">
              <button onClick={()=>setShowAdd(true)} className="btn-orange">
                + Add Ingredient
              </button>
              <button onClick={()=>imgRef.current.click()}
                style={{
                  padding:"0.5rem 1.25rem", borderRadius:"0.75rem", fontWeight:700,
                  fontSize:"0.85rem", cursor:"pointer",
                  background:"rgba(249,115,22,0.1)", border:"1.5px solid var(--orange)",
                  color:"var(--orange)", display:"flex", alignItems:"center", gap:"0.4rem",
                }}>
                📷 Scan Fridge
              </button>
            </div>
          )}
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="mb-6">
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-lg">{CAT_EMOJI[category]}</span>
              <h3 className="text-xs font-black uppercase tracking-widest" style={{color:"var(--text-faint)"}}>
                {category} <span className="font-normal">({items.length})</span>
              </h3>
            </div>
            <div className="dk-card overflow-hidden hover-lift" style={{borderRadius:"1rem"}}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{background:"var(--hover-bg)", borderBottom:"1px solid var(--card-border)"}}>
                    <tr>
                      {["Name","Quantity","Unit","Expiry",""].map(h=>(
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-bold"
                          style={{color:"var(--text-faint)"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item,idx) => {
                      const isEditing = editId===item.id
                      const exp = expiryStatus(item.expiry_date)
                      return (
                        <tr key={item.id}
                          style={{
                            borderBottom: idx<items.length-1 ? "1px solid var(--card-border)" : "none",
                            background: isEditing ? "var(--hover-bg)" : "transparent",
                          }}>
                          {isEditing ? (
                            <>
                              <td className="px-4 py-2">
                                <input value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} className="dk-input" style={{minWidth:120}}/>
                              </td>
                              <td className="px-4 py-2">
                                <input type="number" value={editForm.quantity} onChange={e=>setEditForm(f=>({...f,quantity:e.target.value}))} className="dk-input" style={{width:80}}/>
                              </td>
                              <td className="px-4 py-2">
                                <select value={editForm.unit} onChange={e=>setEditForm(f=>({...f,unit:e.target.value}))} className="dk-input">
                                  <option value="">—</option>
                                  {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                                </select>
                              </td>
                              <td className="px-4 py-2">
                                <input type="date" value={editForm.expiry_date} onChange={e=>setEditForm(f=>({...f,expiry_date:e.target.value}))} className="dk-input" style={{colorScheme:"dark"}}/>
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex gap-2">
                                  <button onClick={()=>saveEdit(item.id)} className="btn-orange" style={{padding:"0.3rem 0.75rem",fontSize:"0.75rem"}}>Save</button>
                                  <button onClick={()=>setEditId(null)} className="btn-ghost" style={{padding:"0.3rem 0.75rem",fontSize:"0.75rem"}}>Cancel</button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 font-semibold" style={{color:"var(--text-primary)"}}>{item.name}</td>
                              <td className="px-4 py-3" style={{color:"var(--text-muted)"}}>{item.quantity ?? "—"}</td>
                              <td className="px-4 py-3" style={{color:"var(--text-muted)"}}>{item.unit ?? "—"}</td>
                              <td className="px-4 py-3">
                                {exp ? (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${exp.cls}`}>
                                    {exp.icon} {exp.label}
                                  </span>
                                ) : <span style={{color:"var(--text-faint)"}}>—</span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <button onClick={()=>startEdit(item)}
                                    className="text-xs font-semibold transition-colors"
                                    style={{color:"var(--text-faint)"}}>Edit</button>
                                  {delConfirm===item.id ? (
                                    <div className="flex items-center gap-1">
                                      <button onClick={()=>handleDelete(item.id)}
                                        className="text-xs font-bold" style={{color:"#f87171"}}>Delete</button>
                                      <button onClick={()=>setDelConfirm(null)}
                                        className="text-xs" style={{color:"var(--text-faint)"}}>Cancel</button>
                                    </div>
                                  ) : (
                                    <button onClick={()=>setDelConfirm(item.id)}
                                      className="text-xs transition-colors"
                                      style={{color:"var(--text-faint)"}}>✕</button>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}