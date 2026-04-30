import { useState, useRef } from "react"
import api from "./api"


const CATEGORIES = ["spices","lentils","vegetables","fruits","oils","flours","dairy","protein","grains","other"]
const UNITS      = ["g","kg","ml","litre","pieces","tbsp","tsp","cup","bunch","packet"]
const EMPTY_FORM = { name:"", category:"vegetables", quantity:"", unit:"g", expiry_date:"" }

const CAT_EMOJI = {
  spices:"🌶", lentils:"🫘", vegetables:"🥦", fruits:"🍎",
  oils:"🫙", flours:"🌾", dairy:"🥛", protein:"🥩", grains:"🍚", other:"📦",
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

export default function Inventory({ ingredients, refreshInventory, API }) {
  const [showAdd, setShowAdd]         = useState(false)
  const [form, setForm]               = useState(EMPTY_FORM)
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

  const handleAdd = async () => {
    if (!form.name.trim()) { flash("Name is required","err"); return }
    setSaving(true)
    try {
      await api.post(`/inventory`, {
        name: form.name.trim(), category: form.category,
        quantity: form.quantity ? parseFloat(form.quantity) : null,
        unit: form.unit || null, expiry_date: form.expiry_date || null,
      })
      setForm(EMPTY_FORM); setShowAdd(false); refreshInventory(); flash("Ingredient added!")
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
    // ── Compress image client-side before upload ──
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

    const fd = new FormData()
    fd.append("file", compressed, "scan.jpg")

    const res = await api.post(`/inventory/scan-image`, fd)
    const items = res.data.extracted_ingredients || []
    if (!items.length) { flash("No ingredients detected", "err"); return }
    setScanned(items)
    setSelected(Object.fromEntries(items.map((_, i) => [i, true])))
  } catch(e) { flash("Scan failed: " + (e.response?.data?.detail || e.message), "err") }
  finally { setScanning(false); if (imgRef.current) imgRef.current.value = "" }
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
        <button onClick={()=>imgRef.current.click()} disabled={scanning}
          className="btn-ghost hover-lift">
          {scanning ? "⏳ Scanning…" : "📷 Scan Image"}
        </button>
        <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsv}/>
        <button onClick={()=>csvRef.current.click()} disabled={csvBusy}
          className="btn-ghost hover-lift">
          {csvBusy ? "Importing…" : "📥 Import CSV"}
        </button>
        <span className="text-xs ml-2" style={{color:"var(--text-faint)"}}>
          CSV columns: <code className="px-1 py-0.5 rounded text-xs" style={{background:"var(--input-bg)",color:"var(--text-muted)"}}>name, category, quantity, unit, expiry_date</code>
        </span>
      </div>

      {/* ── Add form ── */}
      {showAdd && (
        <div className="dk-card p-5 mb-5 hover-lift">
          <h3 className="text-sm font-bold mb-4" style={{color:"var(--text-primary)"}}>Add ingredient</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="col-span-2 sm:col-span-3 lg:col-span-2">
              <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-muted)"}}>Name *</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&handleAdd()}
                placeholder="e.g. Basmati Rice" className="dk-input" autoFocus/>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-muted)"}}>Category *</label>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="dk-input">
                {CATEGORIES.map(c=><option key={c} value={c}>{CAT_EMOJI[c]} {c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-muted)"}}>Quantity</label>
              <input type="number" value={form.quantity} onChange={e=>setForm(f=>({...f,quantity:e.target.value}))}
                placeholder="500" min="0" className="dk-input"/>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-muted)"}}>Unit</label>
              <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} className="dk-input">
                <option value="">—</option>
                {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{color:"var(--text-muted)"}}>Expiry date</label>
              <input type="date" value={form.expiry_date} onChange={e=>setForm(f=>({...f,expiry_date:e.target.value}))} className="dk-input"
                style={{colorScheme:"dark"}}/>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAdd} disabled={saving} className="btn-orange">
              {saving ? "Saving…" : "Save ingredient"}
            </button>
            <button onClick={()=>{setShowAdd(false);setForm(EMPTY_FORM)}} className="btn-ghost">
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
            <div className="flex gap-3 text-xs">
              <button onClick={()=>setSelected(Object.fromEntries(scanned.map((_,i)=>[i,true])))}
                style={{color:"var(--orange-light)"}} className="font-semibold underline">All</button>
              <button onClick={()=>setSelected({})}
                style={{color:"var(--orange-light)"}} className="font-semibold underline">None</button>
              <button onClick={()=>{setScanned([]);setSelected({})}}
                style={{color:"var(--text-faint)"}} className="hover:text-white transition-colors">✕</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mb-4">
            {scanned.map((item,i)=>(
              <label key={i} className="flex items-start gap-2.5 p-3 rounded-xl cursor-pointer transition-all"
                style={{
                  background: selected[i] ? "var(--hover-bg)" : "var(--input-bg)",
                  border: `1px solid ${selected[i] ? "#7c3a12" : "var(--card-border)"}`,
                  opacity: selected[i] ? 1 : 0.55,
                }}>
                <input type="checkbox" checked={!!selected[i]}
                  onChange={e=>setSelected(p=>({...p,[i]:e.target.checked}))}
                  className="w-4 h-4 mt-0.5 flex-shrink-0 accent-orange-500"/>
                <div className="min-w-0">
                  <span className="text-sm font-semibold capitalize block" style={{color:"var(--text-primary)"}}>{item.name}</span>
                  <div className="flex gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded cat-${item.category||"other"}`}>{item.category}</span>
                    {item.estimated_quantity && <span className="text-xs" style={{color:"var(--text-faint)"}}>{item.estimated_quantity}</span>}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <button onClick={addScanned} disabled={addingScanned||!Object.values(selected).some(Boolean)} className="btn-orange">
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
        <div className="dk-card text-center py-20">
          <div className="text-6xl mb-4">🥗</div>
          <p className="font-bold text-lg" style={{color:"var(--text-primary)"}}>
            {ingredients.length===0 ? "Your pantry is empty" : "Nothing in this category"}
          </p>
          <p className="text-sm mt-1" style={{color:"var(--text-muted)"}}>
            {ingredients.length===0
              ? "Add ingredients above or scan a fridge photo to get started"
              : "Switch category or add ingredients"}
          </p>
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
                                <input value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))}
                                  className="dk-input" style={{width:"100%"}}/>
                              </td>
                              <td className="px-4 py-2">
                                <input type="number" value={editForm.quantity} onChange={e=>setEditForm(f=>({...f,quantity:e.target.value}))}
                                  className="dk-input" style={{width:"5rem"}}/>
                              </td>
                              <td className="px-4 py-2">
                                <select value={editForm.unit} onChange={e=>setEditForm(f=>({...f,unit:e.target.value}))} className="dk-input" style={{width:"6rem"}}>
                                  <option value="">—</option>
                                  {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                                </select>
                              </td>
                              <td className="px-4 py-2">
                                <input type="date" value={editForm.expiry_date} onChange={e=>setEditForm(f=>({...f,expiry_date:e.target.value}))}
                                  className="dk-input" style={{width:"9rem",colorScheme:"dark"}}/>
                              </td>
                              <td className="px-4 py-2 text-right whitespace-nowrap">
                                <button onClick={()=>saveEdit(item.id)}
                                  className="text-xs font-bold mr-3 transition-colors" style={{color:"#4ade80"}}>Save</button>
                                <button onClick={()=>setEditId(null)}
                                  className="text-xs transition-colors" style={{color:"var(--text-faint)"}}>Cancel</button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 font-semibold" style={{color:"var(--text-primary)"}}>{item.name}</td>
                              <td className="px-4 py-3" style={{color:"var(--text-muted)"}}>{item.quantity??'—'}</td>
                              <td className="px-4 py-3" style={{color:"var(--text-faint)"}}>{item.unit??'—'}</td>
                              <td className="px-4 py-3">
                                {exp
                                  ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${exp.cls}`}>{exp.icon} {exp.label}</span>
                                  : <span style={{color:"var(--text-faint)"}} className="text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <button onClick={()=>startEdit(item)}
                                  className="text-xs font-semibold mr-3 transition-colors" style={{color:"#93c5fd"}}>Edit</button>
                                <button onClick={()=>setDelConfirm(item.id)}
                                  className="text-xs font-semibold transition-colors" style={{color:"#f87171"}}>Delete</button>
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

      {/* ── Delete confirm modal ── */}
      {delConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{background:"rgba(0,0,0,0.7)"}}>
          <div className="dk-card p-6 max-w-sm w-full shadow-2xl">
            <div className="text-3xl text-center mb-3">🗑️</div>
            <h3 className="font-black text-center mb-1" style={{color:"var(--text-primary)"}}>Delete ingredient?</h3>
            <p className="text-sm text-center mb-5" style={{color:"var(--text-muted)"}}>
              Remove "{ingredients.find(i=>i.id===delConfirm)?.name}" from your pantry.
            </p>
            <div className="flex gap-3">
              <button onClick={()=>handleDelete(delConfirm)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors"
                style={{background:"#7f1d1d",color:"#fca5a5",border:"1px solid #7c2020"}}>
                Delete
              </button>
              <button onClick={()=>setDelConfirm(null)} className="flex-1 btn-ghost py-2.5">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}