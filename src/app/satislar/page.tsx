'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Location } from '@/types'
import { useMode } from '@/contexts/ModeContext'

interface SaleItem { product_id: string; quantity: number; sale_price: number; purchase_price: number }

const emptyForm = { location_id: '', customer_id: '', channel: 'fiziksel', discount_amount: '0', notes: '' }

const channelMap: Record<string, string> = { fiziksel: 'Fiziksel', instagram: 'Instagram', online: 'Online' }
const channelColors: Record<string, string> = {
  fiziksel: 'border border-stone-200 text-stone-600 bg-stone-50',
  instagram: 'border border-pink-200 text-pink-700 bg-pink-50/50',
  online: 'border border-stone-200 text-stone-600 bg-stone-50',
}
const statusMap: Record<string, { style: string }> = {
  tamamlandi: { style: 'border border-emerald-200 text-emerald-700 bg-emerald-50/50' },
  iptal: { style: 'border border-red-200 text-red-600 bg-red-50/50' },
  iade: { style: 'border border-amber-200 text-amber-700 bg-amber-50/50' },
}

export default function SatislarPage() {
  const [sales, setSales] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [items, setItems] = useState<SaleItem[]>([{ product_id: '', quantity: 1, sale_price: 0, purchase_price: 0 }])
  const [saving, setSaving] = useState(false)
  const [filterLoc, setFilterLoc] = useState('')
  const { isAdminMode, cashierLocationId } = useMode()

  useEffect(() => {
    if (!isAdminMode && cashierLocationId) setFilterLoc(cashierLocationId)
  }, [isAdminMode, cashierLocationId])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: s }, { data: p }, { data: l }, { data: c }] = await Promise.all([
      supabase.from('sales').select('*, locations(name), customers(name), sale_items(*, products(name))').order('created_at', { ascending: false }).limit(60),
      supabase.from('products').select('id, name, unit, standard_price, min_sale_price, purchase_price').eq('is_active', true).order('name'),
      supabase.from('locations').select('*').order('name'),
      supabase.from('customers').select('id, name, phone').order('name'),
    ])
    setSales(s ?? [])
    setProducts(p ?? [])
    setLocations(l ?? [])
    setCustomers(c ?? [])
    setLoading(false)
  }

  function addItem() { setItems(i => [...i, { product_id: '', quantity: 1, sale_price: 0, purchase_price: 0 }]) }
  function removeItem(idx: number) { setItems(i => i.filter((_, j) => j !== idx)) }
  function updateItem(idx: number, field: keyof SaleItem, val: string | number) {
    setItems(items => items.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [field]: val }
      if (field === 'product_id') {
        const p = products.find(x => x.id === val)
        if (p) { updated.sale_price = p.standard_price; updated.purchase_price = p.purchase_price }
      }
      return updated
    }))
  }

  const totalAmount = items.reduce((s, i) => s + (i.quantity * i.sale_price), 0) - Number(form.discount_amount || 0)

  async function handleSave() {
    if (!form.location_id || items.some(i => !i.product_id)) return alert('Lokasyon ve tüm ürünler zorunludur.')
    for (const item of items) {
      const p = products.find(x => x.id === item.product_id)
      if (p && item.sale_price < p.min_sale_price) return alert(`"${p.name}" için minimum satış fiyatı ₺${p.min_sale_price}. ₺${item.sale_price} kabul edilemez.`)
    }
    setSaving(true)

    const { data: sale } = await supabase.from('sales').insert({ location_id: form.location_id, customer_id: form.customer_id || null, channel: form.channel, total_amount: totalAmount, discount_amount: Number(form.discount_amount || 0), notes: form.notes || null }).select().single()

    for (const item of items) {
      await supabase.from('sale_items').insert({ sale_id: sale.id, product_id: item.product_id, quantity: item.quantity, sale_price: item.sale_price, purchase_price: item.purchase_price, profit: (item.sale_price - item.purchase_price) * item.quantity })
      const { data: inv } = await supabase.from('inventory').select('id, quantity').eq('product_id', item.product_id).eq('location_id', form.location_id).single()
      if (inv) await supabase.from('inventory').update({ quantity: Math.max(0, Number(inv.quantity) - item.quantity) }).eq('id', inv.id)
      await supabase.from('stock_movements').insert({ product_id: item.product_id, from_location_id: form.location_id, quantity: item.quantity, movement_type: 'satis', reference_id: sale.id })
    }

    setSaving(false)
    setShowModal(false)
    setForm(emptyForm)
    setItems([{ product_id: '', quantity: 1, sale_price: 0, purchase_price: 0 }])
    fetchAll()
  }

  const filtered = filterLoc ? sales.filter(s => s.location_id === filterLoc) : sales

  const inp = "w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors"
  const inpSm = "w-full border border-stone-200 rounded-sm px-2.5 py-2 text-sm outline-none focus:border-stone-400 transition-colors bg-white"

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-stone-900">Satışlar</h2>
          <p className="text-stone-400 text-sm mt-1">{sales.length} kayıt</p>
        </div>
        <button
          onClick={() => {
            setForm({ ...emptyForm, location_id: !isAdminMode && cashierLocationId ? cashierLocationId : '' })
            setShowModal(true)
          }}
          className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all"
        >
          + Yeni Satış
        </button>
      </div>

      {isAdminMode && (
        <div className="bg-white border border-stone-200 shadow-sm mb-5 p-4 flex gap-3">
          <select
            className="border border-stone-200 rounded-sm px-3.5 py-2 text-sm outline-none focus:border-stone-400 transition-colors text-stone-700 bg-white cursor-pointer"
            value={filterLoc}
            onChange={e => setFilterLoc(e.target.value)}
          >
            <option value="">Tüm Lokasyonlar</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      <div className="bg-white border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Tarih</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Lokasyon</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Kanal</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Müşteri</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürünler</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Toplam</th>
                {isAdminMode && <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Kar</th>}
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Durum</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isAdminMode ? 8 : 7} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                      <span className="text-stone-400 text-sm">Yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={isAdminMode ? 8 : 7} className="px-5 py-12 text-center text-stone-400 text-sm">Satış bulunamadı</td></tr>
              ) : filtered.map(s => {
                const profit = (s.sale_items ?? []).reduce((sum: number, i: any) => sum + Number(i.profit ?? 0), 0)
                const badge = statusMap[s.status]
                return (
                  <tr key={s.id} className="border-b border-stone-50 hover:bg-stone-50/70 transition-colors">
                    <td className="px-5 py-3.5 text-stone-500">{new Date(s.sale_date).toLocaleDateString('tr-TR')}</td>
                    <td className="px-5 py-3.5 font-medium text-stone-700">{s.locations?.name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${channelColors[s.channel] ?? 'border border-stone-200 text-stone-600 bg-stone-50'}`}>
                        {channelMap[s.channel] ?? s.channel}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-stone-600">{s.customers?.name ?? 'Anonim'}</td>
                    <td className="px-5 py-3.5 text-stone-500 max-w-[180px] truncate">{(s.sale_items ?? []).map((i: any) => i.products?.name).join(', ')}</td>
                    <td className="px-5 py-3.5 font-bold text-stone-900 tabular-nums">₺{Number(s.total_amount).toLocaleString('tr-TR')}</td>
                    {isAdminMode && <td className="px-5 py-3.5 font-semibold text-stone-700 tabular-nums">₺{profit.toLocaleString('tr-TR')}</td>}
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${badge ? badge.style : 'border border-stone-200 text-stone-600'}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-2xl p-7 shadow-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-stone-900 mb-6 tracking-tight">Yeni Satış</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Lokasyon *</label>
                  {isAdminMode ? (
                    <select className={inp} value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}>
                      <option value="">Seçin...</option>
                      {locations.filter(l => l.type !== 'website').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  ) : (
                    <input className={inp} value={locations.find(l => l.id === cashierLocationId)?.name ?? ''} readOnly />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Kanal</label>
                  <select className={inp} value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
                    <option value="fiziksel">Fiziksel</option>
                    <option value="instagram">Instagram</option>
                    <option value="online">Online</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Müşteri</label>
                <select className={inp} value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                  <option value="">Anonim Müşteri</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `- ${c.phone}` : ''}</option>)}
                </select>
              </div>

              <div className="border border-stone-200 rounded p-4 bg-stone-50/50">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-stone-600 uppercase tracking-[0.1em]">Ürünler</p>
                  <button onClick={addItem} className="text-stone-700 hover:text-stone-900 text-xs font-semibold transition-colors">+ Ürün Ekle</button>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-center">
                    <div className="col-span-5">
                      <select className={inpSm} value={item.product_id} onChange={e => updateItem(idx, 'product_id', e.target.value)}>
                        <option value="">Ürün...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input type="number" min="1" placeholder="Adet" className={inpSm} value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} />
                    </div>
                    <div className="col-span-3">
                      <input type="number" step="0.01" placeholder="Fiyat ₺" className={inpSm} value={item.sale_price} onChange={e => updateItem(idx, 'sale_price', Number(e.target.value))} />
                    </div>
                    <div className="col-span-1 text-xs text-stone-500 text-center tabular-nums">₺{(item.quantity * item.sale_price).toLocaleString('tr-TR')}</div>
                    <div className="col-span-1 text-center">
                      {items.length > 1 && (
                        <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 text-xl leading-none transition-colors">×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">İndirim ₺</label>
                <input type="number" step="0.01" className={inp} value={form.discount_amount} onChange={e => setForm(f => ({ ...f, discount_amount: e.target.value }))} />
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded p-3.5 text-sm">
                <span className="text-stone-600 font-medium">Toplam: </span>
                <strong className="text-stone-900 text-lg font-bold tabular-nums">₺{totalAmount.toLocaleString('tr-TR')}</strong>
              </div>
            </div>
            <div className="flex gap-3 mt-7">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                {saving ? 'Kaydediliyor...' : 'Satışı Tamamla'}
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
