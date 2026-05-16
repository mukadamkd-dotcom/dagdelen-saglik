'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Customer } from '@/types'

const emptyForm = { name: '', phone: '', email: '', address: '', customer_type: 'bireysel', notes: '' }

export default function MusterilerPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerSales, setCustomerSales] = useState<any[]>([])
  const [veresiyeMap, setVeresiyeMap] = useState<Record<string, number>>({})

  useEffect(() => { fetchCustomers() }, [])

  async function fetchCustomers() {
    const [{ data: custs }, { data: veresiye }] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('sales').select('customer_id, total_amount').eq('status', 'veresiye'),
    ])
    setCustomers(custs ?? [])

    const vmap: Record<string, number> = {}
    ;(veresiye ?? []).forEach((s: any) => {
      if (!s.customer_id) return
      vmap[s.customer_id] = (vmap[s.customer_id] ?? 0) + Number(s.total_amount)
    })
    setVeresiyeMap(vmap)
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(emptyForm); setShowModal(true) }
  function openEdit(c: Customer) {
    setEditing(c)
    setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', customer_type: c.customer_type, notes: c.notes ?? '' })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name) return alert('Müşteri adı zorunludur.')
    setSaving(true)
    const payload = { name: form.name, phone: form.phone || null, email: form.email || null, address: form.address || null, customer_type: form.customer_type as any, notes: form.notes || null }
    if (editing) { await supabase.from('customers').update(payload).eq('id', editing.id) }
    else { await supabase.from('customers').insert(payload) }
    setSaving(false)
    setShowModal(false)
    fetchCustomers()
  }

  async function showHistory(c: Customer) {
    setSelectedCustomer(c)
    const { data } = await supabase.from('sales').select('*, locations(name), sale_items(quantity, sale_price, products(name))').eq('customer_id', c.id).order('sale_date', { ascending: false })
    setCustomerSales(data ?? [])
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const totalSpent = customerSales.filter(s => s.status === 'tamamlandi').reduce((sum, s) => sum + Number(s.total_amount), 0)

  const inp = "w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors"

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Müşteriler</h2>
          <p className="text-stone-400 text-sm mt-1">{customers.length} kayıtlı müşteri</p>
        </div>
        <button onClick={openAdd} className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all">
          + Yeni Müşteri
        </button>
      </div>

      <div className="bg-white rounded-sm border border-stone-200 shadow-sm mb-5 p-4">
        <input
          className="w-full border border-stone-200 rounded-sm px-4 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors"
          placeholder="İsim, telefon veya e-posta ile ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-sm border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">İsim</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Telefon</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">E-posta</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Tip</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Veresiye</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Kayıt Tarihi</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">İşlem</th>
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
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-stone-400 text-sm">Müşteri bulunamadı</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50/70 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-stone-900">{c.name}</td>
                  <td className="px-5 py-3.5 text-stone-600">{c.phone ?? '-'}</td>
                  <td className="px-5 py-3.5 text-stone-400">{c.email ?? '-'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-0.5 rounded-sm text-xs font-medium border ${c.customer_type === 'kurumsal' ? 'border-stone-300 text-stone-700 bg-stone-50/50' : 'border-stone-200 text-stone-500 bg-stone-50/50'}`}>
                      {c.customer_type === 'kurumsal' ? 'Kurumsal' : 'Bireysel'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {veresiyeMap[c.id] ? (
                      <span className="px-2.5 py-0.5 rounded-sm text-xs font-bold border border-amber-200 text-amber-700 bg-amber-50/50 tabular-nums">
                        ₺{veresiyeMap[c.id].toLocaleString('tr-TR')}
                      </span>
                    ) : (
                      <span className="text-stone-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-stone-400">{new Date(c.created_at).toLocaleDateString('tr-TR')}</td>
                  <td className="px-5 py-3.5 flex gap-3">
                    <button onClick={() => showHistory(c)} className="text-stone-400 hover:text-stone-700 text-xs font-semibold transition-colors">Geçmiş</button>
                    <button onClick={() => openEdit(c)} className="text-stone-700 hover:text-stone-900 text-xs font-semibold transition-colors">Düzenle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Müşteri Geçmişi Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-2xl p-7 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold text-stone-900">{selectedCustomer.name}</h3>
                <p className="text-stone-400 text-sm mt-0.5">{selectedCustomer.phone} {selectedCustomer.email}</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="text-stone-400 hover:text-stone-600 text-2xl leading-none transition-colors">×</button>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-sm p-3.5 text-sm mb-5">
              <span className="text-stone-600">Toplam Harcama: </span>
              <strong className="text-stone-900">₺{totalSpent.toLocaleString('tr-TR')}</strong>
              <span className="text-stone-400 ml-2">— {customerSales.length} sipariş</span>
            </div>
            {veresiyeMap[selectedCustomer.id] && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-sm p-3 text-sm">
                <span className="text-amber-700 font-semibold">Bekleyen Veresiye: </span>
                <strong className="text-amber-900 tabular-nums">₺{veresiyeMap[selectedCustomer.id].toLocaleString('tr-TR')}</strong>
              </div>
            )}
            {customerSales.length === 0 ? (
              <p className="text-stone-400 text-sm text-center py-6">Satış geçmişi yok</p>
            ) : (
              <div className="space-y-2">
                {customerSales.map(s => (
                  <div key={s.id} className="border border-stone-100 rounded-sm p-4 hover:bg-stone-50 transition-colors">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-stone-600">{new Date(s.sale_date).toLocaleDateString('tr-TR')} — {s.locations?.name}</span>
                      <strong className="text-stone-900 tabular-nums">₺{Number(s.total_amount).toLocaleString('tr-TR')}</strong>
                      {s.status === 'veresiye' && (
                        <span className="ml-2 px-2 py-0.5 border border-amber-200 text-amber-700 bg-amber-50/50 text-[10px] font-semibold rounded-sm">Veresiye</span>
                      )}
                    </div>
                    <p className="text-xs text-stone-400 mt-1.5">{(s.sale_items ?? []).map((i: any) => `${i.products?.name} x${i.quantity}`).join(', ')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ekle/Düzenle Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-lg p-7 shadow-lg">
            <h3 className="text-xl font-bold text-stone-900 mb-6">{editing ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">İsim *</label>
                <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Telefon</label>
                  <input className={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5">Tip</label>
                  <select className={inp} value={form.customer_type} onChange={e => setForm(f => ({ ...f, customer_type: e.target.value }))}>
                    <option value="bireysel">Bireysel</option>
                    <option value="kurumsal">Kurumsal</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">E-posta</label>
                <input type="email" className={inp} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Adres</label>
                <textarea className={inp} rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Not</label>
                <textarea className={inp} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
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
