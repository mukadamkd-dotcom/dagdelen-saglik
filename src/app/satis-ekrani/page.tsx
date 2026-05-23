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
  min_sale_price: number
  purchase_price: number
  stocks: { location_id: string; location: string; quantity: number }[]
}

interface CartItem {
  cartKey: string
  product: Product
  quantity: number
  unit_price: number
  batch_id: string | null
  expiry_date: string | null
  estimated_days: number | null
}

type PaymentMethod = 'nakit' | 'kart' | 'iban' | 'veresiye'

const paymentLabels: Record<PaymentMethod, string> = {
  nakit: 'Nakit',
  kart: 'Kredi Kartı',
  iban: 'İBAN / EFT',
  veresiye: 'Veresiye',
}

export default function SatisEkraniPage() {
  const { isAdminMode, cashierLocationId, cashierLocationName } = useMode()
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [locationId, setLocationId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerMode, setCustomerMode] = useState<'eski' | 'yeni'>('yeni')
  const [customerSearch, setCustomerSearch] = useState('')
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [payment, setPayment] = useState<PaymentMethod | null>(null)
  const [cashReceived, setCashReceived] = useState('')
  const [discount, setDiscount] = useState('')
  const [totalReceived, setTotalReceived] = useState('')
  const [step, setStep] = useState<'cart' | 'payment'>('cart')
  const [completing, setCompleting] = useState(false)
  const [splitToVeresiye, setSplitToVeresiye] = useState(false)
  const [referrerName, setReferrerName] = useState<string | null>(null)
  const [isFirstPurchase, setIsFirstPurchase] = useState(false)
  const [batchSelector, setBatchSelector] = useState<{
    product: Product
    batches: { id: string; expiry_date: string; quantity: number }[]
  } | null>(null)
  const [receipt, setReceipt] = useState<{
    items: CartItem[]
    total: number
    change: number
    method: PaymentMethod
    splitVeresiye?: number
  } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    if (cashierLocationId) setLocationId(cashierLocationId)
  }, [cashierLocationId])

  useEffect(() => {
    if (customerMode === 'eski' && customerId) checkReferral(customerId)
    else { setReferrerName(null); setIsFirstPurchase(false) }
  }, [customerId, customerMode])

  async function checkReferral(cid: string) {
    const [{ data: custData }, { count }] = await Promise.all([
      supabase.from('customers').select('referred_by, customers!referred_by(name)').eq('id', cid).single(),
      supabase.from('sales').select('id', { count: 'exact' }).eq('customer_id', cid).eq('status', 'tamamlandi'),
    ])
    const refName = (custData as any)?.customers?.name ?? null
    setReferrerName(refName)
    setIsFirstPurchase((count ?? 0) === 0)
  }

  async function fetchAll() {
    const [{ data: prods }, { data: inv }, { data: locs }, { data: custs }] = await Promise.all([
      supabase.from('products').select('id, name, barcode, image_url, standard_price, min_sale_price, purchase_price').eq('is_active', true).order('name'),
      supabase.from('inventory').select('product_id, quantity, location_id, locations(name)'),
      supabase.from('locations').select('id, name').order('name'),
      supabase.from('customers').select('id, name, phone').order('name'),
    ])

    setLocations(locs ?? [])
    setCustomers(custs ?? [])
    if (!cashierLocationId && locs && locs.length > 0) setLocationId(locs[0].id)

    const invMap: Record<string, { location_id: string; location: string; quantity: number }[]> = {}
    ;(inv ?? []).forEach((row: any) => {
      if (!invMap[row.product_id]) invMap[row.product_id] = []
      invMap[row.product_id].push({ location_id: row.location_id, location: row.locations?.name ?? '-', quantity: Number(row.quantity) })
    })

    setProducts((prods ?? []).map((p: any) => ({
      id: p.id, name: p.name, barcode: p.barcode, image_url: p.image_url,
      standard_price: Number(p.standard_price), min_sale_price: Number(p.min_sale_price),
      purchase_price: Number(p.purchase_price ?? 0),
      stocks: invMap[p.id] ?? [],
    })))
    setLoading(false)
  }

  const filtered = search.trim()
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode ?? '').includes(search.trim())
      )
    : products

  async function addToCart(product: Product) {
    if (!locationId) { addToCartWithBatch(product, null, null); return }
    const { data: batches } = await supabase
      .from('inventory_batches').select('id, expiry_date, quantity')
      .eq('product_id', product.id).eq('location_id', locationId).gt('quantity', 0).order('expiry_date')
    const avail = batches ?? []
    if (avail.length === 0) { addToCartWithBatch(product, null, null) }
    else if (avail.length === 1) { addToCartWithBatch(product, avail[0].id, avail[0].expiry_date) }
    else { setBatchSelector({ product, batches: avail }) }
  }

  function addToCartWithBatch(product: Product, batchId: string | null, expiryDate: string | null) {
    const cartKey = `${product.id}_${batchId ?? 'none'}`
    setCart(prev => {
      const existing = prev.find(i => i.cartKey === cartKey)
      if (existing) return prev.map(i => i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { cartKey, product, quantity: 1, unit_price: product.standard_price, batch_id: batchId, expiry_date: expiryDate, estimated_days: null }]
    })
    setSearch('')
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  function removeFromCart(cartKey: string) {
    setCart(prev => prev.filter(i => i.cartKey !== cartKey))
  }

  function setQty(cartKey: string, qty: number) {
    if (qty <= 0) { removeFromCart(cartKey); return }
    setCart(prev => prev.map(i => i.cartKey === cartKey ? { ...i, quantity: qty } : i))
  }

  function setPrice(cartKey: string, price: number) {
    setCart(prev => prev.map(i => i.cartKey === cartKey ? { ...i, unit_price: price } : i))
  }

function clearCart() {
    setCart([])
    setDiscount('')
    setCashReceived('')
    setTotalReceived('')
    setPayment(null)
    setSplitToVeresiye(false)
    setCustomerId('')
    setCustomerMode('yeni')
    setCustomerSearch('')
    setNewCustomerName('')
    setNewCustomerPhone('')
    setStep('cart')
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  const subtotal = cart.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const maxDiscount = cart.reduce((s, i) => s + Math.max(0, i.unit_price - i.product.min_sale_price) * i.quantity, 0)
  const discountAmt = Math.max(0, parseFloat(discount) || 0)
  const total = Math.max(0, subtotal - discountAmt)

  function handleTotalReceivedChange(val: string) {
    setTotalReceived(val)
    const received = parseFloat(val)
    if (!val.trim() || isNaN(received)) { setDiscount(''); return }
    const auto = subtotal - received
    const clamped = Math.min(Math.max(0, auto), maxDiscount)
    setDiscount(clamped > 0 ? String(Math.round(clamped * 100) / 100) : '')
  }
  const cashVal = parseFloat(cashReceived) || 0
  const change = cashVal - total
  const hasMinPriceError = cart.some(i => i.unit_price < i.product.min_sale_price)
  const customerValid =
    (customerMode === 'eski' && !!customerId) ||
    (customerMode === 'yeni' && !!newCustomerName.trim())
  const veresiyeAmt = splitToVeresiye ? total - cashVal : 0
  const canComplete = !completing && !!payment && !!locationId && cart.length > 0 && !hasMinPriceError &&
    customerValid && (payment !== 'nakit' || cashVal >= total || (splitToVeresiye && cashVal > 0))

  async function completeSale() {
    if (!canComplete) return
    setCompleting(true)
    try {
      // Resolve customer id
      let resolvedCustomerId: string | null = null
      if (customerMode === 'eski') {
        resolvedCustomerId = customerId
      } else if (customerMode === 'yeni') {
        const { data: newCust } = await supabase.from('customers')
          .insert({ name: newCustomerName.trim(), phone: newCustomerPhone.trim() || null })
          .select('id').single()
        resolvedCustomerId = newCust?.id ?? null
      }

      const saleNotes = splitToVeresiye
        ? `Ödeme: Nakit ₺${cashVal.toLocaleString('tr-TR')} + Veresiye ₺${veresiyeAmt.toLocaleString('tr-TR')}`
        : `Ödeme: ${paymentLabels[payment!]}`
      const saleStatus = (payment === 'veresiye' || splitToVeresiye) ? 'veresiye' : 'tamamlandi'

      const { data: sale, error: saleErr } = await supabase.from('sales').insert({
        location_id: locationId,
        customer_id: resolvedCustomerId,
        channel: 'fiziksel',
        total_amount: total,
        discount_amount: discountAmt,
        notes: saleNotes,
        status: saleStatus,
      }).select().single()

      if (saleErr || !sale) {
        alert('Satış kaydedilemedi: ' + (saleErr?.message ?? 'Bilinmeyen hata'))
        return
      }

      for (const item of cart) {
        await supabase.from('sale_items').insert({
          sale_id: sale.id,
          product_id: item.product.id,
          quantity: item.quantity,
          sale_price: item.unit_price,
          purchase_price: item.product.purchase_price,
          profit: (item.unit_price - item.product.purchase_price) * item.quantity,
          batch_id: item.batch_id || null,
        })

        if (item.batch_id) {
          const { data: batch } = await supabase.from('inventory_batches').select('quantity').eq('id', item.batch_id).single()
          if (batch) await supabase.from('inventory_batches').update({ quantity: Math.max(0, Number(batch.quantity) - item.quantity) }).eq('id', item.batch_id)
        }

        const { data: inv } = await supabase.from('inventory').select('id, quantity')
          .eq('product_id', item.product.id).eq('location_id', locationId).single()
        if (inv) {
          await supabase.from('inventory').update({ quantity: Math.max(0, Number(inv.quantity) - item.quantity) }).eq('id', inv.id)
        }

        await supabase.from('stock_movements').insert({
          product_id: item.product.id,
          from_location_id: locationId,
          quantity: item.quantity,
          movement_type: 'satis',
          reference_id: sale.id,
        })
      }

      setReceipt({
        items: [...cart],
        total,
        change: payment === 'nakit' && !splitToVeresiye ? Math.max(0, change) : 0,
        method: payment!,
        splitVeresiye: splitToVeresiye ? veresiyeAmt : undefined,
      })
      clearCart()
      fetchAll()
    } catch (e: any) {
      alert('Hata: ' + e.message)
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="flex gap-5" style={{ height: 'calc(100vh - 88px)', minHeight: '580px' }}>

      {/* LEFT: Product catalog */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-stone-900">Satış Ekranı</h2>
            <p className="text-stone-400 text-sm mt-0.5">
              {isAdminMode
                ? `${products.length} aktif ürün`
                : (cashierLocationName ?? 'Kasiyer modu')}
            </p>
          </div>
          {isAdminMode && (
            <select
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              className="border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors text-stone-700 bg-white"
            >
              <option value="">Lokasyon seçin...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
        </div>

        {/* Search bar */}
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
              <button
                onClick={() => { setSearch(''); searchRef.current?.focus() }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xl leading-none"
              >×</button>
            )}
          </div>
          <p className="text-stone-400 text-xs mt-1.5 ml-1">Barkod okutunca anında arar — tek sonuç kalırsa Enter ile sepete ekler</p>
        </div>

        {/* Product table */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-white border border-stone-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] w-12">Görsel</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürün Adı</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Barkod</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Satış ₺</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Min. ₺</th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Stok</th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Sepet</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex items-center justify-center gap-2.5">
                        <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                        <span className="text-stone-400 text-sm">Yükleniyor...</span>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-stone-400 text-sm">
                      "{search}" için ürün bulunamadı
                    </td>
                  </tr>
                ) : filtered.map(p => {
                  const stockHere = locationId
                    ? (p.stocks.find(s => s.location_id === locationId)?.quantity ?? 0)
                    : p.stocks.reduce((s, x) => s + x.quantity, 0)
                  const inCartQty = cart.filter(i => i.product.id === p.id).reduce((s, i) => s + i.quantity, 0)
                  const inCart = inCartQty > 0
                  return (
                    <tr
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className={`border-b border-stone-50 cursor-pointer select-none transition-colors active:bg-stone-100 ${
                        inCart ? 'bg-amber-50/40 hover:bg-amber-50/60' : 'hover:bg-stone-50'
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="w-10 h-10 bg-stone-100 rounded-sm flex items-center justify-center overflow-hidden flex-shrink-0">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-0.5" />
                          ) : (
                            <span className="text-stone-400 text-sm font-bold">{p.name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className={`font-semibold leading-tight ${inCart ? 'text-stone-900' : 'text-stone-800'}`}>{p.name}</p>
                      </td>
                      <td className="px-4 py-2.5 text-stone-400 font-mono text-xs">{p.barcode ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-stone-900 tabular-nums">₺{p.standard_price.toLocaleString('tr-TR')}</td>
                      <td className="px-4 py-2.5 text-right text-stone-500 tabular-nums">₺{p.min_sale_price.toLocaleString('tr-TR')}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-bold tabular-nums ${
                          stockHere === 0 ? 'text-red-500' : stockHere < 5 ? 'text-amber-600' : 'text-emerald-700'
                        }`}>{stockHere}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {inCart ? (
                          <span className="bg-[#F27A1A] text-white text-[10px] font-bold px-2.5 py-1 rounded-sm tabular-nums">
                            {inCartQty} adet
                          </span>
                        ) : (
                          <span className="text-stone-300 text-base">+</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
        </div>
      </div>

      {/* RIGHT: Two-step panel */}
      <div className="w-80 xl:w-96 flex-shrink-0 flex flex-col bg-white border border-stone-200 shadow-sm overflow-hidden">

        {/* ── STEP 1: Cart Review ── */}
        {step === 'cart' && (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.2em]">Sepet</p>
                <p className="text-stone-900 font-semibold text-sm mt-0.5">
                  {cart.length === 0 ? 'Boş' : `${cart.reduce((s, i) => s + i.quantity, 0)} adet · ${cart.length} çeşit`}
                </p>
              </div>
              {cart.length > 0 && (
                <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors">
                  Temizle
                </button>
              )}
            </div>

            {/* Items — scrollable, each row clearly separated */}
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
                    <div key={item.cartKey} className="px-4 py-3.5 bg-white hover:bg-stone-50/60 transition-colors">

                      {/* Row number + image + name + remove */}
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
                            }`}>
                              Miad: {new Date(item.expiry_date).toLocaleDateString('tr-TR')}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromCart(item.cartKey)}
                          className="text-stone-300 hover:text-red-400 text-xl leading-none flex-shrink-0 transition-colors"
                        >×</button>
                      </div>

                      {/* Qty + price + line total in one clean row */}
                      <div className="flex items-center gap-2 ml-7">
                        {/* Qty */}
                        <div className="flex items-center border border-stone-200 rounded-sm overflow-hidden flex-shrink-0">
                          <button onClick={() => setQty(item.cartKey, item.quantity - 1)} className="px-2.5 py-2 text-stone-500 hover:bg-stone-100 text-sm font-bold transition-colors">−</button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => setQty(item.cartKey, parseInt(e.target.value) || 1)}
                            className="w-10 text-center text-sm font-bold text-stone-900 border-x border-stone-200 py-2 outline-none tabular-nums bg-white"
                          />
                          <button onClick={() => setQty(item.cartKey, item.quantity + 1)} className="px-2.5 py-2 text-stone-500 hover:bg-stone-100 text-sm font-bold transition-colors">+</button>
                        </div>

                        {/* Unit price editable */}
                        <div className="flex items-center border border-stone-200 rounded-sm flex-1 overflow-hidden">
                          <span className="pl-2.5 text-stone-400 text-xs flex-shrink-0">₺</span>
                          <input
                            type="number"
                            step="0.5"
                            value={item.unit_price}
                            onChange={e => setPrice(item.cartKey, parseFloat(e.target.value) || 0)}
                            className="flex-1 min-w-0 px-1.5 py-2 text-sm font-semibold text-stone-900 outline-none tabular-nums bg-white"
                          />
                        </div>

                        {/* Line total */}
                        <span className="text-sm font-bold text-stone-900 tabular-nums w-16 text-right flex-shrink-0">
                          ₺{(item.quantity * item.unit_price).toLocaleString('tr-TR')}
                        </span>
                      </div>

                      {item.unit_price < item.product.min_sale_price && (
                        <p className="text-red-500 text-[10px] mt-2 ml-7 font-medium">
                          Min. fiyat: ₺{item.product.min_sale_price}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals + proceed button */}
            {cart.length > 0 && (
              <div className="border-t border-stone-100 px-4 py-4 space-y-2.5 flex-shrink-0">

                {/* Summary table */}
                <div className="bg-stone-50 border border-stone-100 rounded-sm px-4 py-3 space-y-2">

                  {/* Toplam Tutar */}
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.12em]">Toplam Tutar</span>
                    <span className="text-sm font-bold text-stone-900 tabular-nums">₺{subtotal.toLocaleString('tr-TR')}</span>
                  </div>

                  {/* Max İndirilebilecek */}
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.12em]">Max İndirim</span>
                    <span className={`text-sm font-bold tabular-nums ${maxDiscount > 0 ? 'text-emerald-700' : 'text-stone-400'}`}>
                      ₺{maxDiscount.toLocaleString('tr-TR')}
                    </span>
                  </div>

                  <div className="border-t border-stone-200 pt-2 space-y-2">
                    {/* Toplam Alınan — auto-fills discount */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.12em] flex-shrink-0">Alınan</label>
                      <div className="flex items-center border border-stone-200 rounded-sm overflow-hidden">
                        <span className="pl-2.5 text-stone-400 text-xs">₺</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={totalReceived}
                          onChange={e => handleTotalReceivedChange(e.target.value)}
                          placeholder={subtotal.toLocaleString('tr-TR')}
                          className="w-24 px-2 py-1.5 text-sm font-semibold text-stone-900 outline-none tabular-nums bg-white text-right"
                        />
                      </div>
                    </div>

                    {/* İndirim — auto-calculated or manual */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.12em] flex-shrink-0">İndirim</label>
                      <div className={`flex items-center border rounded-sm overflow-hidden ${discountAmt > maxDiscount ? 'border-red-300' : 'border-stone-200'}`}>
                        <span className="pl-2.5 text-stone-400 text-xs">₺</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={discount}
                          onChange={e => { setDiscount(e.target.value); setTotalReceived('') }}
                          placeholder="0"
                          className="w-24 px-2 py-1.5 text-sm font-semibold text-stone-900 outline-none tabular-nums bg-white text-right"
                        />
                      </div>
                    </div>
                    {discountAmt > maxDiscount && (
                      <p className="text-red-500 text-[10px] font-medium text-right">
                        Max indirimi aşıyor (₺{maxDiscount.toLocaleString('tr-TR')})
                      </p>
                    )}
                  </div>

                  {/* Ödenecek Toplam */}
                  <div className="flex justify-between items-center pt-2 border-t border-stone-200">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ödenecek</span>
                    <span className="text-2xl font-bold text-stone-900 tabular-nums">₺{total.toLocaleString('tr-TR')}</span>
                  </div>
                </div>

                {/* Proceed */}
                <button
                  onClick={() => setStep('payment')}
                  disabled={hasMinPriceError || discountAmt > maxDiscount}
                  className="w-full bg-[#F27A1A] hover:bg-[#E06010] disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-sm text-[11px] tracking-[0.3em] uppercase font-semibold transition-all"
                >
                  Ödemeye Geç →
                </button>
              </div>
            )}
          </>
        )}

        {/* ── STEP 2: Payment ── */}
        {step === 'payment' && (
          <>
            {/* Header with back button */}
            <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => { setStep('cart'); setPayment(null); setCashReceived('') }}
                className="text-stone-400 hover:text-stone-700 transition-colors text-lg leading-none flex-shrink-0"
                title="Sepete Dön"
              >←</button>
              <div>
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.2em]">Ödeme</p>
                <p className="text-stone-900 font-semibold text-sm mt-0.5">{cart.reduce((s, i) => s + i.quantity, 0)} adet</p>
              </div>
            </div>

            {/* Compact item summary — read-only, for cashier to confirm */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-3">Sipariş Özeti</p>
                <div className="space-y-2">
                  {cart.map((item, idx) => (
                    <div key={item.cartKey} className="flex items-center gap-2.5 bg-stone-50 border border-stone-100 rounded-sm px-3 py-2.5">
                      <span className="w-5 h-5 rounded-full bg-stone-200 text-stone-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      {item.product.image_url && (
                        <img src={item.product.image_url} alt={item.product.name} className="w-8 h-8 object-contain rounded-sm border border-stone-100 flex-shrink-0" />
                      )}
                      <p className="text-stone-800 font-semibold text-xs leading-tight flex-1">{item.product.name}</p>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-stone-900 tabular-nums">₺{(item.quantity * item.unit_price).toLocaleString('tr-TR')}</p>
                        <p className="text-[10px] text-stone-400">{item.quantity} × ₺{item.unit_price.toLocaleString('tr-TR')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Payment controls */}
              <div className="border-t border-stone-100 px-4 py-4 space-y-3.5">

              {/* Total prominent display */}
              <div className="bg-[#E06010] text-white rounded-sm px-4 py-3 flex justify-between items-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">Ödenecek Tutar</span>
                <span className="text-2xl font-bold tabular-nums">₺{total.toLocaleString('tr-TR')}</span>
              </div>

              {/* Customer */}
              <div>
                <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-2">Müşteri</label>

                {/* Mode toggle */}
                <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                  {([
                    { key: 'eski', label: 'Kayıtlı Hasta' },
                    { key: 'yeni', label: 'Yeni Hasta' },
                  ] as const).map(m => (
                    <button
                      key={m.key}
                      onClick={() => { setCustomerMode(m.key); setCustomerId(''); setCustomerSearch('') }}
                      className={`py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] rounded-sm border transition-all ${
                        customerMode === m.key
                          ? 'bg-[#F27A1A] text-white border-[#F27A1A]'
                          : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                      }`}
                    >{m.label}</button>
                  ))}
                </div>

                {/* Kayıtlı müşteri arama */}
                {customerMode === 'eski' && (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={e => { setCustomerSearch(e.target.value); setCustomerId('') }}
                        placeholder="İsim veya telefon ara..."
                        className="w-full border border-stone-200 rounded-sm px-3 py-2 text-xs outline-none focus:border-stone-400 transition-colors"
                        autoFocus
                      />
                    </div>
                    {customerSearch.trim() && !customerId && (
                      <div className="border border-stone-200 rounded-sm overflow-hidden max-h-36 overflow-y-auto">
                        {customers
                          .filter(c =>
                            c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                            (c.phone ?? '').includes(customerSearch)
                          )
                          .slice(0, 6)
                          .map(c => (
                            <button
                              key={c.id}
                              onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name + (c.phone ? ` — ${c.phone}` : '')) }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 border-b border-stone-100 last:border-0 transition-colors"
                            >
                              <span className="font-semibold text-stone-800">{c.name}</span>
                              {c.phone && <span className="text-stone-400 ml-2">{c.phone}</span>}
                            </button>
                          ))}
                        {customers.filter(c =>
                          c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                          (c.phone ?? '').includes(customerSearch)
                        ).length === 0 && (
                          <p className="px-3 py-2 text-xs text-stone-400">Sonuç bulunamadı</p>
                        )}
                      </div>
                    )}
                    {customerId && (
                      <div>
                        <div className="flex items-center justify-between bg-stone-50 border border-stone-100 rounded-sm px-3 py-2">
                          <span className="text-xs font-semibold text-stone-800">{customerSearch}</span>
                          <button onClick={() => { setCustomerId(''); setCustomerSearch('') }} className="text-stone-300 hover:text-red-400 text-lg leading-none transition-colors">×</button>
                        </div>
                        {referrerName && (
                          <div className="mt-1.5 bg-[#FFF3E8] border border-[#FDBA74] rounded-sm px-3 py-2">
                            <p className="text-[10px] font-bold text-[#E06010] uppercase tracking-[0.1em]">Referans Müşteri</p>
                            <p className="text-xs text-[#F27A1A] mt-0.5">
                              <span className="font-semibold">{referrerName}</span> yönlendirdi
                            </p>
                            {isFirstPurchase && (
                              <p className="text-[10px] text-[#F27A1A] mt-1 font-semibold">
                                ★ İlk alışveriş — ₺10 hoşgeldin indirimi uygula · {referrerName} ₺20 çek kazandı
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Yeni müşteri formu */}
                {customerMode === 'yeni' && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={e => setNewCustomerName(e.target.value)}
                      placeholder="Ad Soyad *"
                      className="w-full border border-stone-200 rounded-sm px-3 py-2 text-xs outline-none focus:border-stone-400 transition-colors"
                      autoFocus
                    />
                    <input
                      type="tel"
                      value={newCustomerPhone}
                      onChange={e => setNewCustomerPhone(e.target.value)}
                      placeholder="Telefon numarası"
                      className="w-full border border-stone-200 rounded-sm px-3 py-2 text-xs outline-none focus:border-stone-400 transition-colors"
                    />
                    {newCustomerName.trim() && (
                      <p className="text-[10px] text-emerald-600 font-medium">
                        Satış tamamlanınca müşteri kaydedilecek
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Payment method */}
              <div>
                <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-2">Ödeme Yöntemi</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['nakit', 'kart', 'iban', 'veresiye'] as PaymentMethod[]).map(m => (
                    <button
                      key={m}
                      onClick={() => { setPayment(m); if (m !== 'nakit') { setCashReceived(''); setSplitToVeresiye(false) } }}
                      className={`py-3 text-[10px] font-semibold uppercase tracking-[0.12em] rounded-sm border transition-all ${
                        payment === m
                          ? m === 'veresiye' ? 'bg-amber-600 text-white border-amber-600' : 'bg-[#F27A1A] text-white border-[#F27A1A]'
                          : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:text-stone-800'
                      }`}
                    >
                      {m === 'nakit' ? 'Nakit' : m === 'kart' ? 'Kart' : m === 'iban' ? 'İBAN' : 'Veresiye'}
                    </button>
                  ))}
                </div>
                {payment === 'veresiye' && (
                  <p className="text-[10px] text-amber-600 font-medium bg-amber-50 border border-amber-100 rounded-sm px-3 py-2 mt-1.5">
                    Veresiye seçildi — müşteri kaydı zorunludur. Stok düşürülür, ödeme beklemede kalır.
                  </p>
                )}
              </div>

              {/* Cash received */}
              {payment === 'nakit' && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1.5">Alınan Nakit (₺)</label>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={cashReceived}
                      onChange={e => { setCashReceived(e.target.value); setSplitToVeresiye(false) }}
                      placeholder={`min. ₺${total.toLocaleString('tr-TR')}`}
                      className="w-full border border-stone-200 rounded-sm px-3 py-2.5 text-sm font-semibold outline-none focus:border-stone-400 transition-colors tabular-nums"
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[50, 100, 200, 500].map(v => (
                      <button
                        key={v}
                        onClick={() => { setCashReceived(String(v)); setSplitToVeresiye(false) }}
                        className="py-1.5 text-[10px] font-semibold border border-stone-200 hover:border-stone-400 hover:bg-stone-50 text-stone-600 rounded-sm transition-colors"
                      >
                        ₺{v}
                      </button>
                    ))}
                  </div>
                  {cashVal > 0 && cashVal < total && !splitToVeresiye && (
                    <>
                      <p className="text-red-500 text-[10px] font-medium">Eksik: ₺{(total - cashVal).toLocaleString('tr-TR')}</p>
                      {customerValid ? (
                        <button
                          onClick={() => setSplitToVeresiye(true)}
                          className="w-full py-2.5 border border-amber-300 bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-[0.15em] rounded-sm hover:bg-amber-100 transition-colors"
                        >
                          ₺{(total - cashVal).toLocaleString('tr-TR')} Kalanı Veresiyeye At
                        </button>
                      ) : (
                        <p className="text-amber-600 text-[10px] font-semibold bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
                          Veresiyeye atmak için önce müşteri seçin
                        </p>
                      )}
                    </>
                  )}
                  {splitToVeresiye && cashVal > 0 && cashVal < total && (
                    <div className="bg-amber-50 border border-amber-200 rounded-sm px-3 py-3 space-y-2">
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.15em]">Kısmi Ödeme</p>
                      <div className="flex justify-between text-xs">
                        <span className="text-stone-600">Nakit alındı</span>
                        <span className="font-bold text-stone-900 tabular-nums">₺{cashVal.toLocaleString('tr-TR')}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-stone-600">Veresiyeye yazılacak</span>
                        <span className="font-bold text-amber-700 tabular-nums">₺{veresiyeAmt.toLocaleString('tr-TR')}</span>
                      </div>
                      <button
                        onClick={() => setSplitToVeresiye(false)}
                        className="w-full py-1.5 text-[10px] text-stone-500 hover:text-stone-700 font-medium transition-colors"
                      >
                        İptal — tam nakit alındı
                      </button>
                    </div>
                  )}
                  {cashVal >= total && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-sm px-3 py-2.5 flex justify-between items-center">
                      <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-[0.15em]">Para Üstü</span>
                      <span className="text-xl font-bold text-emerald-700 tabular-nums">₺{change.toLocaleString('tr-TR')}</span>
                    </div>
                  )}
                </div>
              )}

              </div>
            </div>

            {/* Pinned complete button — her zaman görünür */}
            <div className="flex-shrink-0 border-t-2 border-stone-200 px-4 py-3 bg-white">
              {hasMinPriceError && (
                <p className="text-red-500 text-[10px] font-semibold text-center mb-2">
                  Minimum fiyat hatası — fiyatları kontrol edin
                </p>
              )}
              {!payment && (
                <p className="text-stone-400 text-[10px] text-center mb-2">Ödeme yöntemi seçin</p>
              )}
              {(payment === 'veresiye' || splitToVeresiye) && !customerValid && (
                <p className="text-amber-600 text-[10px] font-semibold text-center mb-2">Veresiye için müşteri seçin veya yeni müşteri adı girin</p>
              )}
              <button
                onClick={completeSale}
                disabled={!canComplete}
                className="w-full bg-[#F27A1A] hover:bg-[#E06010] disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-sm text-[12px] tracking-[0.3em] uppercase font-bold transition-all shadow-md"
              >
                {completing ? 'Kaydediliyor...' : splitToVeresiye ? `Nakit ₺${cashVal.toLocaleString('tr-TR')} + Veresiye ₺${veresiyeAmt.toLocaleString('tr-TR')}` : 'Satışı Tamamla'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Batch / Miad selector modal */}
      {batchSelector && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-sm p-6 shadow-lg">
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.2em] mb-1">Miad Seçimi</p>
            <h3 className="text-stone-900 font-bold text-lg mb-1 leading-tight">{batchSelector.product.name}</h3>
            <p className="text-stone-400 text-xs mb-4">Hangi miaddan satılsın?</p>
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

      {/* Receipt modal */}
      {receipt && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white border border-stone-200 shadow-xl w-full max-w-xs p-6 flex flex-col gap-5">
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-stone-900 font-bold text-xl tracking-tight">Satış Tamamlandı</h3>
              <span className="inline-block mt-1.5 px-2.5 py-0.5 border border-stone-200 text-stone-500 text-[10px] font-semibold uppercase tracking-[0.15em] rounded-sm">
                {paymentLabels[receipt.method]}
              </span>
            </div>

            <div className="bg-stone-50 border border-stone-100 rounded-sm p-3.5 space-y-2">
              {receipt.items.map(item => (
                <div key={item.cartKey} className="flex justify-between text-xs text-stone-600">
                  <span className="flex-1 pr-2">{item.product.name} <span className="text-stone-400">× {item.quantity}</span></span>
                  <span className="tabular-nums font-semibold flex-shrink-0">₺{(item.quantity * item.unit_price).toLocaleString('tr-TR')}</span>
                </div>
              ))}
              <div className="pt-2.5 border-t border-stone-200 flex justify-between items-center">
                <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Toplam</span>
                <span className="text-2xl font-bold text-stone-900 tabular-nums">₺{receipt.total.toLocaleString('tr-TR')}</span>
              </div>
              {receipt.method === 'nakit' && receipt.change > 0 && !receipt.splitVeresiye && (
                <div className="flex justify-between items-center pt-1">
                  <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-[0.15em]">Para Üstü</span>
                  <span className="text-xl font-bold text-emerald-700 tabular-nums">₺{receipt.change.toLocaleString('tr-TR')}</span>
                </div>
              )}
              {receipt.splitVeresiye && (
                <div className="mt-1 pt-2 border-t border-stone-200 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-500">Nakit alındı</span>
                    <span className="font-semibold text-stone-800 tabular-nums">₺{(receipt.total - receipt.splitVeresiye).toLocaleString('tr-TR')}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-600 font-semibold">Veresiyeye yazıldı</span>
                    <span className="font-bold text-amber-700 tabular-nums">₺{receipt.splitVeresiye.toLocaleString('tr-TR')}</span>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => { setReceipt(null); setTimeout(() => searchRef.current?.focus(), 0) }}
              className="w-full bg-[#F27A1A] hover:bg-[#E06010] text-white py-3.5 rounded-sm text-[11px] tracking-[0.3em] uppercase font-semibold transition-colors"
            >
              Yeni Satış
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
