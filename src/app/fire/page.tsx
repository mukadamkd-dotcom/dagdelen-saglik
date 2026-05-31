'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMode } from '@/contexts/ModeContext'
import type { Product, Location } from '@/types'

const emptyForm = { location_id: '', product_id: '', quantity: '', loss_type: 'fire', description: '' }
const lossLabel: Record<string, string> = { kargo_hasari: 'Kargo Hasarı', iade: 'İade', bozulma: 'Bozulma', fire: 'Fire', diger: 'Diğer' }
const lossBadge: Record<string, string> = {
  kargo_hasari: 'border-[#FDBA74] text-[#6D28D9] bg-[#FFF3E8]/50',
  iade: 'border-stone-300 text-stone-600 bg-stone-50/50',
  bozulma: 'border-red-200 text-red-600 bg-red-50/50',
  fire: 'border-stone-200 text-stone-500 bg-stone-50/50',
  diger: 'border-stone-200 text-stone-400 bg-stone-50/50',
}

export default function FirePage() {
  const { isAdminMode, cashierLocationId, cashierLocationName } = useMode()
  const [losses, setLosses] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: l }, { data: p }, { data: loc }] = await Promise.all([
      supabase.from('losses').select('*, products(name, unit), locations(name)').order('created_at', { ascending: false }).limit(60),
      supabase.from('products').select('id, name, unit').eq('is_active', true).order('name'),
      supabase.from('locations').select('*').order('name'),
    ])
    setLosses(l ?? [])
    setProducts(p ?? [])
    setLocations(loc ?? [])
    setLoading(false)
  }

  async function handleSave() {
    const locId = isAdminMode ? form.location_id : (cashierLocationId ?? '')
    if (!locId || !form.product_id || !form.quantity) return alert('Lokasyon, ürün ve miktar zorunludur.')
    setSaving(true)
    const qty = Number(form.quantity)

    await supabase.from('losses').insert({ location_id: locId, product_id: form.product_id, quantity: qty, loss_type: form.loss_type, description: form.description || null })

    // Ana stok düş
    const { data: inv } = await supabase.from('inventory').select('id, quantity').eq('product_id', form.product_id).eq('location_id', locId).maybeSingle()
    if (inv) await supabase.from('inventory').update({ quantity: Math.max(0, Number(inv.quantity) - qty) }).eq('id', inv.id)

    // Batch stok düş (FIFO — önce en eski miad)
    let remaining = qty
    const { data: batches } = await supabase.from('inventory_batches').select('id, quantity').eq('product_id', form.product_id).eq('location_id', locId).gt('quantity', 0).order('expiry_date')
    for (const b of (batches ?? [])) {
      if (remaining <= 0) break
      const take = Math.min(Number(b.quantity), remaining)
      await supabase.from('inventory_batches').update({ quantity: Number(b.quantity) - take }).eq('id', b.id)
      remaining -= take
    }

    await supabase.from('stock_movements').insert({ product_id: form.product_id, from_location_id: locId, quantity: qty, movement_type: 'fire', notes: form.description || null })

    setSaving(false)
    setShowModal(false)
    setForm(emptyForm)
    fetchAll()
  }

  const totalLoss = losses.length
  const byType = losses.reduce((acc, l) => { acc[l.loss_type] = (acc[l.loss_type] ?? 0) + 1; return acc }, {} as Record<string, number>)

  const inp = "w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors"

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Fire & İade</h2>
          <p className="text-stone-400 text-sm mt-1">Kayıp, hasar ve iade takibi</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all"
        >
          + Fire Kaydı
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-7">
        <div className="bg-white rounded-sm border border-stone-200 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-stone-900 tabular-nums">{totalLoss}</p>
          <p className="text-stone-400 text-[10px] font-semibold mt-1.5 uppercase tracking-[0.15em]">Toplam Kayıt</p>
        </div>
        {Object.entries(lossLabel).map(([key, label]) => (
          <div key={key} className="bg-white rounded-sm border border-stone-200 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-stone-900 tabular-nums">{byType[key] ?? 0}</p>
            <p className="text-stone-400 text-[10px] font-semibold mt-1.5 uppercase tracking-[0.15em]">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-sm border border-stone-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Tarih</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Lokasyon</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürün</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Miktar</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Tür</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                      <span className="text-stone-400 text-sm">Yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : losses.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-stone-400 text-sm">Fire kaydı yok</td></tr>
              ) : losses.map(l => (
                <tr key={l.id} className="border-b border-stone-100 hover:bg-stone-50/70 transition-colors">
                  <td className="px-5 py-3.5 text-stone-400">{new Date(l.created_at).toLocaleDateString('tr-TR')}</td>
                  <td className="px-5 py-3.5 text-stone-600">{l.locations?.name}</td>
                  <td className="px-5 py-3.5 font-semibold text-stone-900">{l.products?.name}</td>
                  <td className="px-5 py-3.5 text-stone-600 tabular-nums">{l.quantity} {l.products?.unit}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-0.5 rounded-sm text-xs font-medium border ${lossBadge[l.loss_type] ?? 'border-stone-200 text-stone-600 bg-stone-50/50'}`}>
                      {lossLabel[l.loss_type] ?? l.loss_type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-stone-400">{l.description ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-lg p-7 shadow-lg">
            <h3 className="text-xl font-bold text-stone-900 mb-6">Fire Kaydı Ekle</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Lokasyon *</label>
                {isAdminMode ? (
                  <select className={inp} value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}>
                    <option value="">Seçin...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                ) : (
                  <div className="border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm text-stone-700 bg-stone-50 font-medium">{cashierLocationName}</div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Ürün *</label>
                <select className={inp} value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
                  <option value="">Seçin...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Miktar *</label>
                  <input type="number" className={inp} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Tür</label>
                  <select className={inp} value={form.loss_type} onChange={e => setForm(f => ({ ...f, loss_type: e.target.value }))}>
                    <option value="fire">Fire</option>
                    <option value="iade">İade</option>
                    <option value="bozulma">Bozulma</option>
                    <option value="kargo_hasari">Kargo Hasarı</option>
                    <option value="diger">Diğer</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Açıklama</label>
                <textarea className={inp} rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-7">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                {saving ? 'Kaydediliyor...' : 'Fire Kaydet'}
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
