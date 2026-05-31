'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Customer {
  id: string; name: string; phone: string | null; email: string | null
  address: string | null; customer_type: string; notes: string | null
  created_at: string
}

interface SaleItem { name: string; quantity: number; sale_price: number }

interface Sale {
  id: string; total_amount: number; sale_date: string
  status: string; channel: string; location: string
  items: SaleItem[]
}

const statusStyle: Record<string, string> = {
  tamamlandi: 'border-emerald-200 text-emerald-700 bg-emerald-50/50',
  veresiye: 'border-amber-200 text-amber-700 bg-amber-50/50',
  iptal: 'border-red-200 text-red-600 bg-red-50/50',
  iade: 'border-purple-200 text-[#7C3AED] bg-purple-50/50',
}
const statusLabel: Record<string, string> = {
  tamamlandi: 'Tamamlandı', veresiye: 'Veresiye', iptal: 'İptal', iade: 'İade'
}

function whatsappLink(phone: string, name: string) {
  const msg = encodeURIComponent(`Merhaba ${name}, sizi Dağdelen olarak aramak istedik 🙏`)
  const n = phone.replace(/\D/g, '')
  const num = n.startsWith('90') ? n : n.startsWith('0') ? '90' + n.slice(1) : '90' + n
  return `https://wa.me/${num}?text=${msg}`
}

