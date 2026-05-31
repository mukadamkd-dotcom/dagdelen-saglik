'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useMode } from '@/contexts/ModeContext'

function formatMiad(s: string) {
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

interface StokData {
  locations: { id: string; name: string }[]
  products: { id: string; name: string; barcode: string; category: string; unit: string; image_url: string | null }[]
  inventory: { product_id: string; location_id: string; quantity: number; min_stock_alert: number }[]
  miadData: { product_id: string; to_location_id: string | null; notes: string; quantity: number }[]
}

interface StokRow {
  product_id: string; product_name: string; image_url: string | null; barcode: string
  category: string; unit: string; locations: Record<string, number>; total: number
  min_alert: number; nearest_expiry: string | null; expiry_details: { expiry_date: string; quantity: number }[]
}

interface SayimRow {
  rowKey: string; product_id: string; name: string; barcode: string
  image_url: string | null; category: string; expiry_date: string
  current_qty: number; counted: string; isExtra: boolean
}

export default function StokPage() {
  const { isAdminMode, cashierLocationId, cashierLocationName } = useMode()
  const [tab, setTab] = useState<'durum' | 'sayim'>('durum')
  const [stokData, setStokData] = useState<StokData | null>(null)
  const [loading, setLoading] = useState(true)

  // Durum tab
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'name' | 'stock'>('name')
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)
  const [editImg, setEditImg] = useState<{ id: string; name: string } | null>(null)
  const [editImgUrl, setEditImgUrl] = useState('')

  // Sayım tab
  const [sayimLocId, setSayimLocId] = useState('')
  const [sayimRows, setSayimRows] = useState<SayimRow[]>([])
  const [sayimSearch, setSayimSearch] = useState('')
  const [showDiffOnly, setShowDiffOnly] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  // Stok sıfırla modal
  const [resetModal, setResetModal] = useState<{ productId: string; productName: string } | null>(null)
  const [resetLocId, setResetLocId] = useState('')
  const [resetting, setResetting] = useState(false)

  // Yeni ürün modal
  const emptyNew = { name: '', barcode: '', standard_price: '' }
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [newProduct, setNewProduct] = useState(emptyNew)
  const [savingNew, setSavingNew] = useState(false)

  useEffect(() => { fetchStok() }, [])
  useEffect(() => {
    if (!isAdminMode && cashierLocationId) setSayimLocId(cashierLocationId)
  }, [isAdminMode, cashierLocationId])

  // Stok yüklenince kasiyer UUID'sini doğrula
  useEffect(() => {
    if (!isAdminMode && stokData && cashierLocationId) {
      const valid = stokData.locations.find(l => l.id === cashierLocationId)
      if (!valid) setSayimLocId('')
    }
  }, [stokData, isAdminMode, cashierLocationId])
  // Stok Durumu sekmesine geçilince taze veri çek
  useEffect(() => {
    if (tab === 'durum') fetchStok()
  }, [tab])

  // ── Veri çekme (server-side, supabaseAdmin) ──────────────

  async function fetchStok(): Promise<StokData | null> {
    setLoading(true)
    try {
      const res = await fetch('/api/stok-data')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setStokData(json)
      setLoading(false)
      return json as StokData
    } catch (e: any) {
      console.error('Stok veri hatası:', e.message)
      setLoading(false)
      return null
    }
  }

  // ── Stok Durumu hesaplama ─────────────────────────────────

  const { stokRows, locationNames } = useMemo(() => {
    if (!stokData) return { stokRows: [] as StokRow[], locationNames: [] as string[] }
    const { locations, products, inventory, miadData } = stokData

    const locNameMap: Record<string, string> = {}
    locations.forEach(l => { locNameMap[l.id] = l.name })

    // inventory: pid → locId → { qty, minAlert }
    const invMap: Record<string, Record<string, { qty: number; minAlert: number }>> = {}
    inventory.forEach(r => {
      if (!invMap[r.product_id]) invMap[r.product_id] = {}
      invMap[r.product_id][r.location_id] = { qty: Number(r.quantity), minAlert: Number(r.min_stock_alert ?? 5) }
    })

    // miadDetails: pid → [{ expiry_date, quantity }] — en son kayıt, expiry bazında tekilleştirilmiş
    const miadDetailsMap: Record<string, { expiry_date: string; quantity: number }[]> = {}
    const seenPE = new Set<string>()
    // miadLocMap fallback: pid → locId → expiry → qty
    const miadLocMap: Record<string, Record<string, Record<string, number>>> = {}
    const seenPLE = new Set<string>()

    miadData.forEach(m => {
      const expiry = m.notes.replace('SAYIM_MIAD:', '')
      const peKey = `${m.product_id}|${expiry}`
      if (!seenPE.has(peKey)) {
        seenPE.add(peKey)
        if (!miadDetailsMap[m.product_id]) miadDetailsMap[m.product_id] = []
        miadDetailsMap[m.product_id].push({ expiry_date: expiry, quantity: Number(m.quantity) })
      }
      if (m.to_location_id) {
        const pleKey = `${m.product_id}|${m.to_location_id}|${expiry}`
        if (!seenPLE.has(pleKey)) {
          seenPLE.add(pleKey)
          if (!miadLocMap[m.product_id]) miadLocMap[m.product_id] = {}
          if (!miadLocMap[m.product_id][m.to_location_id]) miadLocMap[m.product_id][m.to_location_id] = {}
          miadLocMap[m.product_id][m.to_location_id][expiry] = Number(m.quantity)
        }
      }
    })
    Object.values(miadDetailsMap).forEach(arr => arr.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)))

    const rows: StokRow[] = products.map(p => {
      const locInv = invMap[p.id] ?? {}
      const locs: Record<string, number> = {}
      let total = 0; let minAlert = 5

      for (const [locId, { qty, minAlert: ma }] of Object.entries(locInv)) {
        const n = locNameMap[locId]
        if (n) { locs[n] = qty; total += qty; minAlert = ma }
      }

      // inventory 0 → SAYIM_MIAD fallback (lokasyon bazında)
      if (total === 0 && miadLocMap[p.id]) {
        for (const [locId, expiryMap] of Object.entries(miadLocMap[p.id])) {
          const n = locNameMap[locId]
          if (!n) continue
          const locTotal = Object.values(expiryMap).reduce((s, q) => s + q, 0)
          if (locTotal > 0) { locs[n] = (locs[n] ?? 0) + locTotal; total += locTotal }
        }
      }

      return {
        product_id: p.id, product_name: p.name ?? '-', image_url: p.image_url ?? null,
        barcode: p.barcode ?? '', category: p.category ?? '-', unit: p.unit ?? 'adet',
        locations: locs, total, min_alert: minAlert,
        nearest_expiry: miadDetailsMap[p.id]?.[0]?.expiry_date ?? null,
        expiry_details: miadDetailsMap[p.id] ?? [],
      }
    })

    return { stokRows: rows, locationNames: locations.map(l => l.name) }
  }, [stokData])

  const filtered = stokRows
    .filter(r => r.product_name.toLowerCase().includes(search.toLowerCase()) || r.barcode.includes(search) || r.category.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === 'stock' ? b.total - a.total : a.product_name.localeCompare(b.product_name, 'tr'))

  // ── Stok Sayım ────────────────────────────────────────────

  function startSayim(data?: StokData) {
    const d = data ?? stokData
    if (!sayimLocId || !d) return
    // Şube UUID doğrulaması — eski/geçersiz UUID ise uyar
    const validLoc = d.locations.find(l => l.id === sayimLocId)
    if (!validLoc) {
      alert('⚠️ Şube bilginiz güncel değil!\n\nSol menüden "Şube Değiştir"e basıp şubenizi yeniden seçin.')
      return
    }
    const { products, inventory, miadData } = d

    const invForLoc: Record<string, number> = {}
    inventory.forEach(r => { if (r.location_id === sayimLocId) invForLoc[r.product_id] = Number(r.quantity) })

    const miadForLoc: Record<string, { expiry_date: string; quantity: number }[]> = {}
    const seen = new Set<string>()
    miadData.forEach(m => {
      if (m.to_location_id !== sayimLocId) return
      const expiry = m.notes.replace('SAYIM_MIAD:', '')
      const key = `${m.product_id}|${expiry}`
      if (!seen.has(key)) {
        seen.add(key)
        if (!miadForLoc[m.product_id]) miadForLoc[m.product_id] = []
        miadForLoc[m.product_id].push({ expiry_date: expiry, quantity: Number(m.quantity) })
      }
    })

    const rows: SayimRow[] = []
    for (const p of products) {
      const currentQty = invForLoc[p.id] ?? 0
      const miads = miadForLoc[p.id] ?? []

      if (miads.length <= 1) {
        rows.push({
          rowKey: `${p.id}_main`, product_id: p.id, name: p.name ?? '-',
          barcode: p.barcode ?? '', image_url: p.image_url ?? null, category: p.category ?? '-',
          expiry_date: miads[0]?.expiry_date ?? '', current_qty: currentQty, counted: '', isExtra: false,
        })
      } else {
        miads.forEach((miad, idx) => {
          rows.push({
            rowKey: `${p.id}_miad_${miad.expiry_date}`, product_id: p.id, name: p.name ?? '-',
            barcode: p.barcode ?? '', image_url: p.image_url ?? null, category: p.category ?? '-',
            expiry_date: miad.expiry_date, current_qty: idx === 0 ? currentQty : 0, counted: '', isExtra: false,
          })
        })
      }
    }

    setSayimRows(rows)
    setSavedMsg('')
    setShowDiffOnly(false)
    setTimeout(() => {
      const searchEl = document.querySelector<HTMLInputElement>('input[placeholder*="barkod"]')
      if (searchEl) searchEl.focus()
    }, 100)
  }

  function handleLocChange(locId: string) {
    setSayimLocId(locId)
    setSayimRows([])
    setSavedMsg('')
  }

  function setCounted(rowKey: string, val: string) {
    setSayimRows(prev => prev.map(r => r.rowKey === rowKey ? { ...r, counted: val } : r))
  }

  function setExpiryDate(rowKey: string, val: string) {
    setSayimRows(prev => prev.map(r => {
      if (r.rowKey !== rowKey) return r
      return { ...r, expiry_date: val }
    }))
    // Sadece geçerli (tam) tarih girilince sayım alanına odaklan
    const isValid = val.length === 10 && new Date(val).getFullYear() > 2000
    if (isValid) {
      setTimeout(() => {
        const inp = document.getElementById(`cnt-${rowKey}`) as HTMLInputElement | null
        if (inp) { inp.focus(); inp.select() }
      }, 50)
    }
  }

  function addNewBatchRow(productId: string) {
    const ref = sayimRows.find(r => r.product_id === productId)
    if (!ref) return
    const key = `${productId}_extra_${Date.now()}`
    const newRow: SayimRow = {
      rowKey: key, product_id: productId, name: ref.name, barcode: ref.barcode,
      image_url: ref.image_url, category: ref.category, expiry_date: '',
      current_qty: 0, counted: '', isExtra: true,
    }
    setSayimRows(prev => {
      let lastIdx = -1
      prev.forEach((r, i) => { if (r.product_id === productId) lastIdx = i })
      const next = [...prev]
      next.splice(lastIdx + 1, 0, newRow)
      return next
    })
  }

  const changedRows = sayimRows.filter(r => r.counted !== '' && !isNaN(parseInt(r.counted)))

  const matchingIds = new Set(
    sayimSearch
      ? sayimRows.filter(r => r.name.toLowerCase().includes(sayimSearch.toLowerCase()) || r.barcode.includes(sayimSearch)).map(r => r.product_id)
      : sayimRows.map(r => r.product_id)
  )
  const sayimFiltered = sayimRows.filter(r => {
    if (!matchingIds.has(r.product_id)) return false
    if (showDiffOnly) {
      const cnt = parseInt(r.counted)
      return !isNaN(cnt) && r.counted !== '' && cnt !== r.current_qty
    }
    return true
  })

  async function saveSayim() {
    if (changedRows.length === 0 || !sayimLocId) return
    setSaving(true)

    const allByProduct: Record<string, SayimRow[]> = {}
    sayimRows.forEach(r => {
      if (!allByProduct[r.product_id]) allByProduct[r.product_id] = []
      allByProduct[r.product_id].push(r)
    })

    const changedProductIds = [...new Set(changedRows.map(r => r.product_id))]
    const changedItems = changedProductIds.map(pid => {
      const allRows = allByProduct[pid] ?? []
      let totalQty: number
      if (!isAdminMode) {
        // Kasiyer: mevcut stoğa ekle (ADD modu)
        const baseQty = allRows.reduce((sum, r) => sum + r.current_qty, 0)
        const addedQty = changedRows.filter(r => r.product_id === pid).reduce((sum, r) => sum + Math.max(0, parseInt(r.counted) || 0), 0)
        totalQty = baseQty + addedQty
      } else {
        // Admin: sayılan değere eşitle (SET modu)
        totalQty = allRows.reduce((sum, r) => {
          const cnt = parseInt(r.counted)
          return sum + Math.max(0, isNaN(cnt) ? r.current_qty : cnt)
        }, 0)
      }
      const miadRows = changedRows
        .filter(r => r.product_id === pid && r.expiry_date)
        .map(r => ({ expiry_date: r.expiry_date, qty: Math.max(0, parseInt(r.counted) || 0) }))
      return { productId: pid, productName: allRows[0]?.name ?? pid, totalQty, miadRows }
    })

    let results: string[] = []
    let errorMsg = ''
    try {
      const res = await fetch('/api/save-sayim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sayimLocId, changedItems }),
      })
      const data = await res.json()
      results = data.results ?? []
      if (data.errors?.length > 0) errorMsg = data.errors.join(' | ')
    } catch (e: any) {
      errorMsg = e.message
    }

    const freshData = await fetchStok()
    if (freshData) startSayim(freshData)
    if (errorMsg) {
      setSaving(false)
      alert(`Kayıt hatası:\n${errorMsg}`)
      setSavedMsg(`❌ Hata — ${errorMsg}`)
    } else {
      setSavedMsg(`✓ Kaydedildi: ${results.join(' · ')}`)
      setSaving(false)
    }
  }

  // ── Kasiyer otomatik kayıt (tek satır, ADD modu) ─────────

  async function saveSingleRow(row: SayimRow) {
    if (!sayimLocId || row.counted === '' || isNaN(parseInt(row.counted))) return
    const addedQty = Math.max(0, parseInt(row.counted) || 0)
    if (addedQty === 0) return
    const baseQty = sayimRows.filter(r => r.product_id === row.product_id).reduce((sum, r) => sum + r.current_qty, 0)
    const totalQty = baseQty + addedQty
    const isValidMiad = (d: string) => d.length === 10 && new Date(d).getFullYear() > 2000
    const miadRows = isValidMiad(row.expiry_date) ? [{ expiry_date: row.expiry_date, qty: addedQty }] : []
    try {
      const res = await fetch('/api/save-sayim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sayimLocId, changedItems: [{ productId: row.product_id, productName: row.name, totalQty, miadRows }] }),
      })
      const data = await res.json()
      if (data.errors?.length > 0) { alert(`Hata: ${data.errors.join(' | ')}`); return }
      setSavedMsg(`✓ ${cashierLocationName}: ${row.name} +${addedQty} eklendi → toplam ${totalQty}`)
      setSayimRows(prev => {
        const firstKey = prev.find(r => r.product_id === row.product_id)?.rowKey
        return prev.map(r => {
          if (r.product_id !== row.product_id) return r
          return { ...r, counted: '', current_qty: r.rowKey === firstKey ? totalQty : r.current_qty }
        })
      })
      // Stok Durumu sekmesini anlık güncelle (fetchStok çağırmadan, eski veriyle ezilmesin)
      setStokData(prev => {
        if (!prev) return prev
        const exists = prev.inventory.some(i => i.product_id === row.product_id && i.location_id === sayimLocId)
        const newInv = exists
          ? prev.inventory.map(i => i.product_id === row.product_id && i.location_id === sayimLocId ? { ...i, quantity: totalQty } : i)
          : [...prev.inventory, { product_id: row.product_id, location_id: sayimLocId, quantity: totalQty, min_stock_alert: 5 }]
        return { ...prev, inventory: newInv }
      })
    } catch (e: any) { alert('Hata: ' + e.message) }
  }

  // saveSingleRow'da fetchStok çağrılmıyor — Stok Durumu sekmesine geçince zaten yenileniyor

  // ── Stok sıfırla ─────────────────────────────────────────

  function openResetModal(productId: string, productName: string) {
    const defaultLoc = isAdminMode ? (stokData?.locations[0]?.id ?? '') : (cashierLocationId ?? '')
    setResetLocId(defaultLoc)
    setResetModal({ productId, productName })
  }

  async function resetStock() {
    if (!resetModal) return
    const locId = isAdminMode ? resetLocId : cashierLocationId
    if (!locId) return
    setResetting(true)
    try {
      const res = await fetch('/api/reset-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: resetModal.productId, locationId: locId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResetModal(null)
      await fetchStok()
    } catch (e: any) {
      alert('Hata: ' + e.message)
    }
    setResetting(false)
  }

  // ── Görsel düzenleme ──────────────────────────────────────

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

  // ── Yeni ürün ─────────────────────────────────────────────

  async function saveNewProduct() {
    const { name, barcode, standard_price } = newProduct
    if (!name || !standard_price) return alert('Ürün adı ve satış fiyatı zorunludur.')
    setSavingNew(true)
    try {
      if (barcode.trim()) {
        const { data: ex } = await supabase.from('products').select('name').eq('barcode', barcode.trim()).maybeSingle()
        if (ex) throw new Error(`Bu barkod zaten "${ex.name}" ürününe ait.`)
      }
      const price = Number(standard_price)
      const { error } = await supabase.from('products').insert({
        name, barcode: barcode.trim() || null, unit: 'adet',
        purchase_price: 0, standard_price: price, min_sale_price: price, is_active: true,
      })
      if (error) throw new Error(error.message)
      setShowNewProduct(false)
      setNewProduct(emptyNew)
      await fetchStok()
    } catch (e: any) { alert('Hata: ' + e.message) }
    setSavingNew(false)
  }

  // ── Excel ─────────────────────────────────────────────────

  function downloadExcel() {
    const myLocName = cashierLocationName ?? (cashierLocationId ? stokData?.locations.find(l => l.id === cashierLocationId)?.name : null)
    const BOM = '﻿'; const sep = ';'
    function toCSV(headers: string[], data: (string | number)[][], filename: string) {
      const rows = [headers, ...data].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(sep))
      const blob = new Blob([BOM + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
    const dateStr = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')
    if (!isAdminMode && myLocName) {
      toCSV(['Sıra', 'Ürün Adı', 'Barkod', 'Kategori', 'Birim', `${myLocName} Stok`, 'Sayılan', 'Fark'],
        filtered.map((r, i) => [i + 1, r.product_name, r.barcode || '', r.category, r.unit, r.locations[myLocName] ?? 0, '', '']),
        `stok-${myLocName}-${dateStr}.csv`)
    } else {
      toCSV(['Sıra', 'Ürün Adı', 'Barkod', 'Kategori', 'Birim', ...locationNames.map(n => n + ' Stok'), 'Toplam'],
        filtered.map((r, i) => [i + 1, r.product_name, r.barcode || '', r.category, r.unit, ...locationNames.map(n => r.locations[n] ?? 0), r.total]),
        `stok-tum-${dateStr}.csv`)
    }
  }

  // ── JSX ───────────────────────────────────────────────────

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-end gap-0 mb-6 border-b border-stone-200">
        {(['durum', 'sayim'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] border-b-2 transition-all ${tab === t ? 'border-[#7C3AED] text-[#6D28D9]' : 'border-transparent text-stone-400 hover:text-stone-600'}`}>
            {t === 'durum' ? 'Stok Durumu' : 'Stok Sayım & Düzenleme'}
          </button>
        ))}
      </div>

      {/* ══ TAB 1: Stok Durumu ══ */}
      {tab === 'durum' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-stone-900">Stok Durumu</h2>
              <p className="text-stone-400 text-sm mt-1">
                Tüm lokasyonların anlık stoğu
                {!loading && stokData && (
                  <span className="font-mono text-xs ml-2 text-stone-300">
                    {stokRows.length} ürün · {stokRows.filter(r => r.total > 0).length} adette stok var
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={downloadExcel} disabled={loading || stokRows.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-all shadow-sm flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Excel İndir
              </button>
              <button onClick={fetchStok}
                className="bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 px-4 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-all shadow-sm">
                Yenile
              </button>
            </div>
          </div>

          <div className="bg-white border border-stone-200 shadow-sm mb-5 p-4">
            <div className="flex gap-3 items-center mb-3">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm select-none">⌕</span>
                <input autoFocus
                  className="w-full border border-stone-200 rounded-sm pl-9 pr-10 py-3 text-sm outline-none focus:border-stone-400 transition-colors font-medium"
                  placeholder="Ürün adı veya barkod..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setHighlighted(null) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const m = stokRows.filter(r => r.product_name.toLowerCase().includes(search.toLowerCase()) || r.barcode.includes(search))
                      if (m.length === 1) setHighlighted(m[0].product_id)
                    }
                    if (e.key === 'Escape') { setSearch(''); setHighlighted(null) }
                  }} />
                {search && <button onClick={() => { setSearch(''); setHighlighted(null) }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xl leading-none">×</button>}
              </div>
              <div className="flex border border-stone-200 rounded-sm overflow-hidden flex-shrink-0">
                {(['name', 'stock'] as const).map(s => (
                  <button key={s} onClick={() => setSort(s)}
                    className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors ${s !== 'name' ? 'border-l border-stone-200' : ''} ${sort === s ? 'bg-[#7C3AED] text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
                    {s === 'name' ? 'İsme Göre' : 'Stoğa Göre'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-stone-400 text-xs ml-1">Barkod okutunca otomatik arar — 1 sonuç kalırsa Enter ile seçilir</p>
          </div>

          <div className="bg-white border border-stone-200 shadow-sm overflow-x-auto">
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
                  <th className="px-5 py-3.5 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center w-16"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={locationNames.length + 6} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                      <span className="text-stone-400 text-sm">Yükleniyor...</span>
                    </div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={locationNames.length + 6} className="px-5 py-12 text-center text-stone-400 text-sm">Stok verisi bulunamadı</td></tr>
                ) : filtered.map(r => {
                  const isLow = r.total <= r.min_alert && r.total > 0
                  const isEmpty = r.total === 0
                  return (
                    <tr key={r.product_id} className={`border-b border-stone-50 transition-colors ${highlighted === r.product_id ? 'bg-stone-100 ring-2 ring-stone-300 ring-inset' : isEmpty ? 'bg-red-50/40 hover:bg-red-50' : isLow ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-stone-50/70'}`}>
                      <td className="px-5 py-3">
                        <div className="relative group w-10 h-10">
                          {r.image_url ? (
                            <>
                              <img src={r.image_url} alt={r.product_name} onClick={() => setLightbox({ url: r.image_url!, name: r.product_name })}
                                className="w-10 h-10 rounded-sm object-cover border border-stone-100 cursor-zoom-in"
                                onError={e => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex' }} />
                              <div style={{ display: 'none' }} className="w-10 h-10 rounded-sm bg-stone-100 items-center justify-center text-stone-400 text-sm font-bold">
                                {r.product_name.charAt(0).toUpperCase()}
                              </div>
                            </>
                          ) : (
                            <div className="w-10 h-10 rounded-sm bg-stone-100 flex items-center justify-center text-stone-400 text-sm font-bold">{r.product_name.charAt(0).toUpperCase()}</div>
                          )}
                          <button onClick={() => { setEditImg({ id: r.product_id, name: r.product_name }); setEditImgUrl(r.image_url ?? '') }}
                            className="absolute inset-0 w-10 h-10 rounded-sm bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs">Edit</button>
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
                      <td className="px-5 py-3.5 text-center">
                        <span className="font-bold text-stone-900 tabular-nums">{r.total}</span>
                        {r.expiry_details.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {r.expiry_details.map(e => (
                              <p key={e.expiry_date} className="text-[11px] text-stone-400 tabular-nums whitespace-nowrap leading-tight">
                                {e.quantity} adet {formatMiad(e.expiry_date)}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {r.nearest_expiry ? (() => {
                          const d = Math.floor((new Date(r.nearest_expiry).getTime() - Date.now()) / 86400000)
                          return <span className={`text-xs font-semibold ${d < 0 ? 'text-red-600' : d <= 30 ? 'text-amber-600' : 'text-stone-500'}`}>
                            {d < 0 ? 'Dolmuş' : d <= 30 ? `${d} gün` : new Date(r.nearest_expiry).toLocaleDateString('tr-TR')}
                          </span>
                        })() : <span className="text-stone-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {isEmpty
                          ? <span className="px-2.5 py-0.5 rounded text-xs font-semibold border border-red-200 text-red-600 bg-red-50/50">Tükendi</span>
                          : isLow ? <span className="px-2.5 py-0.5 rounded text-xs font-semibold border border-amber-200 text-amber-700 bg-amber-50/50">Düşük</span>
                            : <span className="px-2.5 py-0.5 rounded text-xs font-semibold border border-emerald-200 text-emerald-700 bg-emerald-50/50">Normal</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {(isAdminMode || (cashierLocationName && (r.locations[cashierLocationName] ?? 0) > 0)) && (
                          <button
                            onClick={() => openResetModal(r.product_id, r.product_name)}
                            title="Stoğu sıfırla"
                            className="text-stone-300 hover:text-red-500 transition-colors"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" />
                              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══ TAB 2: Stok Sayım ══ */}
      {tab === 'sayim' && (
        <>
          {/* Stale UUID uyarısı */}
          {!isAdminMode && stokData && cashierLocationId && !stokData.locations.find(l => l.id === cashierLocationId) && (
            <div className="mb-4 px-4 py-3 rounded-sm flex items-center gap-3" style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5' }}>
              <span className="text-red-600 text-lg">⚠️</span>
              <div>
                <p className="text-red-700 font-bold text-sm">Şube bilgisi geçersiz</p>
                <p className="text-red-600 text-xs mt-0.5">Sol menüden <strong>Şube Değiştir</strong>'e basıp Eczane'yi yeniden seçin. Aksi hâlde stok kaydedilmez.</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-stone-900">Stok Sayım & Düzenleme</h2>
              <p className="text-stone-400 text-sm mt-1">
                Sayım kaydedilecek şube:&nbsp;
                <span className="font-bold text-[#7C3AED]">
                  {isAdminMode ? (stokData?.locations.find(l => l.id === sayimLocId)?.name ?? '—') : (cashierLocationName ?? '—')}
                </span>
              </p>
            </div>
          </div>

          <div className="bg-white border border-stone-200 shadow-sm p-4 mb-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] flex-shrink-0">Lokasyon</label>
                {isAdminMode ? (
                  <select value={sayimLocId} onChange={e => handleLocChange(e.target.value)}
                    className="border border-stone-200 rounded-sm px-3.5 py-2 text-sm outline-none focus:border-stone-400 text-stone-700 bg-white">
                    <option value="">Seçin...</option>
                    {stokData?.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                ) : (
                  <span className="border border-[#7C3AED] rounded-sm px-3.5 py-2 text-sm text-[#6D28D9] bg-purple-50 font-bold">{cashierLocationName}</span>
                )}
              </div>

              <button onClick={() => startSayim()} disabled={!sayimLocId || loading}
                className="bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 text-white px-4 py-2 rounded-sm text-[11px] tracking-[0.2em] uppercase font-medium transition-all">
                Sayımı Başlat
              </button>

              <button onClick={() => setShowNewProduct(true)} disabled={!sayimLocId}
                className="bg-white border border-stone-200 hover:bg-stone-50 disabled:opacity-40 text-stone-700 px-4 py-2 rounded-sm text-[11px] tracking-[0.2em] uppercase font-medium transition-all">
                + Yeni Ürün Ekle
              </button>

              {sayimRows.length > 0 && (
                <>
                  <div className="relative flex-1 min-w-48">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm select-none">⌕</span>
                    <input className="w-full border border-stone-200 rounded-sm pl-8 pr-3 py-2 text-sm outline-none focus:border-stone-400 transition-colors"
                      placeholder="Ürün ara veya barkod okut..."
                      value={sayimSearch}
                      onChange={e => setSayimSearch(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const firstRow = sayimFiltered[0]
                          if (firstRow) {
                            const inp = document.getElementById(`cnt-${firstRow.rowKey}`) as HTMLInputElement | null
                            if (inp) { inp.focus(); inp.select() }
                          }
                        }
                      }}
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={showDiffOnly} onChange={e => setShowDiffOnly(e.target.checked)} className="rounded accent-stone-900" />
                    <span className="text-xs font-medium text-stone-600">Sadece Farkları Göster</span>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Kaydet bar (sticky) */}
          {(changedRows.length > 0 || saving) && (
            <div className="sticky top-0 z-20 flex items-center justify-between bg-[#7C3AED] text-white px-5 py-3.5 mb-4 shadow-lg">
              <div>
                <p className="text-sm font-semibold">{changedRows.length} satırda sayım girildi</p>
                <p className="text-purple-200 text-xs mt-0.5">Kaydetmeden sayfadan çıkarsanız değişiklikler kaybolur</p>
              </div>
              <button onClick={saveSayim} disabled={saving}
                className="bg-white text-stone-900 hover:bg-stone-100 disabled:opacity-50 px-5 py-2 rounded-sm text-[11px] tracking-[0.2em] uppercase font-semibold transition-all">
                {saving ? 'Kaydediliyor...' : `Kaydet (${changedRows.length})`}
              </button>
            </div>
          )}

          {savedMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-sm mb-4 text-sm font-medium ${savedMsg.startsWith('❌') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
              {savedMsg}
            </div>
          )}

          {sayimRows.length > 0 && (
            <div className="bg-white border border-stone-200 shadow-sm overflow-x-auto">
              <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">
                  {stokData?.locations.find(l => l.id === sayimLocId)?.name} — {sayimFiltered.length} ürün
                </p>
                <p className="text-[10px] text-stone-400">Sistem = mevcut kayıtlı · Sayılan = gerçek sayılan</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] w-10">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] w-12">Görsel</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürün</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center w-36">Miad Tarihi</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center w-20">Mevcut</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center w-28">{isAdminMode ? 'Sayılan' : 'Giren Miktar'}</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center w-20">{isAdminMode ? 'Fark' : 'Yeni Toplam'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const result: React.ReactNode[] = []
                    let prodIdx = 0; let lastPid = ''
                    sayimFiltered.forEach((row, idx) => {
                      const isFirst = row.product_id !== lastPid
                      if (isFirst) { lastPid = row.product_id; prodIdx++ }
                      const cnt = parseInt(row.counted)
                      const hasCounted = row.counted !== '' && !isNaN(cnt)
                      const diff = hasCounted ? cnt - row.current_qty : null
                      const hasChange = diff !== null && diff !== 0
                      const isValidDate = (d: string) => d.length === 10 && new Date(d).getFullYear() > 2000
                      const expiryDays = row.expiry_date && isValidDate(row.expiry_date) ? Math.floor((new Date(row.expiry_date).getTime() - Date.now()) / 86400000) : null
                      result.push(
                        <tr key={row.rowKey} className={`border-b border-stone-50 transition-colors ${hasChange ? diff! > 0 ? 'bg-emerald-50/50' : 'bg-red-50/50' : 'hover:bg-stone-50/60'}`}>
                          <td className="px-4 py-3 text-stone-400 text-xs tabular-nums">{isFirst ? prodIdx : ''}</td>
                          <td className="px-4 py-3">
                            {isFirst ? (
                              row.image_url ? (
                                <>
                                  <img src={row.image_url} alt={row.name} className="w-9 h-9 object-contain rounded-sm border border-stone-100"
                                    onError={e => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex' }} />
                                  <div style={{ display: 'none' }} className="w-9 h-9 rounded-sm bg-stone-100 items-center justify-center text-stone-400 text-xs font-bold">{row.name.charAt(0).toUpperCase()}</div>
                                </>
                              ) : <div className="w-9 h-9 rounded-sm bg-stone-100 flex items-center justify-center text-stone-400 text-xs font-bold">{row.name.charAt(0).toUpperCase()}</div>
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
                            {row.isExtra ? (
                              <input type="date" value={row.expiry_date} onChange={e => setExpiryDate(row.rowKey, e.target.value)}
                                className="w-32 text-center text-xs border border-stone-200 rounded-sm px-2 py-1.5 outline-none focus:border-stone-400" />
                            ) : isValidDate(row.expiry_date) ? (
                              <span className={`text-xs font-semibold tabular-nums ${expiryDays !== null && expiryDays < 0 ? 'text-red-600' : expiryDays !== null && expiryDays <= 30 ? 'text-amber-600' : 'text-stone-600'}`}>
                                {new Date(row.expiry_date).toLocaleDateString('tr-TR')}
                                {expiryDays !== null && expiryDays < 0 && <span className="block text-[10px]">Dolmuş</span>}
                                {expiryDays !== null && expiryDays >= 0 && expiryDays <= 30 && <span className="block text-[10px]">{expiryDays} gün</span>}
                              </span>
                            ) : (
                              <input type="date" value={row.expiry_date} onChange={e => setExpiryDate(row.rowKey, e.target.value)}
                                className="w-32 text-center text-xs border border-stone-200 rounded-sm px-2 py-1.5 outline-none focus:border-stone-400" />
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="text-base font-bold text-stone-700 tabular-nums">{row.current_qty}</span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <input
                              id={`cnt-${row.rowKey}`}
                              type="number" min="0" value={row.counted}
                              onChange={e => setCounted(row.rowKey, e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  if (!isAdminMode) saveSingleRow(row)
                                  setSayimSearch('')
                                  const searchEl = document.querySelector<HTMLInputElement>('input[placeholder*="barkod"]')
                                  if (searchEl) searchEl.focus()
                                }
                              }}
                              placeholder="—"
                              className={`w-20 text-center text-sm font-bold border rounded-sm px-2 py-2 outline-none transition-colors tabular-nums ${hasCounted ? 'border-[#7C3AED] bg-purple-50 text-purple-900' : 'border-stone-200 bg-white text-stone-900 focus:border-stone-400'}`}
                            />
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {!isAdminMode ? (
                              hasCounted
                                ? <span className="text-sm font-bold tabular-nums text-emerald-600">{row.current_qty + cnt}</span>
                                : <span className="text-stone-300 text-sm">—</span>
                            ) : (
                              diff === null ? <span className="text-stone-300 text-sm">—</span>
                                : diff === 0 ? <span className="text-stone-400 text-xs font-medium">Eşit</span>
                                  : <span className={`text-sm font-bold tabular-nums ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{diff > 0 ? '+' : ''}{diff}</span>
                            )}
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
              <div className="px-5 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
                <p className="text-xs text-stone-400">
                  {changedRows.length > 0
                    ? <span className="font-semibold text-stone-700">{changedRows.length} üründe değişiklik var</span>
                    : 'Henüz değişiklik yok'}
                </p>
                <button onClick={saveSayim} disabled={saving || changedRows.length === 0}
                  className="bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 text-white px-6 py-2.5 rounded-sm text-[11px] tracking-[0.2em] uppercase font-semibold transition-all">
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          )}

          {sayimRows.length === 0 && !loading && sayimLocId && (
            <div className="bg-white border border-stone-200 shadow-sm px-5 py-16 text-center">
              <p className="text-stone-400 text-sm">Lokasyon seçin ve "Sayımı Başlat"a tıklayın</p>
            </div>
          )}
        </>
      )}

      {/* Stok Sıfırla Modal */}
      {resetModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-sm shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-red-600">
              <h3 className="text-white font-bold text-base tracking-tight">Stoğu Sıfırla</h3>
              <p className="text-white/80 text-xs mt-0.5 truncate">{resetModal.productName}</p>
            </div>
            <div className="p-6">
              {isAdminMode ? (
                <>
                  <p className="text-sm text-stone-600 mb-4">Hangi şubenin stoğunu sıfırlamak istiyorsunuz?</p>
                  <select
                    value={resetLocId}
                    onChange={e => setResetLocId(e.target.value)}
                    className="w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 text-stone-700 bg-white mb-1"
                  >
                    {stokData?.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </>
              ) : (
                <p className="text-sm text-stone-600">
                  <strong>{cashierLocationName}</strong> şubesindeki bu ürünün stoğu <strong>0</strong>'a sıfırlanacak. Devam etmek istiyor musunuz?
                </p>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-stone-100">
              <button
                onClick={resetStock}
                disabled={resetting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-semibold transition-colors"
              >
                {resetting ? 'Sıfırlanıyor...' : 'Sıfırla'}
              </button>
              <button
                onClick={() => setResetModal(null)}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-3 rounded text-[11px] tracking-[0.2em] uppercase font-semibold transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni Ürün Modal */}
      {showNewProduct && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-sm shadow-lg">
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-lg font-bold text-stone-900 mb-1 tracking-tight">Yeni Ürün Ekle</h3>
              <p className="text-stone-400 text-xs mb-5">Ürün kaydedilir, sayım tablosundan adet girebilirsiniz.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Ürün Adı *</label>
                  <input autoFocus className="w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400"
                    value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveNewProduct() }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Barkod</label>
                  <input className="w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 font-mono"
                    value={newProduct.barcode} onChange={e => setNewProduct(p => ({ ...p, barcode: e.target.value }))} placeholder="Barkod okutun veya yazın" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Satış Fiyatı ₺ *</label>
                  <input type="number" step="0.01" min="0"
                    className="w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400"
                    value={newProduct.standard_price} onChange={e => setNewProduct(p => ({ ...p, standard_price: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveNewProduct() }} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-stone-100">
              <button onClick={saveNewProduct} disabled={savingNew}
                className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                {savingNew ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button onClick={() => { setShowNewProduct(false); setNewProduct(emptyNew) }}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Görsel Düzenle Modal */}
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
              <button onClick={() => saveEditImg()} className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] text-white py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">Kaydet</button>
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
