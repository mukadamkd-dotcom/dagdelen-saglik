'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Customer } from '@/types'
import { useMode } from '@/contexts/ModeContext'

const emptyForm = { name: '', phone: '', email: '', address: '', customer_type: 'bireysel', notes: '', referred_by: '' }

interface CustomerWithStats extends Customer {
  lastSaleDate: string | null
  daysSinceLast: number | null
  totalSpent: number
  totalOrders: number
}

type Tab = 'tumu' | 'gelmeyenler' | 'silinen'

function whatsappLink(phone: string, name: string) {
  const msg = encodeURIComponent(`Merhaba ${name}, sizi özledik! Dağdelen olarak tekrar görmek isteriz 🙏`)
  const n = phone.replace(/\D/g, '')
  const num = n.startsWith('90') ? n : n.startsWith('0') ? '90' + n.slice(1) : '90' + n
  return `https://wa.me/${num}?text=${msg}`
}

export default function MusterilerPage() {
  const router = useRouter()
  const { isAdminMode, cashierLocationId, cashierLocationName } = useMode()
  const [customers, setCustomers] = useState<CustomerWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<Tab>('tumu')
  const [referralCount, setReferralCount] = useState<Record<string, number>>({})

  useEffect(() => { fetchCustomers() }, [])

  async function fetchCustomers() {
    let custsQuery = supabase.from('customers').select('*').order('name')
    if (!isAdminMode && cashierLocationId) {
      custsQuery = custsQuery.eq('location_id', cashierLocationId)
    }
    const [{ data: custs }, { data: salesData }] = await Promise.all([
      custsQuery,
      supabase.from('sales')
        .select('customer_id, sale_date, total_amount, status')
        .eq('status', 'tamamlandi')
        .order('sale_date', { ascending: false }),
    ])

    // Build per-customer stats
    const statsMap: Record<string, { lastDate: string; total: number; count: number }> = {}
    ;(salesData ?? []).forEach((s: any) => {
      const cid = s.customer_id
      if (!cid) return
      if (!statsMap[cid]) statsMap[cid] = { lastDate: s.sale_date, total: 0, count: 0 }
      statsMap[cid].total += Number(s.total_amount)
      statsMap[cid].count++
    })

    const now = Date.now()
    const enriched: CustomerWithStats[] = (custs ?? []).map((c: any) => {
      const stats = statsMap[c.id]
      const daysSinceLast = stats
        ? Math.floor((now - new Date(stats.lastDate).getTime()) / 86400000)
        : null
      return {
        ...c,
        lastSaleDate: stats?.lastDate ?? null,
        daysSinceLast,
        totalSpent: stats?.total ?? 0,
        totalOrders: stats?.count ?? 0,
      }
    })

    setCustomers(enriched)

    const refCounts: Record<string, number> = {}
    enriched.forEach(c => {
      const rb = (c as any).referred_by
      if (rb) refCounts[rb] = (refCounts[rb] ?? 0) + 1
    })
    setReferralCount(refCounts)
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(emptyForm); setShowModal(true) }
  function openEdit(c: Customer, e: React.MouseEvent) {
    e.stopPropagation()
    setEditing(c)
    setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', customer_type: c.customer_type, notes: c.notes ?? '', referred_by: (c as any).referred_by ?? '' })
    setShowModal(true)
  }

  async function handleDelete() {
    if (!editing) return
    if (!confirm(`"${editing.name}" silinsin mi?`)) return
    setSaving(true)
    if (isAdminMode) {
      await supabase.from('customers').delete().eq('id', editing.id)
    } else {
      const mark = `[SİLİNDİ — ${cashierLocationName ?? 'Kasiyer'} — ${new Date().toLocaleString('tr-TR')}]`
      const newNotes = mark + (editing.notes ? ' ' + editing.notes : '')
      await supabase.from('customers').update({ notes: newNotes }).eq('id', editing.id)
    }
    setSaving(false)
    setShowModal(false)
    fetchCustomers()
  }

  async function handleSave() {
    if (!form.name) return alert('Müşteri adı zorunludur.')
    setSaving(true)
    const payload: any = { name: form.name, phone: form.phone || null, email: form.email || null, address: form.address || null, customer_type: form.customer_type as any, notes: form.notes || null, referred_by: form.referred_by || null }
    if (!editing && !isAdminMode && cashierLocationId) payload.location_id = cashierLocationId
    if (editing) { await supabase.from('customers').update(payload).eq('id', editing.id) }
    else { await supabase.from('customers').insert(payload) }
    setSaving(false)
    setShowModal(false)
    fetchCustomers()
  }

  const activeCustomers = customers.filter(c => !c.notes?.startsWith('[SİLİNDİ'))
  const deletedCustomers = customers.filter(c => c.notes?.startsWith('[SİLİNDİ'))

  const filtered = activeCustomers.filter(c =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const gelmeyenler = activeCustomers
    .filter(c => c.daysSinceLast !== null && c.daysSinceLast >= 30)
    .sort((a, b) => (b.daysSinceLast ?? 0) - (a.daysSinceLast ?? 0))

  const inp = "w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-[#7C3AED] transition-colors"

  function daysBadge(days: number | null) {
    if (days === null) return <span className="text-stone-300 text-xs">—</span>
    if (days === 0) return <span className="text-[#7C3AED] text-xs font-semibold">Bugün</span>
    const cls = days > 90 ? 'text-red-600' : days > 60 ? 'text-amber-600' : days > 30 ? 'text-[#7C3AED]' : 'text-stone-500'
    return <span className={`text-xs font-semibold tabular-nums ${cls}`}>{days} gün önce</span>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Müşteriler</h2>
          <p className="text-stone-400 text-sm mt-1">{activeCustomers.length} kayıtlı müşteri</p>
        </div>
        <button onClick={openAdd} className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all">
          + Yeni Müşteri
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: 'tumu', label: 'Tüm Müşteriler' },
          { key: 'gelmeyenler', label: 'Gelmeyenler' },
          ...(isAdminMode ? [{ key: 'silinen', label: 'Silinen Müşteriler' }] : []),
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key as Tab)}
            className={`px-5 py-2 rounded-sm text-[11px] font-semibold uppercase tracking-[0.12em] border transition-colors ${
              tab === key ? 'bg-[#7C3AED] text-white border-[#7C3AED]' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
            }`}
          >
            {label}
            {key === 'gelmeyenler' && gelmeyenler.length > 0 && (
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${tab === 'gelmeyenler' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>
                {gelmeyenler.length}
              </span>
            )}
            {key === 'silinen' && deletedCustomers.length > 0 && (
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${tab === 'silinen' ? 'bg-white/20' : 'bg-red-100 text-red-600'}`}>
                {deletedCustomers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tüm Müşteriler Tab */}
      {tab === 'tumu' && (
        <>
          <div className="bg-white rounded-sm border border-stone-200 shadow-sm mb-5 p-4">
            <input
              className="w-full border border-stone-200 rounded-sm px-4 py-2.5 text-sm outline-none focus:border-[#7C3AED] transition-colors"
              placeholder="İsim, telefon veya e-posta ile ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="bg-white rounded-sm border border-stone-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">İsim</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Telefon</th>
                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Toplam Harcama</th>
                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Sipariş</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Son Alışveriş</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center">
                      <div className="flex items-center justify-center gap-2.5">
                        <div className="w-5 h-5 border-2 border-stone-200 border-t-[#7C3AED] rounded-full animate-spin" />
                        <span className="text-stone-400 text-sm">Yükleniyor...</span>
                      </div>
                    </td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-stone-400 text-sm">Müşteri bulunamadı</td></tr>
                  ) : filtered.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/musteriler/${c.id}`)}
                      className="border-b border-stone-100 hover:bg-purple-50/40 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-[#6D28D9] text-xs font-bold">{c.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <span className="font-semibold text-stone-900">{c.name}</span>
                          {referralCount[c.id] > 0 && (
                            <span className="px-2 py-0.5 bg-purple-50 border border-purple-200 text-[#6D28D9] text-[9px] font-bold rounded-full">
                              {referralCount[c.id]} referans
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-stone-500 font-mono text-xs">{c.phone ?? '—'}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-stone-900 tabular-nums">
                        {c.totalSpent > 0 ? `₺${c.totalSpent.toLocaleString('tr-TR')}` : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right text-stone-500 tabular-nums">{c.totalOrders || '—'}</td>
                      <td className="px-5 py-3.5">{daysBadge(c.daysSinceLast)}</td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={e => openEdit(c, e)}
                          className="text-stone-400 hover:text-stone-700 text-xs font-semibold transition-colors"
                        >Düzenle</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        </>
      )}

      {/* Gelmeyenler Tab */}
      {tab === 'gelmeyenler' && (
        <>
          <div className="flex items-center gap-3 mb-5">
            <span className="text-sm font-semibold text-stone-600">Son 30 gündür gelmeyen müşteriler</span>
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{gelmeyenler.length} kişi</span>
          </div>

          {gelmeyenler.length === 0 ? (
            <div className="bg-white border border-stone-200 shadow-sm rounded-sm px-5 py-16 text-center">
              <p className="text-stone-400 text-sm">Son 30 günde gelmeyen müşteri yok</p>
              <p className="text-stone-300 text-xs mt-1">Harika! Müşterileriniz aktif.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {gelmeyenler.map(c => (
                <div
                  key={c.id}
                  onClick={() => router.push(`/musteriler/${c.id}`)}
                  className={`bg-white border rounded-sm p-4 flex items-center gap-4 cursor-pointer transition-colors hover:bg-purple-50/30 ${
                    (c.daysSinceLast ?? 0) > 90 ? 'border-red-100' : (c.daysSinceLast ?? 0) > 60 ? 'border-amber-100' : 'border-stone-200'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-stone-500 font-bold">{c.name.charAt(0).toUpperCase()}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900">{c.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {c.phone && <span className="text-xs text-stone-400 font-mono">{c.phone}</span>}
                      <span className="text-stone-300 text-xs">·</span>
                      <span className="text-xs text-stone-400">
                        {c.totalOrders} sipariş · ₺{c.totalSpent.toLocaleString('tr-TR')} harcama
                      </span>
                    </div>
                  </div>

                  <div className="text-center flex-shrink-0">
                    <p className={`text-lg font-bold tabular-nums ${(c.daysSinceLast ?? 0) > 90 ? 'text-red-600' : (c.daysSinceLast ?? 0) > 60 ? 'text-amber-600' : 'text-[#7C3AED]'}`}>
                      {c.daysSinceLast} gün
                    </p>
                    <p className="text-[10px] text-stone-400">gelmiyor</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {c.phone && (
                      <a
                        href={whatsappLink(c.phone, c.name)}
                        target="_blank" rel="noopener noreferrer"
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-sm text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors"
                      >WA</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Silinen Müşteriler Tab — sadece admin */}
      {tab === 'silinen' && isAdminMode && (
        <>
          <div className="flex items-center gap-3 mb-5">
            <span className="text-sm font-semibold text-stone-600">Kasiyerler tarafından silinen müşteriler</span>
            <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{deletedCustomers.length} kişi</span>
          </div>
          {deletedCustomers.length === 0 ? (
            <div className="bg-white border border-stone-200 shadow-sm rounded-sm px-5 py-16 text-center">
              <p className="text-stone-400 text-sm">Silinmiş müşteri yok</p>
            </div>
          ) : (
            <div className="bg-white border border-stone-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-100">
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">İsim</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Telefon</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Silme Kaydı</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedCustomers.map(c => {
                    const markEnd = c.notes?.indexOf(']') ?? -1
                    const deletionInfo = markEnd > -1 ? c.notes?.slice(1, markEnd) : c.notes
                    return (
                      <tr key={c.id} className="border-b border-stone-50">
                        <td className="px-5 py-3.5 font-medium text-stone-500 line-through">{c.name}</td>
                        <td className="px-5 py-3.5 text-stone-400 font-mono text-xs">{c.phone ?? '—'}</td>
                        <td className="px-5 py-3.5 text-xs text-red-600">{deletionInfo}</td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={async () => { if (confirm(`"${c.name}" kalıcı olarak silinsin mi?`)) { const { error } = await supabase.from('customers').delete().eq('id', c.id); if (error) alert('Silinemedi: ' + error.message); else fetchCustomers() } }}
                            className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] border border-red-200 text-red-600 bg-red-50/50 hover:bg-red-100 rounded transition-colors"
                          >
                            Kalıcı Sil
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Ekle/Düzenle Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-lg shadow-lg max-h-[90vh] flex flex-col">
            <div className="px-7 pt-7 pb-0 flex-shrink-0">
              <h3 className="text-xl font-bold text-stone-900 mb-6">{editing ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'}</h3>
            </div>
            <div className="overflow-y-auto flex-1 px-7">
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
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Kim Yönlendirdi?</label>
                <select className={inp} value={form.referred_by} onChange={e => setForm(f => ({ ...f, referred_by: e.target.value }))}>
                  <option value="">— Seçin (opsiyonel) —</option>
                  {customers
                    .filter(c => !editing || c.id !== editing.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.phone ? ` · ${c.phone}` : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1.5">Not</label>
                <textarea className={inp} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            </div>
            <div className="flex gap-3 px-7 py-5 flex-shrink-0 border-t border-stone-100">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              {editing && (
                <button onClick={handleDelete} disabled={saving} className="bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 border border-red-200 px-4 py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                  Sil
                </button>
              )}
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
