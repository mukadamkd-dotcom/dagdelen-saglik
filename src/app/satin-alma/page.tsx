'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Product, Location } from '@/types'

const emptyForm = { product_id: '', quantity: '', purchase_price: '', invoice_no: '', purchase_date: new Date().toISOString().split('T')[0], notes: '', expiry_date: '' }

export default function SatinAlmaPage() {
  const [purchases, setPurchases] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [depo, setDepo] = useState<Location | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: purData }, { data: prodData }, { data: locData }] = await Promise.all([
      supabase.from('purchases').select('*, products(name, unit)').order('created_at', { ascending: false }).limit(50),
      supabase.from('products').select('id, name, unit, purchase_price').eq('is_active', true).order('name'),
      supabase.from('locations').select('*').eq('type', 'depo').single(),
    ])
    setPurchases(purData ?? [])
    setProducts(prodData ?? [])
    setDepo(locData)
    setLoading(false)
  }

  async function handleSave() {
    if (!form.product_id || !form.quantity || !form.purchase_price) return alert('Ürün, miktar ve fiyat zorunludur.')
    if (!depo) return alert('Ana Depo bulunamadı.')
    setSaving(true)

    const { data: pur } = await supabase.from('purchases').insert({
      product_id: form.product_id,
      quantity: Number(form.quantity),
      purchase_price: Number(form.purchase_price),
      invoice_no: form.invoice_no || null,
      purchase_date: form.purchase_date,
      notes: form.notes || null,
      expiry_date: form.expiry_date || null,
    }).select().single()

    const { data: existing } = await supabase.from('inventory').select('id, quantity').eq('product_id', form.product_id).eq('location_id', depo.id).single()
    if (existing) {
      await supabase.from('inventory').update({ quantity: Number(existing.quantity) + Number(form.quantity) }).eq('id', existing.id)
    } else {
      await supabase.from('inventory').insert({ product_id: form.product_id, location_id: depo.id, quantity: Number(form.quantity) })
    }

    if (form.expiry_date) {
      const { data: existingBatch } = await supabase.from('inventory_batches')
        .select('id, quantity').eq('product_id', form.product_id).eq('location_id', depo.id).eq('expiry_date', form.expiry_date).maybeSingle()
      if (existingBatch) {
        await supabase.from('inventory_batches').update({ quantity: Number(existingBatch.quantity) + Number(form.quantity) }).eq('id', existingBatch.id)
      } else {
        await supabase.from('inventory_batches').insert({ product_id: form.product_id, location_id: depo.id, expiry_date: form.expiry_date, quantity: Number(form.quantity) })
      }
    }

    await supabase.from('stock_movements').insert({ product_id: form.product_id, to_location_id: depo.id, quantity: Number(form.quantity), movement_type: 'satin_alma', reference_id: pur?.id, notes: form.notes || null })

    setSaving(false)
    setShowModal(false)
    setForm(emptyForm)
    fetchAll()
  }

  function autoFillPrice(productId: string) {
    const p = products.find(x => x.id === productId)
    if (p) setForm(f => ({ ...f, product_id: productId, purchase_price: String(p.purchase_price) }))
  }

  const inp = "w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors"

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Satın Alma</h2>
          <p className="text-stone-400 text-sm mt-1">Eczaneden alınan ürünler → Ana Depo</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all">
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
          <div className="bg-white rounded border border-stone-200 w-full max-w-lg p-7 shadow-lg">
            <h3 className="text-xl font-bold text-stone-900 mb-6">Yeni Alım Kaydı</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Ürün *</label>
                <select className={inp} value={form.product_id} onChange={e => autoFillPrice(e.target.value)}>
                  <option value="">Ürün seçin...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Miktar *</label>
                  <input type="number" className={inp} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Alış Fiyatı ₺ *</label>
                  <input type="number" step="0.01" className={inp} value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} />
                </div>
              </div>
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
              {form.quantity && form.purchase_price && (
                <div className="bg-stone-50 border border-stone-200 rounded-sm p-3.5 text-sm">
                  <span className="text-stone-600">Toplam: </span>
                  <strong className="text-stone-900">₺{(Number(form.quantity) * Number(form.purchase_price)).toLocaleString('tr-TR')}</strong>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-7">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
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
