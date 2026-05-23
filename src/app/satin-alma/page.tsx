'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Product, Location } from '@/types'

const emptyForm = { product_id: '', quantity: '', purchase_price: '', invoice_no: '', purchase_date: new Date().toISOString().split('T')[0], notes: '', expiry_date: '' }
const emptyNewProduct = { name: '', barcode: '', category: '', unit: 'adet', standard_price: '', min_sale_price: '' }

export default function SatinAlmaPage() {
  const [purchases, setPurchases] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [depo, setDepo] = useState<Location | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  // Ürün arama
  const [productSearch, setProductSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Yeni ürün formu
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [newProduct, setNewProduct] = useState(emptyNewProduct)

  // KDV
  const [kdvRate, setKdvRate] = useState<0 | 1 | 10 | 20>(0)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: purData }, { data: prodData }, { data: locData }] = await Promise.all([
      supabase.from('purchases').select('*, products(name, unit)').order('created_at', { ascending: false }).limit(50),
      supabase.from('products').select('id, name, barcode, unit, purchase_price').eq('is_active', true).order('name'),
      supabase.from('locations').select('*').eq('type', 'depo').single(),
    ])
    setPurchases(purData ?? [])
    setProducts(prodData ?? [])
    setDepo(locData)
    setLoading(false)
  }

  function openModal() {
    setForm(emptyForm)
    setProductSearch('')
    setSelectedProduct(null)
    setShowDropdown(false)
    setShowNewProduct(false)
    setNewProduct(emptyNewProduct)
    setKdvRate(0)
    setShowModal(true)
  }

  function selectProduct(p: any) {
    setSelectedProduct(p)
    setProductSearch(p.name + (p.barcode ? ` — ${p.barcode}` : ''))
    setForm(f => ({ ...f, product_id: p.id, purchase_price: String(p.purchase_price) }))
    setShowDropdown(false)
    setShowNewProduct(false)
  }

  function handleSearchChange(val: string) {
    setProductSearch(val)
    setSelectedProduct(null)
    setForm(f => ({ ...f, product_id: '' }))
    setShowDropdown(true)
    setShowNewProduct(false)
    // Barkod aramasında tek eşleşme varsa otomatik seç
    const exact = products.find(p => p.barcode === val.trim())
    if (exact) { selectProduct(exact); return }
  }

  const filteredProducts = productSearch.trim() && !selectedProduct
    ? products.filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.barcode ?? '').includes(productSearch.trim())
      ).slice(0, 8)
    : []

  async function handleSave() {
    if (!depo) return alert('Ana Depo bulunamadı.')

    let productId = form.product_id

    // Yeni ürün oluştur
    if (showNewProduct) {
      if (!newProduct.name || !newProduct.standard_price || !form.purchase_price) {
        return alert('Yeni ürün için ad, satış fiyatı ve alış fiyatı zorunludur.')
      }
      const { data: created, error } = await supabase.from('products').insert({
        name: newProduct.name.trim(),
        barcode: newProduct.barcode.trim() || null,
        category: newProduct.category.trim() || null,
        unit: newProduct.unit,
        purchase_price: Number(form.purchase_price),
        standard_price: Number(newProduct.standard_price),
        min_sale_price: Number(newProduct.min_sale_price) || Number(newProduct.standard_price),
        is_active: true,
      }).select('id').single()
      if (error || !created) return alert('Ürün oluşturulamadı: ' + error?.message)
      productId = created.id
      await fetchAll()
    }

    if (!productId || !form.quantity || !form.purchase_price) return alert('Ürün, miktar ve fiyat zorunludur.')
    setSaving(true)

    const { data: pur } = await supabase.from('purchases').insert({
      product_id: productId,
      quantity: Number(form.quantity),
      purchase_price: Number(form.purchase_price),
      invoice_no: form.invoice_no || null,
      purchase_date: form.purchase_date,
      notes: form.notes || null,
      expiry_date: form.expiry_date || null,
    }).select().single()

    const { data: existing } = await supabase.from('inventory').select('id, quantity').eq('product_id', productId).eq('location_id', depo.id).single()
    if (existing) {
      await supabase.from('inventory').update({ quantity: Number(existing.quantity) + Number(form.quantity) }).eq('id', existing.id)
    } else {
      await supabase.from('inventory').insert({ product_id: productId, location_id: depo.id, quantity: Number(form.quantity) })
    }

    if (form.expiry_date) {
      const { data: existingBatch } = await supabase.from('inventory_batches')
        .select('id, quantity').eq('product_id', productId).eq('location_id', depo.id).eq('expiry_date', form.expiry_date).maybeSingle()
      if (existingBatch) {
        await supabase.from('inventory_batches').update({ quantity: Number(existingBatch.quantity) + Number(form.quantity) }).eq('id', existingBatch.id)
      } else {
        await supabase.from('inventory_batches').insert({ product_id: productId, location_id: depo.id, expiry_date: form.expiry_date, quantity: Number(form.quantity) })
      }
    }

    await supabase.from('stock_movements').insert({ product_id: productId, to_location_id: depo.id, quantity: Number(form.quantity), movement_type: 'satin_alma', reference_id: pur?.id, notes: form.notes || null })

    setSaving(false)
    setShowModal(false)
    fetchAll()
  }

  const inp = "w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors"

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Satın Alma</h2>
          <p className="text-stone-400 text-sm mt-1">Eczaneden alınan ürünler → Ana Depo</p>
        </div>
        <button onClick={openModal} className="bg-[#F27A1A] hover:bg-[#E06010] text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all">
          + Yeni Alım
        </button>
      </div>

      <div className="bg-white rounded-sm border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Tarih</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürün</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Miktar</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Alış Fiyatı</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Toplam</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Miad</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Fatura No</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Not</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                      <span className="text-stone-400 text-sm">Yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-stone-400 text-sm">Henüz alım yapılmamış</td></tr>
              ) : purchases.map(p => (
                <tr key={p.id} className="border-b border-stone-100 hover:bg-stone-50/70 transition-colors">
                  <td className="px-5 py-3.5 text-stone-400">{new Date(p.purchase_date).toLocaleDateString('tr-TR')}</td>
                  <td className="px-5 py-3.5 font-semibold text-stone-900">{p.products?.name}</td>
                  <td className="px-5 py-3.5 text-stone-600 tabular-nums">{p.quantity} {p.products?.unit}</td>
                  <td className="px-5 py-3.5 text-stone-600 tabular-nums">₺{Number(p.purchase_price).toLocaleString('tr-TR')}</td>
                  <td className="px-5 py-3.5 font-bold text-stone-900 tabular-nums">₺{(Number(p.quantity) * Number(p.purchase_price)).toLocaleString('tr-TR')}</td>
                  <td className="px-5 py-3.5 tabular-nums">
                    {p.expiry_date ? (
                      <span className={`text-xs font-semibold ${
                        (() => { const d = Math.floor((new Date(p.expiry_date).getTime() - Date.now()) / 86400000); return d < 0 ? 'text-red-600' : d <= 30 ? 'text-amber-600' : 'text-stone-500' })()
                      }`}>
                        {new Date(p.expiry_date).toLocaleDateString('tr-TR')}
                      </span>
                    ) : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-stone-400 font-mono text-xs">{p.invoice_no ?? '-'}</td>
                  <td className="px-5 py-3.5 text-stone-400">{p.notes ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-lg p-7 shadow-lg max-h-[92vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-stone-900 mb-6">Yeni Alım Kaydı</h3>
            <div className="space-y-4">

              {/* Ürün arama */}
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Ürün *</label>
                <div className="relative">
                  <input
                    ref={searchRef}
                    autoFocus
                    className={inp + ' pr-8'}
                    placeholder="Ürün adı veya barkod ile ara..."
                    value={productSearch}
                    onChange={e => handleSearchChange(e.target.value)}
                    onFocus={() => { if (!selectedProduct && productSearch.trim()) setShowDropdown(true) }}
                  />
                  {selectedProduct && (
                    <button
                      onClick={() => { setSelectedProduct(null); setProductSearch(''); setForm(f => ({ ...f, product_id: '', purchase_price: '' })); setTimeout(() => searchRef.current?.focus(), 0) }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-red-500 text-lg leading-none"
                    >×</button>
                  )}
                </div>

                {/* Dropdown sonuçlar */}
                {showDropdown && filteredProducts.length > 0 && (
                  <div className="border border-stone-200 rounded-sm mt-1 overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                    {filteredProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => selectProduct(p)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-[#FFF3E8] border-b border-stone-50 last:border-0 transition-colors flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-stone-800">{p.name}</p>
                          {p.barcode && <p className="text-xs text-stone-400 font-mono">{p.barcode}</p>}
                        </div>
                        <span className="text-xs text-stone-400 flex-shrink-0">₺{Number(p.purchase_price).toLocaleString('tr-TR')}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Sonuç yok → yeni ürün öner */}
                {showDropdown && productSearch.trim().length >= 2 && filteredProducts.length === 0 && !selectedProduct && (
                  <div className="border border-dashed border-amber-300 rounded-sm mt-1 px-4 py-3 bg-amber-50">
                    <p className="text-sm text-amber-700 font-semibold mb-2">"{productSearch}" sistemde bulunamadı</p>
                    <button
                      onClick={() => { setShowNewProduct(true); setShowDropdown(false); setNewProduct(f => ({ ...f, name: productSearch, barcode: products.find(p => p.barcode === productSearch.trim()) ? '' : /^\d{8,14}$/.test(productSearch.trim()) ? productSearch.trim() : '' })) }}
                      className="text-[11px] font-bold uppercase tracking-wider text-white px-4 py-2 rounded transition-colors"
                      style={{ background: '#F27A1A' }}
                    >
                      + Yeni Ürün Olarak Ekle
                    </button>
                  </div>
                )}

                {/* Seçili ürün etiketi */}
                {selectedProduct && (
                  <div className="mt-1.5 flex items-center gap-2 bg-[#FFF3E8] border border-[#FDBA74] rounded-sm px-3 py-2">
                    <span className="text-xs font-bold text-[#F27A1A]">✓</span>
                    <span className="text-sm font-semibold text-stone-800">{selectedProduct.name}</span>
                    {selectedProduct.barcode && <span className="text-xs text-stone-400 font-mono">{selectedProduct.barcode}</span>}
                  </div>
                )}
              </div>

              {/* Yeni ürün formu */}
              {showNewProduct && (
                <div className="border border-amber-200 rounded-sm p-4 bg-amber-50/50 space-y-3">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Yeni Ürün Bilgileri</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 mb-1">Ürün Adı *</label>
                      <input className={inp} value={newProduct.name} onChange={e => setNewProduct(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 mb-1">Barkod</label>
                      <input className={inp} placeholder="8-14 hane" value={newProduct.barcode} onChange={e => setNewProduct(f => ({ ...f, barcode: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 mb-1">Kategori</label>
                      <input className={inp} value={newProduct.category} onChange={e => setNewProduct(f => ({ ...f, category: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 mb-1">Birim</label>
                      <select className={inp} value={newProduct.unit} onChange={e => setNewProduct(f => ({ ...f, unit: e.target.value }))}>
                        <option>adet</option><option>kutu</option><option>paket</option><option>şişe</option><option>kg</option><option>lt</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 mb-1">Satış Fiyatı ₺ *</label>
                      <input type="number" step="0.01" className={inp} value={newProduct.standard_price} onChange={e => setNewProduct(f => ({ ...f, standard_price: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 mb-1">Min. Satış ₺</label>
                      <input type="number" step="0.01" className={inp} placeholder="Boş bırakılırsa satış fiyatı" value={newProduct.min_sale_price} onChange={e => setNewProduct(f => ({ ...f, min_sale_price: e.target.value }))} />
                    </div>
                  </div>
                  <button onClick={() => { setShowNewProduct(false); setProductSearch(''); }} className="text-xs text-stone-400 hover:text-stone-600 underline">İptal — mevcut ürünü seç</button>
                </div>
              )}
              {/* Miktar */}
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Miktar *</label>
                <input type="number" className={inp} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>

              {/* Alış Fiyatı + KDV */}
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Alış Fiyatı (KDV Hariç) ₺ *</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    className={inp}
                    placeholder="0.00"
                    value={form.purchase_price}
                    onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))}
                  />
                  <div className="flex border border-stone-200 rounded-sm overflow-hidden flex-shrink-0">
                    {([0, 1, 10, 20] as const).map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setKdvRate(r)}
                        className={`px-3 py-2 text-xs font-bold transition-colors border-r border-stone-200 last:border-0 ${kdvRate === r ? 'text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
                        style={kdvRate === r ? { background: '#F27A1A' } : {}}
                      >
                        {r === 0 ? 'KDV Yok' : `%${r}`}
                      </button>
                    ))}
                  </div>
                </div>
                {kdvRate > 0 && form.purchase_price && (
                  <p className="text-xs text-stone-500 mt-1">
                    KDV Dahil: <span className="font-semibold text-stone-800">₺{(Number(form.purchase_price) * (1 + kdvRate / 100)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-stone-400 ml-1">(KDV: ₺{(Number(form.purchase_price) * kdvRate / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                  </p>
                )}
              </div>

              {/* Barkod — yeni ürün kaydında alış fiyatının altında hızlı giriş */}
              {showNewProduct && (
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">
                    Barkod <span className="text-stone-400 font-normal text-xs">— yeni ürün için</span>
                  </label>
                  <input
                    className={inp}
                    placeholder="Barkod okut veya yaz..."
                    value={newProduct.barcode}
                    onChange={e => setNewProduct(f => ({ ...f, barcode: e.target.value }))}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Tarih</label>
                  <input type="date" className={inp} value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Fatura No</label>
                  <input className={inp} value={form.invoice_no} onChange={e => setForm(f => ({ ...f, invoice_no: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Son Kullanma Tarihi (Miad)</label>
                <input type="date" className={inp} value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
                <p className="text-stone-400 text-xs mt-1">Miad girilirse, stok parti takibine eklenir</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Not</label>
                <textarea className={inp} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {/* Toplam özet */}
              {form.quantity && form.purchase_price && (
                <div className="bg-stone-50 border border-stone-200 rounded-sm p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Birim fiyat (KDV hariç)</span>
                    <span className="font-semibold text-stone-800">₺{Number(form.purchase_price).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {kdvRate > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">Birim fiyat (KDV %{kdvRate} dahil)</span>
                      <span className="font-semibold text-stone-800">₺{(Number(form.purchase_price) * (1 + kdvRate / 100)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="border-t border-stone-200 pt-2 flex justify-between">
                    <span className="text-sm font-bold text-stone-700">{form.quantity} adet × KDV hariç toplam</span>
                    <span className="font-bold text-stone-900">₺{(Number(form.quantity) * Number(form.purchase_price)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {kdvRate > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm font-bold" style={{ color: '#F27A1A' }}>KDV Dahil Genel Toplam</span>
                      <span className="font-bold text-lg" style={{ color: '#F27A1A' }}>₺{(Number(form.quantity) * Number(form.purchase_price) * (1 + kdvRate / 100)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-7">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#F27A1A] hover:bg-[#E06010] disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button onClick={() => setShowModal(false)} className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
