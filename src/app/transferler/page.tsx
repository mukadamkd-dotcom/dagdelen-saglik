'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Product, Location } from '@/types'

const emptyForm = { product_id: '', from_location_id: '', to_location_id: '', quantity: '', transfer_price: '', notes: '' }
const statusMap: Record<string, { border: string; text: string; bg: string }> = {
  beklemede: { border: 'border-amber-200', text: 'text-amber-700', bg: 'bg-amber-50/50' },
  tamamlandi: { border: 'border-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50/50' },
  iptal: { border: 'border-red-200', text: 'text-red-600', bg: 'bg-red-50/50' },
}

export default function TransferlerPage() {
  const [transfers, setTransfers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: t }, { data: p }, { data: l }] = await Promise.all([
      supabase.from('transfers').select('*, products(name, unit), from_location:locations!transfers_from_location_id_fkey(name), to_location:locations!transfers_to_location_id_fkey(name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('products').select('id, name, unit, purchase_price').eq('is_active', true).order('name'),
      supabase.from('locations').select('*').order('name'),
    ])
    setTransfers(t ?? [])
    setProducts(p ?? [])
    setLocations(l ?? [])
    setLoading(false)
  }

  function autoFillPrice(productId: string) {
    const p = products.find(x => x.id === productId)
    if (p) setForm(f => ({ ...f, product_id: productId, transfer_price: String(p.purchase_price) }))
  }

  async function handleSave() {
    if (!form.product_id || !form.from_location_id || !form.to_location_id || !form.quantity || !form.transfer_price) return alert('Tüm alanlar zorunludur.')
    if (form.from_location_id === form.to_location_id) return alert('Kaynak ve hedef lokasyon aynı olamaz.')
    setSaving(true)

    const qty = Number(form.quantity)
    const price = Number(form.transfer_price)
    const total = qty * price

    const { data: fromInv } = await supabase.from('inventory').select('id, quantity').eq('product_id', form.product_id).eq('location_id', form.from_location_id).single()
    if (!fromInv || fromInv.quantity < qty) { setSaving(false); return alert('Yeterli stok yok.') }

    const { data: transfer } = await supabase.from('transfers').insert({ product_id: form.product_id, from_location_id: form.from_location_id, to_location_id: form.to_location_id, quantity: qty, transfer_price: price, notes: form.notes || null }).select().single()

    await supabase.from('inventory').update({ quantity: Number(fromInv.quantity) - qty }).eq('id', fromInv.id)

    const { data: toInv } = await supabase.from('inventory').select('id, quantity').eq('product_id', form.product_id).eq('location_id', form.to_location_id).single()
    if (toInv) {
      await supabase.from('inventory').update({ quantity: Number(toInv.quantity) + qty }).eq('id', toInv.id)
    } else {
      await supabase.from('inventory').insert({ product_id: form.product_id, location_id: form.to_location_id, quantity: qty })
    }

    await supabase.from('internal_debts').insert({ debtor_location_id: form.to_location_id, creditor_location_id: form.from_location_id, amount: total, transfer_id: transfer.id })
    await supabase.from('stock_movements').insert({ product_id: form.product_id, from_location_id: form.from_location_id, to_location_id: form.to_location_id, quantity: qty, movement_type: 'transfer', reference_id: transfer.id })

    setSaving(false)
    setShowModal(false)
    setForm(emptyForm)
    fetchAll()
  }

  const inp = "w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors"

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Lokasyonlar Arası Transfer</h2>
          <p className="text-stone-400 text-sm mt-1">Transfer yapıldığında iç borç otomatik oluşur</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all">
          + Yeni Transfer
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
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Gönderen</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Alan</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Fiyat</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Toplam Borç</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Durum</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                      <span className="text-stone-400 text-sm">Yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-stone-400 text-sm">Henüz transfer yapılmamış</td></tr>
              ) : transfers.map(t => {
                const badge = statusMap[t.status]
                return (
                  <tr key={t.id} className="border-b border-stone-100 hover:bg-stone-50/70 transition-colors">
                    <td className="px-5 py-3.5 text-stone-400">{new Date(t.created_at).toLocaleDateString('tr-TR')}</td>
                    <td className="px-5 py-3.5 font-semibold text-stone-900">{t.products?.name}</td>
                    <td className="px-5 py-3.5 text-stone-600 tabular-nums">{t.quantity} {t.products?.unit}</td>
                    <td className="px-5 py-3.5 text-stone-600">{t.from_location?.name}</td>
                    <td className="px-5 py-3.5 text-stone-600">{t.to_location?.name}</td>
                    <td className="px-5 py-3.5 text-stone-600 tabular-nums">₺{Number(t.transfer_price).toLocaleString('tr-TR')}</td>
                    <td className="px-5 py-3.5 font-bold text-stone-900 tabular-nums">₺{(Number(t.quantity) * Number(t.transfer_price)).toLocaleString('tr-TR')}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-0.5 rounded-sm text-xs font-medium border ${badge ? `${badge.border} ${badge.text} ${badge.bg}` : 'border-stone-200 text-stone-600 bg-stone-50/50'}`}>
                        {t.status}
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
          <div className="bg-white rounded border border-stone-200 w-full max-w-lg p-7 shadow-lg">
            <h3 className="text-xl font-bold text-stone-900 mb-6">Yeni Transfer</h3>
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
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Gönderen *</label>
                  <select className={inp} value={form.from_location_id} onChange={e => setForm(f => ({ ...f, from_location_id: e.target.value }))}>
                    <option value="">Seçin...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Alan *</label>
                  <select className={inp} value={form.to_location_id} onChange={e => setForm(f => ({ ...f, to_location_id: e.target.value }))}>
                    <option value="">Seçin...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Miktar *</label>
                  <input type="number" className={inp} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Transfer Fiyatı ₺ *</label>
                  <input type="number" step="0.01" className={inp} value={form.transfer_price} onChange={e => setForm(f => ({ ...f, transfer_price: e.target.value }))} />
                </div>
              </div>
              {form.quantity && form.transfer_price && (
                <div className="bg-stone-50 border border-stone-200 rounded-sm p-3.5 text-sm">
                  <span className="text-stone-600">Oluşacak İç Borç: </span>
                  <strong className="text-stone-900">₺{(Number(form.quantity) * Number(form.transfer_price)).toLocaleString('tr-TR')}</strong>
                  <span className="text-stone-400 ml-1">— Alan lokasyon borçlanır</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Not</label>
                <textarea className={inp} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-7">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                {saving ? 'Kaydediliyor...' : 'Transferi Yap'}
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
