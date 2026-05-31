'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMode } from '@/contexts/ModeContext'
import type { Location } from '@/types'

const emptyForm = { location_id: '', recipient_name: '', recipient_phone: '', address: '', tracking_no: '', notes: '' }
const statusBadge: Record<string, string> = {
  hazirlaniyor: 'border-amber-200 text-amber-700 bg-amber-50/50',
  kuryede: 'border-stone-300 text-stone-700 bg-stone-50/50',
  teslim: 'border-emerald-200 text-emerald-700 bg-emerald-50/50',
  iade: 'border-red-200 text-red-600 bg-red-50/50',
}
const statusLabel: Record<string, string> = { hazirlaniyor: 'Hazırlanıyor', kuryede: 'Kuryede', teslim: 'Teslim Edildi', iade: 'İade' }

export default function KargoPage() {
  const { isAdminMode, cashierLocationId, cashierLocationName } = useMode()
  const [orders, setOrders] = useState<any[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: o }, { data: l }] = await Promise.all([
      supabase.from('courier_orders').select('*, locations(name), sales(total_amount, channel)').order('created_at', { ascending: false }).limit(60),
      supabase.from('locations').select('*').order('name'),
    ])
    setOrders(o ?? [])
    setLocations(l ?? [])
    setLoading(false)
  }

  async function handleSave() {
    const locId = isAdminMode ? form.location_id : (cashierLocationId ?? '')
    if (!locId || !form.recipient_name || !form.address) return alert('Lokasyon, alıcı adı ve adres zorunludur.')
    setSaving(true)
    const { error } = await supabase.from('courier_orders').insert({ location_id: locId, recipient_name: form.recipient_name, recipient_phone: form.recipient_phone || null, address: form.address, tracking_no: form.tracking_no || null })
    setSaving(false)
    if (error) return alert('Kargo kaydedilemedi: ' + error.message)
    setShowModal(false)
    setForm(emptyForm)
    fetchAll()
  }

  async function updateStatus(id: string, status: string) {
    const update: any = { status }
    if (status === 'teslim') update.delivery_date = new Date().toISOString()
    const { error } = await supabase.from('courier_orders').update(update).eq('id', id)
    if (error) { alert('Durum güncellenemedi: ' + error.message); return }
    fetchAll()
  }

  const filtered = filterStatus ? orders.filter(o => o.status === filterStatus) : orders

  const inp = "w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors"

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Kargo Takibi</h2>
          <p className="text-stone-400 text-sm mt-1">Tüm lokasyonların kargo siparişleri</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all">
          + Yeni Kargo
        </button>
      </div>

      <div className="bg-white rounded-sm border border-stone-200 shadow-sm mb-5 p-4 flex gap-2.5 flex-wrap items-center">
        {['', 'hazirlaniyor', 'kuryede', 'teslim', 'iade'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-4 py-2 rounded text-[11px] tracking-[0.15em] uppercase font-medium transition-all ${
              filterStatus === s
                ? 'bg-[#7C3AED] text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {s === '' ? 'Tümü' : statusLabel[s]}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-sm border border-stone-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Tarih</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Lokasyon</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Alıcı</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Telefon</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Adres</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Takip No</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Durum</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Güncelle</th>
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
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-stone-400 text-sm">Kargo kaydı bulunamadı</td></tr>
              ) : filtered.map(o => (
                <tr key={o.id} className="border-b border-stone-100 hover:bg-stone-50/70 transition-colors">
                  <td className="px-5 py-3.5 text-stone-400">{new Date(o.created_at).toLocaleDateString('tr-TR')}</td>
                  <td className="px-5 py-3.5 text-stone-600">{o.locations?.name}</td>
                  <td className="px-5 py-3.5 font-semibold text-stone-900">{o.recipient_name}</td>
                  <td className="px-5 py-3.5 text-stone-600">{o.recipient_phone ?? '-'}</td>
                  <td className="px-5 py-3.5 text-stone-400 max-w-[180px] truncate">{o.address}</td>
                  <td className="px-5 py-3.5 text-stone-400 font-mono text-xs">{o.tracking_no ?? '-'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-0.5 rounded-sm text-xs font-medium border ${statusBadge[o.status] ?? 'border-stone-200 text-stone-600 bg-stone-50/50'}`}>
                      {statusLabel[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <select
                      className="border border-stone-200 rounded-sm px-2.5 py-1.5 text-xs outline-none focus:border-stone-400 bg-white cursor-pointer transition-colors"
                      value={o.status}
                      onChange={e => updateStatus(o.id, e.target.value)}
                    >
                      <option value="hazirlaniyor">Hazırlanıyor</option>
                      <option value="kuryede">Kuryede</option>
                      <option value="teslim">Teslim Edildi</option>
                      <option value="iade">İade</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-lg p-7 shadow-lg">
            <h3 className="text-xl font-bold text-stone-900 mb-6">Yeni Kargo</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Gönderen Lokasyon *</label>
                {isAdminMode ? (
                  <select className={inp} value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}>
                    <option value="">Seçin...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                ) : (
                  <div className="border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm text-stone-700 bg-stone-50 font-medium">{cashierLocationName}</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Alıcı Adı *</label>
                  <input className={inp} value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Telefon</label>
                  <input className={inp} value={form.recipient_phone} onChange={e => setForm(f => ({ ...f, recipient_phone: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Teslimat Adresi *</label>
                <textarea className={inp} rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Takip Numarası</label>
                <input className={inp} value={form.tracking_no} onChange={e => setForm(f => ({ ...f, tracking_no: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-7">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
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
