'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useMode } from '@/contexts/ModeContext'

interface Product {
  id: string
  name: string
  barcode: string | null
  image_url: string | null
  standard_price: number
  purchase_price: number
  stocks: { location_id: string; location: string; quantity: number }[]
}

interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  batch_id: string | null
  expiry_date: string | null
}

export default function TakaslarPage() {
  const { isAdminMode, cashierLocationId, cashierLocationName } = useMode()
  const [tab, setTab] = useState<'takas' | 'gelen' | 'gecmis'>('takas')

  // ── Takas POS state ──────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [step, setStep] = useState<'cart' | 'confirm'>('cart')
  const [fromLocId, setFromLocId] = useState('')
  const [partnerLocId, setPartnerLocId] = useState('')
  const [partnerCustom, setPartnerCustom] = useState('')
  const [notes, setNotes] = useState('')
  const [completing, setCompleting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<{ items: CartItem[]; partner: string; total: number } | null>(null)
  const [batchSelector, setBatchSelector] = useState<{ product: Product; batches: { id: string; expiry_date: string; quantity: number }[] } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Gelen Takas state ────────────────────────────────────
  const [inCart, setInCart] = useState<CartItem[]>([])
  const [inStep, setInStep] = useState<'cart' | 'confirm'>('cart')
  const [inToLocId, setInToLocId] = useState('')
  const [inSource, setInSource] = useState('')
  const [inNotes, setInNotes] = useState('')
  const [inCompleting, setInCompleting] = useState(false)
  const [inSearch, setInSearch] = useState('')
  const inSearchRef = useRef<HTMLInputElement>(null)

  // ── Geçmiş state ─────────────────────────────────────────
  const [debts, setDebts] = useState<any[]>([])
  const [debtsLoading, setDebtsLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => { fetchProducts() }, [])
  useEffect(() => { if (tab === 'gecmis') fetchDebts() }, [tab])
  useEffect(() => { if (cashierLocationId) setFromLocId(cashierLocationId) }, [cashierLocationId])

  async function fetchProducts() {
    const [{ data: prods }, { data: inv }, { data: locs }] = await Promise.all([
      supabase.from('products').select('id, name, barcode, image_url, standard_price, purchase_price').eq('is_active', true).order('name'),
      supabase.from('inventory').select('product_id, quantity, location_id, locations(name)'),
      supabase.from('locations').select('id, name').order('name'),
    ])

    setLocations(locs ?? [])
    if (!cashierLocationId && locs && locs.length > 0) setFromLocId(locs[0].id)

    const invMap: Record<string, { location_id: string; location: string; quantity: number }[]> = {}
    ;(inv ?? []).forEach((row: any) => {
      if (!invMap[row.product_id]) invMap[row.product_id] = []
      invMap[row.product_id].push({ location_id: row.location_id, location: row.locations?.name ?? '-', quantity: Number(row.quantity) })
    })

    setProducts((prods ?? []).map((p: any) => ({
      id: p.id, name: p.name, barcode: p.barcode, image_url: p.image_url,
      standard_price: Number(p.standard_price), purchase_price: Number(p.purchase_price ?? 0),
      stocks: invMap[p.id] ?? [],
    })))
    setLoading(false)
  }

  async function fetchDebts() {
    setDebtsLoading(true)
    const { data } = await supabase.from('internal_debts')
      .select('*, debtor:locations!internal_debts_debtor_location_id_fkey(name), creditor:locations!internal_debts_creditor_location_id_fkey(name)')
      .order('created_at', { ascending: false })
    setDebts(data ?? [])
    setDebtsLoading(false)
  }

  async function markPaid(id: string) {
    await supabase.from('internal_debts').update({ status: 'odendi', paid_at: new Date().toISOString() }).eq('id', id)
    fetchDebts()
  }

  const filtered = search.trim()
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode ?? '').includes(search.trim()))
    : products

  async function addToCart(product: Product) {
    if (!fromLocId) { addToCartWithBatch(product, null, null); return }
    const { data: batches } = await supabase
      .from('inventory_batches').select('id, expiry_date, quantity')
      .eq('product_id', product.id).eq('location_id', fromLocId).gt('quantity', 0).order('expiry_date')
    const avail = batches ?? []
    if (avail.length === 0) { addToCartWithBatch(product, null, null) }
    else if (avail.length === 1) { addToCartWithBatch(product, avail[0].id, avail[0].expiry_date) }
    else { setBatchSelector({ product, batches: avail }) }
  }

  function addToCartWithBatch(product: Product, batchId: string | null, expiryDate: string | null) {
    const key = `${product.id}_${batchId ?? 'none'}`
    setCart(prev => {
      const ex = prev.find(i => `${i.product.id}_${i.batch_id ?? 'none'}` === key)
      if (ex) return prev.map(i => `${i.product.id}_${i.batch_id ?? 'none'}` === key ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product, quantity: 1, unit_price: product.standard_price, batch_id: batchId, expiry_date: expiryDate }]
    })
    setSearch('')
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  function removeFromCart(id: string) { setCart(prev => prev.filter(i => i.product.id !== id)) }
  function setQty(id: string, qty: number) { if (qty <= 0) { removeFromCart(id); return } setCart(prev => prev.map(i => i.product.id === id ? { ...i, quantity: qty } : i)) }
  function setPrice(id: string, price: number) { setCart(prev => prev.map(i => i.product.id === id ? { ...i, unit_price: price } : i)) }

  function clearCart() {
    setCart([]); setStep('cart'); setPartnerLocId(''); setPartnerCustom(''); setNotes('')
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  const total = cart.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const partnerName = partnerLocId === '__custom'
    ? partnerCustom.trim()
    : (locations.find(l => l.id === partnerLocId)?.name ?? '')
  const canComplete = !completing && cart.length > 0 && !!fromLocId && !!partnerName

  async function completeExchange() {
    if (!canComplete) return
    setCompleting(true)
    try {
      for (const item of cart) {
        // Insert transfer record
        await supabase.from('transfers').insert({
          product_id: item.product.id,
          from_location_id: fromLocId,
          to_location_id: partnerLocId !== '__custom' ? partnerLocId : null,
          quantity: item.quantity,
          transfer_price: item.unit_price,
          notes: partnerLocId === '__custom' ? `Harici mağaza: ${partnerCustom}${notes ? ' — ' + notes : ''}` : (notes || null),
          status: 'tamamlandi',
        })

        // Batch stok düş
        if (item.batch_id) {
          const { data: batch } = await supabase.from('inventory_batches').select('quantity').eq('id', item.batch_id).single()
          if (batch) await supabase.from('inventory_batches').update({ quantity: Math.max(0, Number(batch.quantity) - item.quantity) }).eq('id', item.batch_id)
        }

        // Genel stok düş
        const { data: inv } = await supabase.from('inventory').select('id, quantity')
          .eq('product_id', item.product.id).eq('location_id', fromLocId).single()
        if (inv) {
          await supabase.from('inventory').update({ quantity: Math.max(0, Number(inv.quantity) - item.quantity) }).eq('id', inv.id)
        }

        // Stock movement
        await supabase.from('stock_movements').insert({
          product_id: item.product.id,
          from_location_id: fromLocId,
          to_location_id: partnerLocId !== '__custom' ? partnerLocId : null,
          quantity: item.quantity,
          movement_type: 'transfer',
          reference_notes: `Takas: ${partnerName}`,
        })
      }

      // Internal debt record (known location only)
      if (partnerLocId && partnerLocId !== '__custom') {
        await supabase.from('internal_debts').insert({
          debtor_location_id: partnerLocId,
          creditor_location_id: fromLocId,
          amount: total,
          status: 'odenmedi',
          notes: notes || `Takas — ${cart.length} ürün`,
        })
      }

      setSuccessMsg({ items: [...cart], partner: partnerName, total })
      clearCart()
      fetchProducts()
    } catch (e: any) {
      alert('Hata: ' + e.message)
    } finally {
      setCompleting(false)
    }
  }

  // Gelen takas yardımcıları
  const inFiltered = inSearch.trim()
    ? products.filter(p => p.name.toLowerCase().includes(inSearch.toLowerCase()) || (p.barcode ?? '').includes(inSearch.trim()))
    : products
  const inTotal = inCart.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const canCompleteIn = !inCompleting && inCart.length > 0 && !!inToLocId && !!inSource.trim()

  function addToInCart(product: Product) {
    setInCart(prev => {
      const ex = prev.find(i => i.product.id === product.id)
      if (ex) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product, quantity: 1, unit_price: product.purchase_price || product.standard_price }]
    })
    setInSearch('')
    setTimeout(() => inSearchRef.current?.focus(), 0)
  }

  function clearInCart() {
    setInCart([]); setInStep('cart'); setInSource(''); setInNotes(''); setInToLocId('')
    setTimeout(() => inSearchRef.current?.focus(), 0)
  }

  async function completeIncoming() {
    if (!canCompleteIn) return
    setInCompleting(true)
    try {
      const depo = locations.find(l => l.id === inToLocId)

      for (const item of inCart) {
        // Stok artır
        const { data: inv } = await supabase.from('inventory').select('id, quantity')
          .eq('product_id', item.product.id).eq('location_id', inToLocId).single()
        if (inv) {
          await supabase.from('inventory').update({ quantity: Number(inv.quantity) + item.quantity }).eq('id', inv.id)
        } else {
          await supabase.from('inventory').insert({ product_id: item.product.id, location_id: inToLocId, quantity: item.quantity })
        }

        // Stok hareketi
        await supabase.from('stock_movements').insert({
          product_id: item.product.id,
          to_location_id: inToLocId,
          quantity: item.quantity,
          movement_type: 'transfer',
          reference_notes: `Gelen Takas: ${inSource.trim()}`,
        })
      }

      // İç borç kaydı — Dağdelen borçlu, eczane alacaklı (harici)
      await supabase.from('internal_debts').insert({
        debtor_location_id: inToLocId,
        creditor_location_id: null,
        amount: inTotal,
        status: 'odenmedi',
        notes: `Gelen Takas — ${inSource.trim()}${inNotes ? ': ' + inNotes : ''} | ${inCart.map(i => `${i.product.name} ×${i.quantity}`).join(', ')}`,
      })

      alert(`✓ Takas tamamlandı! ${inSource.trim()} → ${depo?.name ?? ''} | ₺${inTotal.toLocaleString('tr-TR')} değer stoka eklendi.`)
      clearInCart()
      fetchProducts()
      fetchDebts()
    } catch (e: any) {
      alert('Hata: ' + e.message)
    } finally {
      setInCompleting(false)
    }
  }

  const totalUnpaid = debts.filter(d => d.status === 'odenmedi').reduce((s, d) => s + Number(d.amount), 0)
  const filteredDebts = filterStatus ? debts.filter(d => d.status === filterStatus) : debts

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 88px)' }}>

      {/* Tab bar */}
      <div className="flex items-end gap-0 mb-5 border-b border-stone-200 flex-shrink-0">
        {[
          { key: 'takas', label: 'Yeni Takas (Gönder)' },
          { key: 'gelen', label: 'Gelen Takas (Eczane)' },
          { key: 'gecmis', label: 'Borç Geçmişi' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] border-b-2 transition-all ${
              tab === t.key
                ? 'border-[#F27A1A] text-[#E06010]'
                : 'border-transparent text-stone-400 hover:text-stone-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB 1: Yeni Takas — split POS layout
      ══════════════════════════════════════════════════════ */}
      {tab === 'takas' && (
        <div className="flex gap-5 flex-1 min-h-0">

          {/* LEFT: Product catalog */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-stone-500 text-sm">
                  {isAdminMode ? `${products.length} aktif ürün` : (cashierLocationName ?? 'Kasiyer modu')}
                </p>
              </div>
              {isAdminMode && (
                <div className="flex gap-2">
                  <select
                    value={fromLocId}
                    onChange={e => setFromLocId(e.target.value)}
                    className="border border-stone-200 rounded-sm px-3 py-2 text-xs outline-none focus:border-stone-400 text-stone-700 bg-white"
                  >
                    <option value="">Veren lokasyon...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Search */}
            <div className="bg-white border border-stone-200 shadow-sm mb-4 p-3.5">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm select-none">&#x2315;</span>
                <input
                  ref={searchRef}
                  autoFocus
                  className="w-full border border-stone-200 rounded-sm pl-9 pr-10 py-3 text-sm outline-none focus:border-stone-400 transition-colors font-medium"
                  placeholder="Barkod okut veya ürün adı yaz..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && filtered.length === 1) addToCart(filtered[0])
                    if (e.key === 'Escape') { setSearch(''); searchRef.current?.focus() }
                  }}
                />
                {search && (
                  <button onClick={() => { setSearch(''); searchRef.current?.focus() }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xl leading-none">×</button>
                )}
              </div>
              <p className="text-stone-400 text-xs mt-1.5 ml-1">Barkod okutunca anında arar — tek sonuç kalırsa Enter ile sepete ekler</p>
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex items-center justify-center h-32 gap-2.5">
                  <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                  <span className="text-stone-400 text-sm">Yükleniyor...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filtered.map(p => {
                    const stockHere = fromLocId
                      ? (p.stocks.find(s => s.location_id === fromLocId)?.quantity ?? 0)
                      : p.stocks.reduce((s, x) => s + x.quantity, 0)
                    const inCart = cart.find(i => i.product.id === p.id)
                    return (
                      <div
                        key={p.id}
                        onClick={() => addToCart(p)}
                        className={`bg-white border shadow-sm overflow-hidden flex flex-col cursor-pointer select-none transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97] ${
                          inCart ? 'border-stone-700 ring-1 ring-stone-300' : 'border-stone-200'
                        }`}
                      >
                        <div className="w-full h-20 bg-stone-50 flex items-center justify-center overflow-hidden">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-1.5" />
                          ) : (
                            <div className="w-9 h-9 bg-stone-200 flex items-center justify-center text-stone-400 text-base font-bold">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                          <p className="text-stone-800 font-semibold text-xs leading-tight line-clamp-2">{p.name}</p>
                          <div className="flex justify-between items-center mt-auto">
                            <span className={`text-[10px] font-semibold ${stockHere === 0 ? 'text-red-500' : stockHere < 5 ? 'text-amber-600' : 'text-emerald-700'}`}>
                              {stockHere} adet
                            </span>
                            <span className="text-sm font-bold text-stone-900 tabular-nums">₺{p.standard_price.toLocaleString('tr-TR')}</span>
                          </div>
                          {inCart && (
                            <div className="bg-[#F27A1A] text-white text-center text-[10px] font-semibold py-0.5 rounded-sm tracking-wide">
                              Sepette: {inCart.quantity}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {filtered.length === 0 && (
                    <div className="col-span-full py-16 text-center">
                      <p className="text-stone-400 text-sm">"{search}" için ürün bulunamadı</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Two-step panel */}
          <div className="w-80 xl:w-96 flex-shrink-0 flex flex-col bg-white border border-stone-200 shadow-sm overflow-hidden">

            {/* ── STEP 1: Sepet İnceleme ── */}
            {step === 'cart' && (
              <>
                <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
                  <div>
                    <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.2em]">Takas Sepeti</p>
                    <p className="text-stone-900 font-semibold text-sm mt-0.5">
                      {cart.length === 0 ? 'Boş' : `${cart.reduce((s, i) => s + i.quantity, 0)} adet · ${cart.length} çeşit`}
                    </p>
                  </div>
                  {cart.length > 0 && (
                    <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors">Temizle</button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                      <div className="w-12 h-12 bg-stone-100 border border-stone-200 flex items-center justify-center">
                        <span className="text-stone-300 text-2xl font-light">◻</span>
                      </div>
                      <p className="text-stone-400 text-xs text-center px-4">Ürüne tıklayın veya<br />barkod okutun</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-stone-100">
                      {cart.map((item, idx) => (
                        <div key={item.product.id} className="px-4 py-3.5 hover:bg-stone-50/60 transition-colors">
                          <div className="flex items-start gap-2.5 mb-3">
                            <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            {item.product.image_url ? (
                              <img src={item.product.image_url} alt={item.product.name} className="w-9 h-9 object-contain rounded-sm border border-stone-100 flex-shrink-0" />
                            ) : (
                              <div className="w-9 h-9 bg-stone-100 rounded-sm flex items-center justify-center text-stone-400 text-sm font-bold flex-shrink-0">
                                {item.product.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-stone-900 font-semibold text-sm leading-tight">{item.product.name}</p>
                              {item.expiry_date && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm mt-0.5 inline-block ${
                                  (() => { const d = Math.floor((new Date(item.expiry_date).getTime() - Date.now()) / 86400000); return d < 0 ? 'bg-red-50 text-red-600' : d <= 30 ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-500' })()
                                }`}>Miad: {new Date(item.expiry_date).toLocaleDateString('tr-TR')}</span>
                              )}
                            </div>
                            <button onClick={() => removeFromCart(item.product.id)} className="text-stone-300 hover:text-red-400 text-xl leading-none flex-shrink-0 transition-colors">×</button>
                          </div>
                          <div className="flex items-center gap-2 ml-7">
                            <div className="flex items-center border border-stone-200 rounded-sm overflow-hidden flex-shrink-0">
                              <button onClick={() => setQty(item.product.id, item.quantity - 1)} className="px-2.5 py-2 text-stone-500 hover:bg-stone-100 text-sm font-bold transition-colors">−</button>
                              <input
                                type="number" min="1" value={item.quantity}
                                onChange={e => setQty(item.product.id, parseInt(e.target.value) || 1)}
                                className="w-10 text-center text-sm font-bold text-stone-900 border-x border-stone-200 py-2 outline-none tabular-nums bg-white"
                              />
                              <button onClick={() => setQty(item.product.id, item.quantity + 1)} className="px-2.5 py-2 text-stone-500 hover:bg-stone-100 text-sm font-bold transition-colors">+</button>
                            </div>
                            <div className="flex items-center border border-stone-200 rounded-sm flex-1 overflow-hidden">
                              <span className="pl-2.5 text-stone-400 text-xs flex-shrink-0">₺</span>
                              <input
                                type="number" step="0.5" value={item.unit_price}
                                onChange={e => setPrice(item.product.id, parseFloat(e.target.value) || 0)}
                                className="flex-1 min-w-0 px-1.5 py-2 text-sm font-semibold text-stone-900 outline-none tabular-nums bg-white"
                              />
                            </div>
                            <span className="text-sm font-bold text-stone-900 tabular-nums w-16 text-right flex-shrink-0">
                              ₺{(item.quantity * item.unit_price).toLocaleString('tr-TR')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="border-t border-stone-100 px-4 py-4 space-y-3 flex-shrink-0">
                    <div className="bg-stone-50 border border-stone-100 rounded-sm px-4 py-3 flex justify-between items-center">
                      <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Toplam Değer</span>
                      <span className="text-2xl font-bold text-stone-900 tabular-nums">₺{total.toLocaleString('tr-TR')}</span>
                    </div>
                    <button
                      onClick={() => setStep('confirm')}
                      className="w-full bg-[#F27A1A] hover:bg-[#E06010] text-white py-4 rounded-sm text-[11px] tracking-[0.3em] uppercase font-semibold transition-all"
                    >
                      Alıcı Mağazayı Seç →
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── STEP 2: Takas Onay ── */}
            {step === 'confirm' && (
              <>
                <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => setStep('cart')} className="text-stone-400 hover:text-stone-700 transition-colors text-lg leading-none flex-shrink-0">←</button>
                  <div>
                    <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.2em]">Takas Onayı</p>
                    <p className="text-stone-900 font-semibold text-sm mt-0.5">{cart.reduce((s, i) => s + i.quantity, 0)} adet</p>
                  </div>
                </div>

                {/* Compact item summary */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-3">Gönderilecek Ürünler</p>
                    <div className="space-y-2">
                      {cart.map((item, idx) => (
                        <div key={item.product.id} className="flex items-center gap-2.5 bg-stone-50 border border-stone-100 rounded-sm px-3 py-2.5">
                          <span className="w-5 h-5 rounded-full bg-stone-200 text-stone-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                          {item.product.image_url && (
                            <img src={item.product.image_url} alt={item.product.name} className="w-8 h-8 object-contain rounded-sm border border-stone-100 flex-shrink-0" />
                          )}
                          <p className="text-stone-800 font-semibold text-xs leading-tight flex-1">{item.product.name}</p>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-bold text-stone-900 tabular-nums">₺{(item.quantity * item.unit_price).toLocaleString('tr-TR')}</p>
                            <p className="text-[10px] text-stone-400">{item.quantity} adet</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-stone-100 px-4 py-4 space-y-3.5 flex-shrink-0">
                  {/* Total */}
                  <div className="bg-[#E06010] text-white rounded-sm px-4 py-3 flex justify-between items-center">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">Toplam Değer</span>
                    <span className="text-2xl font-bold tabular-nums">₺{total.toLocaleString('tr-TR')}</span>
                  </div>

                  {/* Partner store selection */}
                  <div>
                    <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-2">
                      Alıcı Mağaza / Dükkân
                    </label>
                    <select
                      value={partnerLocId}
                      onChange={e => setPartnerLocId(e.target.value)}
                      className="w-full border border-stone-200 rounded-sm px-3 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors text-stone-700 bg-white font-medium"
                    >
                      <option value="">— Mağaza seçin —</option>
                      {locations.filter(l => l.id !== fromLocId).map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                      <option value="__custom">Diğer (manuel giriş)</option>
                    </select>
                  </div>

                  {/* Custom store name */}
                  {partnerLocId === '__custom' && (
                    <div>
                      <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1.5">Mağaza Adı</label>
                      <input
                        type="text"
                        value={partnerCustom}
                        onChange={e => setPartnerCustom(e.target.value)}
                        placeholder="Mağaza / dükkân adı girin..."
                        className="w-full border border-stone-200 rounded-sm px-3 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors"
                        autoFocus
                      />
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1.5">Not (opsiyonel)</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Açıklama..."
                      className="w-full border border-stone-200 rounded-sm px-3 py-2 text-sm outline-none focus:border-stone-400 transition-colors"
                    />
                  </div>

                  {/* Confirm */}
                  <button
                    onClick={completeExchange}
                    disabled={!canComplete}
                    className="w-full bg-[#F27A1A] hover:bg-[#E06010] disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-sm text-[11px] tracking-[0.3em] uppercase font-semibold transition-all"
                  >
                    {completing ? 'Kaydediliyor...' : 'Takası Tamamla'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 2: Gelen Takas — Eczaneden Dağdelen'e
      ══════════════════════════════════════════════════════ */}
      {tab === 'gelen' && (
        <div className="flex gap-5 flex-1 min-h-0">

          {/* LEFT: Ürün kataloğu */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-stone-900">Eczaneden Gelen Ürünler</h3>
                <p className="text-stone-400 text-sm mt-0.5">Ürünleri seçin → stoka eklenecek, iç borca yazılacak</p>
              </div>
              <select
                value={inToLocId}
                onChange={e => setInToLocId(e.target.value)}
                className="border border-stone-200 rounded-sm px-3 py-2 text-xs outline-none focus:border-stone-400 text-stone-700 bg-white"
              >
                <option value="">Teslim alınacak lokasyon...</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            {/* Arama */}
            <div className="bg-white border border-stone-200 shadow-sm mb-4 p-3.5">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm select-none">&#x2315;</span>
                <input
                  ref={inSearchRef}
                  autoFocus
                  className="w-full border border-stone-200 rounded-sm pl-9 pr-10 py-3 text-sm outline-none focus:border-stone-400 transition-colors font-medium"
                  placeholder="Barkod okut veya ürün adı yaz..."
                  value={inSearch}
                  onChange={e => setInSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && inFiltered.length === 1) addToInCart(inFiltered[0])
                    if (e.key === 'Escape') { setInSearch(''); inSearchRef.current?.focus() }
                  }}
                />
                {inSearch && (
                  <button onClick={() => { setInSearch(''); inSearchRef.current?.focus() }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xl leading-none">×</button>
                )}
              </div>
            </div>

            {/* Ürün grid */}
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {inFiltered.map(p => {
                  const inC = inCart.find(i => i.product.id === p.id)
                  return (
                    <div
                      key={p.id}
                      onClick={() => addToInCart(p)}
                      className={`bg-white border shadow-sm overflow-hidden flex flex-col cursor-pointer select-none transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97] ${inC ? 'border-stone-700 ring-1 ring-stone-300' : 'border-stone-200'}`}
                    >
                      <div className="w-full h-20 bg-stone-50 flex items-center justify-center overflow-hidden">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-1.5" />
                        ) : (
                          <div className="w-9 h-9 bg-stone-200 flex items-center justify-center text-stone-400 text-base font-bold">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                        <p className="text-stone-800 font-semibold text-xs leading-tight line-clamp-2">{p.name}</p>
                        <span className="text-sm font-bold text-stone-900 tabular-nums mt-auto">₺{p.purchase_price.toLocaleString('tr-TR')}</span>
                        {inC && (
                          <div className="bg-[#F27A1A] text-white text-center text-[10px] font-semibold py-0.5 rounded-sm">
                            Sepette: {inC.quantity}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: Onay paneli */}
          <div className="w-80 xl:w-96 flex-shrink-0 flex flex-col bg-white border border-stone-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.2em]">Gelen Ürünler</p>
                <p className="text-stone-900 font-semibold text-sm mt-0.5">
                  {inCart.length === 0 ? 'Boş' : `${inCart.reduce((s, i) => s + i.quantity, 0)} adet · ${inCart.length} çeşit`}
                </p>
              </div>
              {inCart.length > 0 && (
                <button onClick={clearInCart} className="text-xs text-red-400 hover:text-red-600 font-medium">Temizle</button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {inCart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                  <p className="text-stone-400 text-xs text-center px-4">Eczaneden gelen ürünlere tıklayın</p>
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {inCart.map((item, idx) => (
                    <div key={item.product.id} className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5 mb-2">
                        <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                        <p className="text-stone-900 font-semibold text-sm leading-tight flex-1">{item.product.name}</p>
                        <button onClick={() => setInCart(prev => prev.filter(i => i.product.id !== item.product.id))} className="text-stone-300 hover:text-red-400 text-xl leading-none">×</button>
                      </div>
                      <div className="flex items-center gap-2 ml-7">
                        <div className="flex items-center border border-stone-200 rounded-sm overflow-hidden flex-shrink-0">
                          <button onClick={() => { const q = item.quantity - 1; if (q <= 0) setInCart(prev => prev.filter(i => i.product.id !== item.product.id)); else setInCart(prev => prev.map(i => i.product.id === item.product.id ? { ...i, quantity: q } : i)) }} className="px-2.5 py-2 text-stone-500 hover:bg-stone-100 text-sm font-bold">−</button>
                          <input type="number" min="1" value={item.quantity} onChange={e => setInCart(prev => prev.map(i => i.product.id === item.product.id ? { ...i, quantity: parseInt(e.target.value) || 1 } : i))} className="w-10 text-center text-sm font-bold text-stone-900 border-x border-stone-200 py-2 outline-none tabular-nums bg-white" />
                          <button onClick={() => setInCart(prev => prev.map(i => i.product.id === item.product.id ? { ...i, quantity: i.quantity + 1 } : i))} className="px-2.5 py-2 text-stone-500 hover:bg-stone-100 text-sm font-bold">+</button>
                        </div>
                        <div className="flex items-center border border-stone-200 rounded-sm flex-1 overflow-hidden">
                          <span className="pl-2.5 text-stone-400 text-xs flex-shrink-0">₺</span>
                          <input type="number" step="0.5" value={item.unit_price} onChange={e => setInCart(prev => prev.map(i => i.product.id === item.product.id ? { ...i, unit_price: parseFloat(e.target.value) || 0 } : i))} className="flex-1 min-w-0 px-1.5 py-2 text-sm font-semibold text-stone-900 outline-none tabular-nums bg-white" />
                        </div>
                        <span className="text-sm font-bold text-stone-900 tabular-nums w-16 text-right flex-shrink-0">₺{(item.quantity * item.unit_price).toLocaleString('tr-TR')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {inCart.length > 0 && (
              <div className="border-t border-stone-100 px-4 py-4 space-y-3 flex-shrink-0">
                <div className="bg-stone-50 border border-stone-100 rounded-sm px-4 py-3 flex justify-between items-center">
                  <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Toplam Değer</span>
                  <span className="text-2xl font-bold text-stone-900 tabular-nums">₺{inTotal.toLocaleString('tr-TR')}</span>
                </div>

                {/* Eczane adı */}
                <div>
                  <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1.5">Gönderen Eczane *</label>
                  <input
                    type="text"
                    value={inSource}
                    onChange={e => setInSource(e.target.value)}
                    placeholder="Eczane adı..."
                    className="w-full border border-stone-200 rounded-sm px-3 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1.5">Not</label>
                  <input
                    type="text"
                    value={inNotes}
                    onChange={e => setInNotes(e.target.value)}
                    placeholder="Açıklama..."
                    className="w-full border border-stone-200 rounded-sm px-3 py-2 text-sm outline-none focus:border-stone-400 transition-colors"
                  />
                </div>

                {!inToLocId && <p className="text-amber-600 text-[10px] font-semibold text-center">Teslim alınacak lokasyon seçin</p>}
                {!inSource.trim() && <p className="text-amber-600 text-[10px] font-semibold text-center">Eczane adı girin</p>}

                <button
                  onClick={completeIncoming}
                  disabled={!canCompleteIn}
                  className="w-full bg-[#F27A1A] hover:bg-[#E06010] disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-sm text-[11px] tracking-[0.3em] uppercase font-semibold transition-all"
                >
                  {inCompleting ? 'Kaydediliyor...' : 'Takası Kaydet → Stoka Ekle'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 3: Geçmiş
      ══════════════════════════════════════════════════════ */}
      {tab === 'gecmis' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <div className="bg-stone-50 border border-stone-200 rounded-sm px-4 py-2.5 text-sm shadow-sm">
              <span className="text-stone-500 font-medium text-xs uppercase tracking-[0.1em]">Ödenmemiş Borç</span>
              <strong className="text-stone-900 ml-2 tabular-nums font-bold">₺{totalUnpaid.toLocaleString('tr-TR')}</strong>
            </div>
            <select
              className="border border-stone-200 rounded-sm px-3.5 py-2 text-sm outline-none focus:border-stone-400 transition-colors text-stone-700 bg-white"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">Tüm Durumlar</option>
              <option value="odenmedi">Ödenmemiş</option>
              <option value="odendi">Ödenmiş</option>
            </select>
          </div>

          <div className="bg-white border border-stone-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-100">
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Tarih</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Borçlu</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Alacaklı</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Tutar</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Not</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Durum</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {debtsLoading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center">
                        <div className="flex items-center justify-center gap-2.5">
                          <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                          <span className="text-stone-400 text-sm">Yükleniyor...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredDebts.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-stone-400 text-sm">Kayıt bulunamadı</td></tr>
                  ) : filteredDebts.map(d => (
                    <tr key={d.id} className="border-b border-stone-50 hover:bg-stone-50/70 transition-colors">
                      <td className="px-5 py-3.5 text-stone-400 text-xs">{new Date(d.created_at).toLocaleDateString('tr-TR')}</td>
                      <td className="px-5 py-3.5 font-semibold text-red-600">{d.debtor?.name ?? '—'}</td>
                      <td className="px-5 py-3.5 font-semibold text-emerald-700">{d.creditor?.name ?? '—'}</td>
                      <td className="px-5 py-3.5 font-bold text-stone-900 tabular-nums">₺{Number(d.amount).toLocaleString('tr-TR')}</td>
                      <td className="px-5 py-3.5 text-stone-500 text-xs max-w-[160px] truncate">{d.notes ?? '—'}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-sm text-xs font-semibold border ${d.status === 'odenmedi' ? 'border-red-200 text-red-600 bg-red-50/50' : 'border-emerald-200 text-emerald-700 bg-emerald-50/50'}`}>
                          {d.status === 'odenmedi' ? 'Ödenmemiş' : 'Ödenmiş'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {d.status === 'odenmedi' ? (
                          <button onClick={() => markPaid(d.id)} className="text-stone-700 hover:text-stone-900 text-xs font-semibold transition-colors">
                            Ödendi İşaretle
                          </button>
                        ) : (
                          <span className="text-stone-400 text-xs">{d.paid_at ? new Date(d.paid_at).toLocaleDateString('tr-TR') : ''}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Miad (Batch) Seçim Modalı */}
      {batchSelector && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-sm p-6 shadow-lg">
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.2em] mb-1">Miad Seçimi</p>
            <h3 className="text-stone-900 font-bold text-lg mb-1 leading-tight">{batchSelector.product.name}</h3>
            <p className="text-stone-400 text-xs mb-4">Hangi miaddan gönderilsin?</p>
            <div className="space-y-2 mb-4">
              {batchSelector.batches.map(b => {
                const d = Math.floor((new Date(b.expiry_date).getTime() - Date.now()) / 86400000)
                return (
                  <button
                    key={b.id}
                    onClick={() => { addToCartWithBatch(batchSelector.product, b.id, b.expiry_date); setBatchSelector(null) }}
                    className={`w-full flex items-center justify-between px-4 py-3 border rounded-sm text-left transition-all hover:border-stone-500 ${d < 0 ? 'border-red-200 bg-red-50' : d <= 30 ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white hover:bg-stone-50'}`}
                  >
                    <div>
                      <p className={`text-sm font-bold ${d < 0 ? 'text-red-600' : d <= 30 ? 'text-amber-700' : 'text-stone-900'}`}>
                        {new Date(b.expiry_date).toLocaleDateString('tr-TR')}
                      </p>
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        {d < 0 ? 'SÜRESİ DOLMUŞ' : d === 0 ? 'Bugün son' : `${d} gün kaldı`}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-stone-600 tabular-nums">{b.quantity} adet</p>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setBatchSelector(null)} className="w-full bg-stone-100 hover:bg-stone-200 text-stone-700 py-2.5 rounded-sm text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Success modal */}
      {successMsg && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white border border-stone-200 shadow-xl w-full max-w-xs p-6 flex flex-col gap-5">
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-stone-900 font-bold text-xl tracking-tight">Takas Tamamlandı</h3>
              <p className="text-stone-500 text-sm mt-1">{successMsg.partner}</p>
            </div>
            <div className="bg-stone-50 border border-stone-100 rounded-sm p-3.5 space-y-2">
              {successMsg.items.map(item => (
                <div key={item.product.id} className="flex justify-between text-xs text-stone-600">
                  <span className="flex-1 pr-2">{item.product.name} <span className="text-stone-400">× {item.quantity}</span></span>
                  <span className="tabular-nums font-semibold">₺{(item.quantity * item.unit_price).toLocaleString('tr-TR')}</span>
                </div>
              ))}
              <div className="pt-2.5 border-t border-stone-200 flex justify-between items-center">
                <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Toplam Değer</span>
                <span className="text-xl font-bold text-stone-900 tabular-nums">₺{successMsg.total.toLocaleString('tr-TR')}</span>
              </div>
            </div>
            <button
              onClick={() => { setSuccessMsg(null); setTimeout(() => searchRef.current?.focus(), 0) }}
              className="w-full bg-[#F27A1A] hover:bg-[#E06010] text-white py-3.5 rounded-sm text-[11px] tracking-[0.3em] uppercase font-semibold transition-colors"
            >
              Yeni Takas
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