export default function MusteriProfil() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [sales, setSales] = useState<Sale[]>([])
  const [referredCustomers, setReferredCustomers] = useState<{ id: string; name: string; phone: string | null; hasPurchased: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [editInfo, setEditInfo] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' })
  const [savingInfo, setSavingInfo] = useState(false)

  useEffect(() => { if (id) fetchAll() }, [id])

  async function fetchAll() {
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase.from('sales')
        .select('id, total_amount, sale_date, status, channel, locations(name), sale_items(quantity, sale_price, products(name))')
        .eq('customer_id', id)
        .order('sale_date', { ascending: false }),
    ])
    if (c) {
      setCustomer(c)
      setNotes(c.notes ?? '')
      setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '' })
    }
    // Fetch referred customers
    const { data: referredData } = await supabase
      .from('customers').select('id, name, phone').eq('referred_by', id)
    if (referredData && referredData.length > 0) {
      const ids = referredData.map((c: any) => c.id)
      const { data: salesCheck } = await supabase
        .from('sales').select('customer_id').in('customer_id', ids).eq('status', 'tamamlandi')
      const hasPurchasedSet = new Set((salesCheck ?? []).map((s: any) => s.customer_id))
      setReferredCustomers(referredData.map((c: any) => ({
        id: c.id, name: c.name, phone: c.phone ?? null,
        hasPurchased: hasPurchasedSet.has(c.id),
      })))
    }

    setSales((s ?? []).map((sale: any) => ({
      id: sale.id,
      total_amount: Number(sale.total_amount),
      sale_date: sale.sale_date,
      status: sale.status,
      channel: sale.channel,
      location: sale.locations?.name ?? '-',
      items: (sale.sale_items ?? []).map((i: any) => ({
        name: i.products?.name ?? 'Bilinmiyor',
        quantity: i.quantity,
        sale_price: Number(i.sale_price),
      })),
    })))
    setLoading(false)
  }

  async function saveNotes() {
    setSavingNotes(true)
    await supabase.from('customers').update({ notes: notes || null }).eq('id', id)
    setSavingNotes(false)
    setNotesSaved(true)
    if (customer) setCustomer({ ...customer, notes: notes || null })
    setTimeout(() => setNotesSaved(false), 2500)
  }

  async function saveInfo() {
    setSavingInfo(true)
    await supabase.from('customers').update({
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
    }).eq('id', id)
    setSavingInfo(false)
    setEditInfo(false)
    fetchAll()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <div className="w-7 h-7 border-2 border-stone-200 border-t-[#7C3AED] rounded-full animate-spin" />
      <span className="text-stone-400 text-sm">Yükleniyor...</span>
    </div>
  )
  if (!customer) return (
    <div className="text-center py-20">
      <p className="text-stone-400">Müşteri bulunamadı</p>
      <button onClick={() => router.back()} className="mt-4 text-[#7C3AED] text-sm font-semibold">← Geri dön</button>
    </div>
  )

  const completedSales = sales.filter(s => s.status === 'tamamlandi')
  const totalSpent = completedSales.reduce((sum, s) => sum + s.total_amount, 0)
  const lastSale = sales[0]
  const daysSinceLast = lastSale
    ? Math.floor((Date.now() - new Date(lastSale.sale_date).getTime()) / 86400000)
    : null
  const avgBasket = completedSales.length > 0 ? totalSpent / completedSales.length : 0

  // Top products
  const productMap: Record<string, { qty: number; times: number }> = {}
  completedSales.forEach(s => {
    s.items.forEach(item => {
      if (!productMap[item.name]) productMap[item.name] = { qty: 0, times: 0 }
      productMap[item.name].qty += item.quantity
      productMap[item.name].times++
    })
  })
  const topProducts = Object.entries(productMap)
    .map(([name, v]) => ({ name, totalQty: v.qty, times: v.times }))
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, 6)

  const riskBadge = daysSinceLast === null
    ? null
    : daysSinceLast > 90
      ? { label: `${daysSinceLast} gündür gelmiyor`, cls: 'bg-red-50 border-red-200 text-red-700' }
      : daysSinceLast > 60
        ? { label: `${daysSinceLast} gündür gelmiyor`, cls: 'bg-amber-50 border-amber-200 text-amber-700' }
        : null

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => router.push('/musteriler')}
        className="flex items-center gap-1.5 text-stone-400 hover:text-stone-700 text-sm font-medium transition-colors mb-6"
      >
        ← Müşteriler
      </button>

      {/* Header */}
      <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6 mb-6">
        {editInfo ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1">İsim</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-stone-200 rounded-sm px-3 py-2 text-sm outline-none focus:border-[#7C3AED] transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1">Telefon</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-stone-200 rounded-sm px-3 py-2 text-sm outline-none focus:border-[#7C3AED] transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1">E-posta</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-stone-200 rounded-sm px-3 py-2 text-sm outline-none focus:border-[#7C3AED] transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1">Adres</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-stone-200 rounded-sm px-3 py-2 text-sm outline-none focus:border-[#7C3AED] transition-colors" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveInfo} disabled={savingInfo}
                className="bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white px-5 py-2 rounded-sm text-[11px] tracking-[0.15em] uppercase font-semibold transition-colors">
                {savingInfo ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button onClick={() => setEditInfo(false)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-600 px-5 py-2 rounded-sm text-[11px] tracking-[0.15em] uppercase font-semibold transition-colors">
                İptal
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-purple-50 border-2 border-purple-200 flex items-center justify-center flex-shrink-0">
                <span className="text-[#6D28D9] text-xl font-bold">{customer.name.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="text-2xl font-bold text-stone-900 tracking-tight">{customer.name}</h2>
                  <span className="px-2 py-0.5 border border-stone-200 text-stone-400 text-xs rounded-sm">
                    {customer.customer_type === 'kurumsal' ? 'Kurumsal' : 'Bireysel'}
                  </span>
                  {riskBadge && (
                    <span className={`px-2.5 py-0.5 border rounded-sm text-xs font-semibold ${riskBadge.cls}`}>
                      {riskBadge.label}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-stone-500">
                  {customer.phone && <span className="font-mono">{customer.phone}</span>}
                  {customer.email && <span>{customer.email}</span>}
                  {customer.address && <span className="text-stone-400">{customer.address}</span>}
                </div>
                <p className="text-xs text-stone-400 mt-1">
                  Kayıt: {new Date(customer.created_at).toLocaleDateString('tr-TR')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {customer.phone && (
                <a href={whatsappLink(customer.phone, customer.name)} target="_blank" rel="noopener noreferrer"
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-sm text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors">
                  WhatsApp
                </a>
              )}
              <button onClick={() => setEditInfo(true)}
                className="border border-stone-200 hover:border-stone-400 text-stone-600 px-4 py-2 rounded-sm text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors">
                Düzenle
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-5">
          <p className="text-2xl font-bold text-stone-900 tabular-nums">₺{totalSpent.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</p>
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mt-1.5">Toplam Harcama</p>
        </div>
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-5">
          <p className="text-2xl font-bold text-stone-900 tabular-nums">{completedSales.length}</p>
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mt-1.5">Tamamlanan Sipariş</p>
        </div>
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-5">
          <p className="text-2xl font-bold text-stone-900 tabular-nums">₺{avgBasket.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</p>
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mt-1.5">Ortalama Sepet</p>
        </div>
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-5">
          <p className={`text-2xl font-bold tabular-nums ${daysSinceLast !== null && daysSinceLast > 60 ? 'text-red-600' : 'text-stone-900'}`}>
            {daysSinceLast === null ? '—' : daysSinceLast === 0 ? 'Bugün' : `${daysSinceLast} gün önce`}
          </p>
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mt-1.5">Son Ziyaret</p>
        </div>
      </div>

      {/* Referral Section */}
      {referredCustomers.length > 0 && (
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-0.5">Yönlendirdiği Müşteriler</h3>
              <p className="text-xs text-stone-500">{referredCustomers.length} kişi getirdi</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-emerald-600 tabular-nums">
                ₺{referredCustomers.filter(c => c.hasPurchased).length * 20}
              </p>
              <p className="text-[10px] text-stone-400 mt-0.5">
                alışveriş çeki hakkı · {referredCustomers.filter(c => c.hasPurchased).length} kişi alışveriş yaptı
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {referredCustomers.map(rc => (
              <div
                key={rc.id}
                onClick={() => router.push(`/musteriler/${rc.id}`)}
                className={`flex items-center justify-between p-3 rounded-sm border cursor-pointer transition-colors hover:opacity-80 ${
                  rc.hasPurchased ? 'border-emerald-100 bg-emerald-50/50' : 'border-stone-100 bg-stone-50/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${rc.hasPurchased ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>
                    {rc.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{rc.name}</p>
                    {rc.phone && <p className="text-[10px] text-stone-400 font-mono">{rc.phone}</p>}
                  </div>
                </div>
                {rc.hasPurchased ? (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-sm">
                    ✓ Alışveriş yaptı · ₺20 çek
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-stone-400 bg-stone-100 border border-stone-200 px-2.5 py-1 rounded-sm">
                    Henüz alışveriş yok
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Middle Row: Top Products + Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">

        {/* En çok alınan ürünler */}
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-4">En Çok Aldığı Ürünler</h3>
          {topProducts.length === 0 ? (
            <p className="text-stone-400 text-sm py-4 text-center">Tamamlanmış satış yok</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-stone-300 w-4 tabular-nums flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-800 truncate">{p.name}</p>
                    <p className="text-[10px] text-stone-400">{p.times} siparişte · toplam {p.totalQty} adet</p>
                  </div>
                  <span className="text-xs font-bold text-[#6D28D9] tabular-nums flex-shrink-0">{p.totalQty} adet</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notlar */}
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6 flex flex-col">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-4">Personel Notları</h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Bu müşteri hakkında not ekleyin — alerjiler, tercihler, aile bilgisi, özel istekler..."
            className="flex-1 min-h-[130px] w-full border border-stone-200 rounded-sm px-3.5 py-3 text-sm outline-none focus:border-[#7C3AED] transition-colors resize-none text-stone-700 placeholder-stone-300"
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className={`px-5 py-2 rounded-sm text-[11px] font-semibold uppercase tracking-[0.15em] transition-all ${
                notesSaved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white'
              }`}
            >
              {savingNotes ? 'Kaydediliyor...' : notesSaved ? '✓ Kaydedildi' : 'Notu Kaydet'}
            </button>
          </div>
        </div>
      </div>

      {/* Purchase History */}
      <div className="bg-white border border-stone-200 shadow-sm rounded-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 bg-stone-50 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Alışveriş Geçmişi</h3>
          <span className="text-[10px] text-stone-400">{sales.length} sipariş</span>
        </div>
        {sales.length === 0 ? (
          <p className="px-5 py-12 text-center text-stone-400 text-sm">Henüz alışveriş yok</p>
        ) : (
          <div className="divide-y divide-stone-50">
            {sales.map(s => {
              const badge = statusStyle[s.status] ?? 'border-stone-200 text-stone-500'
              const label = statusLabel[s.status] ?? s.status
              return (
                <div key={s.id} className="px-5 py-4 hover:bg-stone-50/60 transition-colors">
                  <div className="flex items-center justify-between gap-4 mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-semibold text-stone-700">
                        {new Date(s.sale_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                      <span className="text-stone-300 text-xs">·</span>
                      <span className="text-xs text-stone-400">{s.location}</span>
                      <span className={`px-2 py-0.5 rounded-sm border text-[10px] font-semibold ${badge}`}>{label}</span>
                    </div>
                    <span className="text-base font-bold text-stone-900 tabular-nums flex-shrink-0">
                      ₺{s.total_amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {s.items.map(i => `${i.name} ×${i.quantity}`).join(' · ') || '—'}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
