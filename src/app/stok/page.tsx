'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMode } from '@/contexts/ModeContext'

interface StokRow {
  product_id: string
  product_name: string
  image_url: string | null
  barcode: string
  category: string
  unit: string
  locations: Record<string, number>
  total: number
  min_alert: number
  nearest_expiry: string | null
}

interface SayimRow {
  product_id: string
  inv_id: string
  batch_id: string
  rowKey: string
  name: string
  barcode: string
  image_url: string | null
  category: string
  expiry_date: string
  current_qty: number
  counted: string
}

export default function StokPage() {
  const { isAdminMode } = useMode()
  const [tab, setTab] = useState<'durum' | 'sayim'>('durum')

  // ── Stok Durumu state ─────────────────────────────────
  const [rows, setRows] = useState<StokRow[]>([])
  const [locationNames, setLocationNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'name' | 'stock'>('name')
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)
  const [editImg, setEditImg] = useState<{ id: string; name: string } | null>(null)
  const [editImgUrl, setEditImgUrl] = useState('')

  // ── Stok Sayım state ──────────────────────────────────
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [sayimLocId, setSayimLocId] = useState('')
  const [sayimRows, setSayimRows] = useState<SayimRow[]>([])
  const [sayimLoading, setSayimLoading] = useState(false)
  const [sayimSearch, setSayimSearch] = useState('')
  const [showDiffOnly, setShowDiffOnly] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => { fetchStok() }, [])

  // ── Stok Durumu functions ─────────────────────────────

  async function fetchStok() {
    const [{ data: locs }, { data: inv }, { data: batchData }] = await Promise.all([
      supabase.from('locations').select('id, name').order('name'),
      supabase.from('inventory').select('product_id, location_id, quantity, min_stock_alert, products(name, barcode, category, unit, image_url), locations(name)'),
      supabase.from('inventory_batches').select('product_id, expiry_date, quantity').gt('quantity', 0).order('expiry_date'),
    ])

    const locList = locs ?? []
    setLocations(locList)
    setLocationNames(locList.map(l => l.name))
    if (locList.length > 0 && !sayimLocId) setSayimLocId(locList[0].id)

    const expiryMap: Record<string, string> = {}
    ;(batchData ?? []).forEach((b: any) => { if (!expiryMap[b.product_id]) expiryMap[b.product_id] = b.expiry_date })

    const map: Record<string, StokRow> = {}
    ;(inv ?? []).forEach((row: any) => {
      const pid = row.product_id
      if (!map[pid]) {
        map[pid] = { product_id: pid, product_name: row.products?.name ?? '-', image_url: row.products?.image_url ?? null, barcode: row.products?.barcode ?? '', category: row.products?.category ?? '-', unit: row.products?.unit ?? 'adet', locations: {}, total: 0, min_alert: row.min_stock_alert ?? 5, nearest_expiry: expiryMap[pid] ?? null }
      }
      const locName = row.locations?.name ?? 'Bilinmiyor'
      map[pid].locations[locName] = Number(row.quantity)
      map[pid].total += Number(row.quantity)
    })

    setRows(Object.values(map).sort((a, b) => a.product_name.localeCompare(b.product_name)))
    setLoading(false)
  }

  async function saveEditImg(clear = false) {
    if (!editImg) return
    const url = clear ? null : (editImgUrl.trim() || null)
    await supabase.from('products').update({ image_url: url }).eq('id', editImg.id)
    setEditImg(null)
    fetchStok()
  }

  async function handleImageFileUpload(file: File) {
    if (!editImg) return
    const ext = file.name.split('.').pop()
    const path = `${editImg.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
    if (error) { alert('Yükleme hatası: ' + error.message); return }
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    setEditImgUrl(data.publicUrl)
  }

  const filtered = rows
    .filter(r =>
      r.product_name.toLowerCase().includes(search.toLowerCase()) ||
      r.barcode.includes(search) ||
      r.category.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sort === 'stock' ? b.total - a.total : a.product_name.localeCompare(b.product_name, 'tr')
    )

  // ── Stok Sayım functions ──────────────────────────────

  async function fetchSayim(locId: string) {
    if (!locId) return
    setSayimLoading(true)
    setSayimRows([])
    setSavedMsg('')

    const [{ data: batchData }, { data: prodData }, { data: invData }] = await Promise.all([
      supabase.from('inventory_batches').select('id, product_id, expiry_date, quantity').eq('location_id', locId).order('expiry_date'),
      supabase.from('products').select('id, name, barcode, category, image_url').order('name'),
      supabase.from('inventory').select('id, product_id, quantity').eq('location_id', locId),
    ])

    const batchMap: Record<string, { id: string; expiry_date: string; qty: number }[]> = {}
    ;(batchData ?? []).forEach((b: any) => {
      if (!batchMap[b.product_id]) batchMap[b.product_id] = []
      batchMap[b.product_id].push({ id: b.id, expiry_date: b.expiry_date, qty: Number(b.quantity) })
    })

    const invMap: Record<string, { id: string; qty: number }> = {}
    ;(invData ?? []).forEach((r: any) => { invMap[r.product_id] = { id: r.id, qty: Number(r.quantity) } })

    const rows: SayimRow[] = []
    for (const p of (prodData ?? [])) {
      const batches = batchMap[p.id] ?? []
      if (batches.length === 0) {
        rows.push({ product_id: p.id, inv_id: invMap[p.id]?.id ?? '', batch_id: '', rowKey: `${p.id}_nobatch`, name: p.name ?? '-', barcode: p.barcode ?? '', image_url: p.image_url ?? null, category: p.category ?? '-', expiry_date: '', current_qty: invMap[p.id]?.qty ?? 0, counted: '' })
      } else {
        for (const b of batches) {
          rows.push({ product_id: p.id, inv_id: invMap[p.id]?.id ?? '', batch_id: b.id, rowKey: b.id, name: p.name ?? '-', barcode: p.barcode ?? '', image_url: p.image_url ?? null, category: p.category ?? '-', expiry_date: b.expiry_date, current_qty: b.qty, counted: '' })
        }
      }
    }
    setSayimRows(rows)
    setSayimLoading(false)
  }

  function handleLocChange(locId: string) {
    setSayimLocId(locId)
    setSayimRows([])
    setSavedMsg('')
    setShowDiffOnly(false)
  }

  function setCounted(rowKey: string, val: string) {
    setSayimRows(prev => prev.map(r => r.rowKey === rowKey ? { ...r, counted: val } : r))
  }

  function setExpiryDate(rowKey: string, val: string) {
    setSayimRows(prev => prev.map(r => {
      if (r.rowKey !== rowKey) return r
      // Miad girilince adet otomatik dolar (değiştirilmemiş yeni parti için)
      const autoCount = !r.batch_id && r.counted === '' && r.current_qty > 0 ? String(r.current_qty) : r.counted
      return { ...r, expiry_date: val, counted: autoCount }
    }))
  }

  function addNewBatchRow(productId: string) {
    const ref = sayimRows.find(r => r.product_id === productId)
    if (!ref) return
    const tempKey = `${productId}_new_${Date.now()}`
    const newRow = { product_id: productId, inv_id: ref.inv_id, batch_id: '', rowKey: tempKey, name: ref.name, barcode: ref.barcode, image_url: ref.image_url, category: ref.category, expiry_date: '', current_qty: 0, counted: '' }
    setSayimRows(prev => {
      let lastIdx = -1
      prev.forEach((r, i) => { if (r.product_id === productId) lastIdx = i })
      if (lastIdx === -1) return [...prev, newRow]
      const next = [...prev]
      next.splice(lastIdx + 1, 0, newRow)
      return next
    })
  }

  const matchingProductIds = new Set(
    sayimSearch
      ? sayimRows.filter(r => r.name.toLowerCase().includes(sayimSearch.toLowerCase()) || r.barcode.includes(sayimSearch)).map(r => r.product_id)
      : sayimRows.map(r => r.product_id)
  )

  const sayimFiltered = sayimRows.filter(r => {
    if (!matchingProductIds.has(r.product_id)) return false
    if (showDiffOnly) {
      const counted = parseInt(r.counted)
      if (isNaN(counted) || r.counted === '') return false
      if (r.batch_id) return counted !== r.current_qty
      return r.expiry_date !== '' && counted > 0
    }
    return true
  })

  const changedRows = sayimRows.filter(r => {
    const counted = parseInt(r.counted)
    if (isNaN(counted) || r.counted === '') return false
    if (r.batch_id) return counted !== r.current_qty
    return r.expiry_date !== '' && counted > 0
  })

  async function saveSayim() {
    if (changedRows.length === 0) return
    setSaving(true)
    setSavedMsg('')

    for (const row of changedRows) {
      const newQty = Math.max(0, parseInt(row.counted))
      const diff = newQty - row.current_qty

      if (row.batch_id) {
        await supabase.from('inventory_batches').update({ quantity: newQty }).eq('id', row.batch_id)
      } else if (row.expiry_date) {
        await supabase.from('inventory_batches').insert({ product_id: row.product_id, location_id: sayimLocId, expiry_date: row.expiry_date, quantity: newQty })
      }

      if (diff !== 0) {
        await supabase.from('stock_movements').insert({ product_id: row.product_id, from_location_id: diff < 0 ? sayimLocId : null, to_location_id: diff > 0 ? sayimLocId : null, quantity: Math.abs(diff), movement_type: 'sayim' })
      }
    }

    // Recompute inventory totals for affected products
    const affectedIds = [...new Set(changedRows.map(r => r.product_id))]
    for (const productId of affectedIds) {
      const { data: bs } = await supabase.from('inventory_batches').select('quantity').eq('product_id', productId).eq('location_id', sayimLocId)
      const total = (bs ?? []).reduce((s: number, b: any) => s + Number(b.quantity), 0)
      const invRow = sayimRows.find(r => r.product_id === productId)
      if (invRow?.inv_id) {
        await supabase.from('inventory').update({ quantity: total }).eq('id', invRow.inv_id)
      } else {
        const { data: ei } = await supabase.from('inventory').select('id').eq('product_id', productId).eq('location_id', sayimLocId).maybeSingle()
        if (ei) { await supabase.from('inventory').update({ quantity: total }).eq('id', ei.id) }
        else { await supabase.from('inventory').insert({ product_id: productId, location_id: sayimLocId, quantity: total, min_stock_alert: 5 }) }
      }
    }

    setSavedMsg(`${changedRows.length} kayıt güncellendi`)
    await fetchSayim(sayimLocId)
    setSaving(false)
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-end gap-0 mb-6 border-b border-stone-200">
        <button
          onClick={() => setTab('durum')}
          className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] border-b-2 transition-all ${tab === 'durum' ? 'border-[#F27A1A] text-[#E06010]' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
        >
          Stok Durumu
        </button>
        {isAdminMode && (
          <button
            onClick={() => setTab('sayim')}
            className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] border-b-2 transition-all ${tab === 'sayim' ? 'border-[#F27A1A] text-[#E06010]' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
          >
            Stok Sayım & Düzenleme
          </button>
        )}
      </div>

      {/* ══════════════ TAB 1: Stok Durumu ══════════════ */}
      {tab === 'durum' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-stone-900">Stok Durumu</h2>
              <p className="text-stone-400 text-sm mt-1">Tüm lokasyonların anlık stoğu</p>
            </div>
            <button onClick={fetchStok} className="bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 px-4 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-all shadow-sm">
              Yenile
            </button>
          </div>

          <div className="bg-white border border-stone-200 shadow-sm mb-5 p-4">
            <div className="flex gap-3 items-center mb-3">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm select-none">&#x2315;</span>
                <input
                  autoFocus
                  className="w-full border border-stone-200 rounded-sm pl-9 pr-10 py-3 text-sm outline-none focus:border-stone-400 transition-colors font-medium"
                  placeholder="Ürün adı veya barkod okut / yaz..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setHighlighted(null) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const matches = rows.filter(r => r.product_name.toLowerCase().includes(search.toLowerCase()) || r.barcode.includes(search))
                      if (matches.length === 1) setHighlighted(matches[0].product_id)
                    }
                    if (e.key === 'Escape') { setSearch(''); setHighlighted(null) }
                  }}
                />
                {search && <button onClick={() => { setSearch(''); setHighlighted(null) }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xl leading-none">×</button>}
              </div>
              <div className="flex border border-stone-200 rounded-sm overflow-hidden flex-shrink-0">
                <button
                  onClick={() => setSort('name')}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors ${sort === 'name' ? 'bg-[#F27A1A] text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
                >İsme Göre</button>
                <button
                  onClick={() => setSort('stock')}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors border-l border-stone-200 ${sort === 'stock' ? 'bg-[#F27A1A] text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
                >Stoğa Göre</button>
              </div>
            </div>
            <p className="text-stone-400 text-xs ml-1">Barkod okutunca otomatik arar — 1 sonuç kalırsa Enter ile seçilir</p>
          </div>

          <div className="bg-white border border-stone-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-100">
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] w-14">Görsel</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürün</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Kategori</th>
                    {locationNames.map(n => (
                      <th key={n} className="px-5 py-3.5 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center">{n}</th>
                    ))}
                    <th className="px-5 py-3.5 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center">Toplam</th>
                    <th className="px-5 py-3.5 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center">En Yakın Miad</th>
                    <th className="px-5 py-3.5 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={locationNames.length + 5} className="px-5 py-12 text-center">
                      <div className="flex items-center justify-center gap-2.5">
                        <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                        <span className="text-stone-400 text-sm">Yükleniyor...</span>
                      </div>
                    </td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={locationNames.length + 5} className="px-5 py-12 text-center text-stone-400 text-sm">Stok verisi bulunamadı</td></tr>
                  ) : filtered.map(r => {
                    const isLow = r.total <= r.min_alert && r.total > 0
                    const isEmpty = r.total === 0
                    return (
                      <tr key={r.product_id} className={`border-b border-stone-50 transition-colors ${
                        highlighted === r.product_id ? 'bg-stone-100 ring-2 ring-stone-300 ring-inset' :
                        isEmpty ? 'bg-red-50/40 hover:bg-red-50' : isLow ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-stone-50/70'
                      }`}>
                        <td className="px-5 py-3">
                          <div className="relative group w-10 h-10">
                            {r.image_url ? (
                              <>
                                <img
                                  src={r.image_url}
                                  alt={r.product_name}
                                  onClick={() => setLightbox({ url: r.image_url!, name: r.product_name })}
                                  className="w-10 h-10 rounded-sm object-cover border border-stone-100 cursor-zoom-in"
                                  onError={e => {
                                    e.currentTarget.style.display = 'none';
                                    (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                                  }}
                                />
                                <div style={{ display: 'none' }} className="w-10 h-10 rounded-sm bg-stone-100 items-center justify-center text-stone-400 text-sm font-bold">
                                  {r.product_name.charAt(0).toUpperCase()}
                                </div>
                              </>
                            ) : (
                              <div className="w-10 h-10 rounded-sm bg-stone-100 flex items-center justify-center text-stone-400 text-sm font-bold">{r.product_name.charAt(0).toUpperCase()}</div>
                            )}
                            <button onClick={() => { setEditImg({ id: r.product_id, name: r.product_name }); setEditImgUrl(r.image_url ?? '') }} className="absolute inset-0 w-10 h-10 rounded-sm bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs">Edit</button>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-stone-800">{r.product_name}</p>
                          {r.barcode && <p className="text-xs text-stone-400 font-mono mt-0.5">{r.barcode}</p>}
                        </td>
                        <td className="px-5 py-3.5 text-stone-500">{r.category}</td>
                        {locationNames.map(n => (
                          <td key={n} className="px-5 py-3.5 text-center font-semibold text-stone-700 tabular-nums">{r.locations[n] ?? 0}</td>
                        ))}
                        <td className="px-5 py-3.5 text-center font-bold text-stone-900 tabular-nums">{r.total}</td>
                        <td className="px-5 py-3.5 text-center">
                          {r.nearest_expiry ? (() => {
                            const d = Math.floor((new Date(r.nearest_expiry).getTime() - Date.now()) / 86400000)
                            return <span className={`text-xs font-semibold ${d < 0 ? 'text-red-600' : d <= 30 ? 'text-amber-600' : 'text-stone-500'}`}>
                              {d < 0 ? 'Dolmuş' : d <= 30 ? `${d} gün` : new Date(r.nearest_expiry).toLocaleDateString('tr-TR')}
                            </span>
                          })() : <span className="text-stone-300 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {isEmpty ? <span className="px-2.5 py-0.5 rounded text-xs font-semibold border border-red-200 text-red-600 bg-red-50/50">Tükendi</span>
                            : isLow ? <span className="px-2.5 py-0.5 rounded text-xs font-semibold border border-amber-200 text-amber-700 bg-amber-50/50">Düşük</span>
                            : <span className="px-2.5 py-0.5 rounded text-xs font-semibold border border-emerald-200 text-emerald-700 bg-emerald-50/50">Normal</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ══════════════ TAB 2: Stok Sayım ══════════════ */}
      {tab === 'sayim' && isAdminMode && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-stone-900">Stok Sayım & Düzenleme</h2>
              <p className="text-stone-400 text-sm mt-1">Lokasyon seçin, sayılan miktarı girin, kaydedin</p>
            </div>
          </div>

          {/* Location + controls */}
          <div className="bg-white border border-stone-200 shadow-sm p-4 mb-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] flex-shrink-0">Lokasyon</label>
                <select
                  value={sayimLocId}
                  onChange={e => handleLocChange(e.target.value)}
                  className="border border-stone-200 rounded-sm px-3.5 py-2 text-sm outline-none focus:border-stone-400 transition-colors text-stone-700 bg-white"
                >
                  <option value="">Seçin...</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <button
                onClick={() => fetchSayim(sayimLocId)}
                disabled={!sayimLocId || sayimLoading}
                className="bg-[#F27A1A] hover:bg-[#E06010] disabled:opacity-40 text-white px-4 py-2 rounded-sm text-[11px] tracking-[0.2em] uppercase font-medium transition-all"
              >
                {sayimLoading ? 'Yükleniyor...' : 'Sayımı Başlat'}
              </button>

              {sayimRows.length > 0 && (
                <>
                  <div className="relative flex-1 min-w-48">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm select-none">&#x2315;</span>
                    <input
                      className="w-full border border-stone-200 rounded-sm pl-8 pr-3 py-2 text-sm outline-none focus:border-stone-400 transition-colors"
                      placeholder="Ürün ara..."
                      value={sayimSearch}
                      onChange={e => setSayimSearch(e.target.value)}
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showDiffOnly}
                      onChange={e => setShowDiffOnly(e.target.checked)}
                      className="rounded accent-stone-900"
                    />
                    <span className="text-xs font-medium text-stone-600">Sadece Farkları Göster</span>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Save bar */}
          {changedRows.length > 0 && (
            <div className="flex items-center justify-between bg-[#F27A1A] text-white px-5 py-3.5 mb-4 rounded-sm">
              <div>
                <p className="text-sm font-semibold">{changedRows.length} üründe değişiklik var</p>
                <p className="text-stone-400 text-xs mt-0.5">Kaydetmeden sayfadan çıkarsanız değişiklikler kaybolur</p>
              </div>
              <button
                onClick={saveSayim}
                disabled={saving}
                className="bg-white text-stone-900 hover:bg-stone-100 disabled:opacity-50 px-5 py-2 rounded-sm text-[11px] tracking-[0.2em] uppercase font-semibold transition-all"
              >
                {saving ? 'Kaydediliyor...' : `${changedRows.length} Ürünü Kaydet`}
              </button>
            </div>
          )}

          {savedMsg && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-sm mb-4 text-sm font-medium">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              {savedMsg} — stok hareketleri kaydedildi
            </div>
          )}

          {/* Sayım table */}
          {sayimRows.length > 0 && (
            <div className="bg-white border border-stone-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">
                  {locations.find(l => l.id === sayimLocId)?.name} — {sayimFiltered.length} ürün gösteriliyor
                </p>
                <p className="text-[10px] text-stone-400">Sistem = mevcut kayıtlı miktar · Sayılan = gerçek sayılan</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-100">
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] w-10">#</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] w-12">Görsel</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürün</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center w-36">Miad Tarihi</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center w-20">Sistem</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center w-28">Sayılan</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center w-20">Fark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const result: React.ReactNode[] = []
                      let productIdx = 0
                      let lastProductId = ''
                      sayimFiltered.forEach((row, idx) => {
                        const isFirst = row.product_id !== lastProductId
                        if (isFirst) { lastProductId = row.product_id; productIdx++ }
                        const countedNum = parseInt(row.counted)
                        const hasCounted = row.counted !== '' && !isNaN(countedNum)
                        const diff = hasCounted ? countedNum - row.current_qty : null
                        const hasChange = diff !== null && diff !== 0
                        const expiryDays = row.expiry_date ? Math.floor((new Date(row.expiry_date).getTime() - Date.now()) / 86400000) : null
                        result.push(
                          <tr key={row.rowKey} className={`border-b border-stone-50 transition-colors ${hasChange ? diff! > 0 ? 'bg-emerald-50/50' : 'bg-red-50/50' : 'hover:bg-stone-50/60'}`}>
                            <td className="px-4 py-3 text-stone-400 text-xs tabular-nums">{isFirst ? productIdx : ''}</td>
                            <td className="px-4 py-3">
                              {isFirst ? (
                                row.image_url ? (
                                  <>
                                    <img src={row.image_url} alt={row.name} className="w-9 h-9 object-contain rounded-sm border border-stone-100"
                                      onError={e => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex' }} />
                                    <div style={{ display: 'none' }} className="w-9 h-9 rounded-sm bg-stone-100 items-center justify-center text-stone-400 text-xs font-bold">{row.name.charAt(0).toUpperCase()}</div>
                                  </>
                                ) : (
                                  <div className="w-9 h-9 rounded-sm bg-stone-100 flex items-center justify-center text-stone-400 text-xs font-bold">{row.name.charAt(0).toUpperCase()}</div>
                                )
                              ) : null}
                            </td>
                            <td className="px-4 py-3.5">
                              {isFirst ? (
                                <>
                                  <p className="font-semibold text-stone-800 text-sm">{row.name}</p>
                                  {row.barcode && <p className="text-xs text-stone-400 font-mono mt-0.5">{row.barcode}</p>}
                                  <p className="text-[10px] text-stone-400">{row.category}</p>
                                </>
                              ) : <span className="text-stone-300 text-xs ml-2">↳</span>}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {row.batch_id ? (
                                <span className={`text-xs font-semibold tabular-nums ${expiryDays !== null && expiryDays < 0 ? 'text-red-600' : expiryDays !== null && expiryDays <= 30 ? 'text-amber-600' : 'text-stone-600'}`}>
                                  {row.expiry_date ? new Date(row.expiry_date).toLocaleDateString('tr-TR') : '—'}
                                  {expiryDays !== null && expiryDays >= 0 && expiryDays <= 30 && <span className="block text-[10px]">{expiryDays} gün</span>}
                                  {expiryDays !== null && expiryDays < 0 && <span className="block text-[10px]">Süresi dolmuş</span>}
                                </span>
                              ) : (
                                <input type="date" value={row.expiry_date} onChange={e => setExpiryDate(row.rowKey, e.target.value)}
                                  className="w-32 text-center text-xs border border-stone-200 rounded-sm px-2 py-1.5 outline-none focus:border-stone-400 transition-colors" />
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="text-base font-bold text-stone-700 tabular-nums">{row.current_qty}</span>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <input type="number" min="0" value={row.counted} onChange={e => setCounted(row.rowKey, e.target.value)} placeholder="—"
                                className={`w-20 text-center text-sm font-bold border rounded-sm px-2 py-2 outline-none transition-colors tabular-nums ${hasChange ? diff! > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900' : 'border-stone-200 bg-white text-stone-900 focus:border-stone-400'}`} />
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {diff === null ? <span className="text-stone-300 text-sm">—</span>
                                : diff === 0 ? <span className="text-stone-400 text-xs font-medium">Eşit</span>
                                : <span className={`text-sm font-bold tabular-nums ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{diff > 0 ? '+' : ''}{diff}</span>}
                            </td>
                          </tr>
                        )
                        const isLast = idx === sayimFiltered.length - 1 || sayimFiltered[idx + 1].product_id !== row.product_id
                        if (isLast) {
                          result.push(
                            <tr key={`${row.product_id}_add`} className="border-b border-stone-100">
                              <td colSpan={2} />
                              <td colSpan={5} className="px-4 py-1.5">
                                <button onClick={() => addNewBatchRow(row.product_id)} className="text-[11px] text-stone-400 hover:text-stone-700 font-medium transition-colors tracking-wide">
                                  + Yeni Parti Ekle
                                </button>
                              </td>
                            </tr>
                          )
                        }
                      })
                      return result
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Bottom save bar */}
              <div className="px-5 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
                <p className="text-xs text-stone-400">
                  {changedRows.length > 0
                    ? <span className="font-semibold text-stone-700">{changedRows.length} üründe değişiklik var</span>
                    : 'Henüz değişiklik yok'}
                </p>
                <button
                  onClick={saveSayim}
                  disabled={saving || changedRows.length === 0}
                  className="bg-[#F27A1A] hover:bg-[#E06010] disabled:opacity-40 text-white px-6 py-2.5 rounded-sm text-[11px] tracking-[0.2em] uppercase font-semibold transition-all"
                >
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          )}

          {sayimRows.length === 0 && !sayimLoading && sayimLocId && (
            <div className="bg-white border border-stone-200 shadow-sm px-5 py-16 text-center">
              <p className="text-stone-400 text-sm">Bu lokasyonda stok kaydı bulunamadı</p>
            </div>
          )}
        </>
      )}

      {/* Edit Image Modal */}
      {editImg && (
        <div className="fixed inset-0 bg-stone-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-sm p-6 shadow-lg">
            <h3 className="text-base font-bold text-stone-900 mb-1">Görseli Değiştir</h3>
            <p className="text-stone-400 text-xs mb-4 truncate">{editImg.name}</p>
            <label className="block w-full border-2 border-dashed border-stone-200 hover:border-stone-400 rounded p-5 text-center cursor-pointer transition-colors group mb-3">
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFileUpload(f) }} />
              <p className="text-sm font-semibold text-stone-600 group-hover:text-stone-900 transition-colors">Dosya seç veya sürükle</p>
              <p className="text-xs text-stone-400 mt-0.5">JPG, PNG, WEBP</p>
            </label>
            {editImgUrl && (
              <img src={editImgUrl} alt="önizleme" className="w-full max-h-44 object-contain rounded-sm border border-stone-100 mb-3"
                onError={e => (e.currentTarget.style.display = 'none')} onLoad={e => (e.currentTarget.style.display = 'block')} />
            )}
            <div className="flex gap-2">
              <button onClick={() => saveEditImg()} className="flex-1 bg-[#F27A1A] hover:bg-[#E06010] text-white py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">Kaydet</button>
              <button onClick={() => saveEditImg(true)} className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2.5 rounded text-xs font-semibold transition-colors">Sil</button>
              <button onClick={() => setEditImg(null)} className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2.5 rounded text-xs font-semibold transition-colors">İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <div className="bg-white rounded border border-stone-200 shadow-lg max-w-sm w-full p-5 flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.name} className="w-full max-h-72 object-contain rounded-sm" />
            <p className="text-stone-800 font-semibold text-sm text-center">{lightbox.name}</p>
            <button onClick={() => setLightbox(null)} className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-6 py-2.5 rounded text-xs font-semibold transition-colors">Kapat</button>
          </div>
        </div>
      )}
    </div>
  )
}
