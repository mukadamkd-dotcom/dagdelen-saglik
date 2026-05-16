'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ProductConfig {
  id: string
  name: string
  image_url: string | null
  days_per_unit: string
}

interface FollowupItem {
  id: string
  estimated_days: number
  quantity: number
  followup_done: boolean
  product_name: string
  customer_name: string
  customer_phone: string | null
  call_date: Date
  days_until_call: number
}

export default function TakipPage() {
  const [products, setProducts] = useState<ProductConfig[]>([])
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const [items, setItems] = useState<FollowupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'all' | 'done'>('pending')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    // Fetch products — try with days_per_unit, fall back if column doesn't exist yet
    let prodsData: any[] = []
    const { data: prods1, error: prodsErr } = await supabase
      .from('products').select('id, name, image_url, days_per_unit').order('name')
    if (prodsErr) {
      const { data: prods2 } = await supabase
        .from('products').select('id, name, image_url').order('name')
      prodsData = (prods2 ?? []).map((p: any) => ({ ...p, days_per_unit: null }))
    } else {
      prodsData = prods1 ?? []
    }
    setProducts(prodsData.map((p: any) => ({
      id: p.id,
      name: p.name,
      image_url: p.image_url ?? null,
      days_per_unit: p.days_per_unit != null ? String(p.days_per_unit) : '',
    })))

    // Fetch follow-up items — only if columns exist
    const { data: saleData } = await supabase
      .from('sale_items').select(`
        id, estimated_days, quantity, followup_done,
        sales!inner(created_at, customers!inner(name, phone)),
        products!inner(name)
      `).not('estimated_days', 'is', null)

    if (saleData) {
      const now = Date.now()
      const mapped: FollowupItem[] = (saleData as any[]).map(d => {
        const finishMs = new Date(d.sales.created_at).getTime() + d.estimated_days * 86400000
        const callDate = new Date(finishMs - 86400000)
        return {
          id: d.id,
          estimated_days: d.estimated_days,
          quantity: d.quantity,
          followup_done: d.followup_done ?? false,
          product_name: d.products.name,
          customer_name: d.sales.customers.name,
          customer_phone: d.sales.customers.phone,
          call_date: callDate,
          days_until_call: Math.floor((callDate.getTime() - now) / 86400000),
        }
      }).sort((a, b) => a.call_date.getTime() - b.call_date.getTime())
      setItems(mapped)
    }
    setLoading(false)
  }

  function setProductDays(id: string, val: string) {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, days_per_unit: val.replace(/\D/g, '') } : p))
  }

  async function saveDays() {
    setSaving(true)
    const changed = products.filter(p => p.days_per_unit.trim() !== '')
    if (changed.length === 0) { setSaving(false); return }
    const { error } = await supabase.from('products')
      .update({ days_per_unit: parseInt(changed[0].days_per_unit) })
      .eq('id', changed[0].id)
    if (error && error.message.includes('column')) {
      setSaving(false)
      alert('Önce Supabase SQL Editör\'de şunu çalıştırın:\n\nALTER TABLE products ADD COLUMN days_per_unit integer;\nALTER TABLE sale_items ADD COLUMN estimated_days integer;\nALTER TABLE sale_items ADD COLUMN followup_done boolean DEFAULT false;')
      return
    }
    for (const p of products) {
      const val = p.days_per_unit.trim()
      await supabase.from('products').update({ days_per_unit: val ? parseInt(val) : null }).eq('id', p.id)
    }
    setSaving(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  async function markDone(id: string) {
    await supabase.from('sale_items').update({ followup_done: true }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, followup_done: true } : i))
  }

  async function markUndone(id: string) {
    await supabase.from('sale_items').update({ followup_done: false }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, followup_done: false } : i))
  }

  function whatsappLink(phone: string, name: string, product: string) {
    const msg = encodeURIComponent(`Merhaba ${name}, ${product} ürününüzün bitmesine yaklaşıyor. Yenisini temin etmemizi ister misiniz? 🙏`)
    const cleaned = phone.replace(/\D/g, '')
    const num = cleaned.startsWith('90') ? cleaned : cleaned.startsWith('0') ? '90' + cleaned.slice(1) : '90' + cleaned
    return `https://wa.me/${num}?text=${msg}`
  }

  const filteredItems = items.filter(i =>
    filter === 'all' ? true : filter === 'pending' ? !i.followup_done : i.followup_done
  )

  const urgentCount = items.filter(i => !i.followup_done && i.days_until_call <= 0).length

  const overdue   = filteredItems.filter(i => i.days_until_call < 0)
  const todayList = filteredItems.filter(i => i.days_until_call === 0)
  const thisWeek  = filteredItems.filter(i => i.days_until_call >= 1 && i.days_until_call <= 7)
  const thisMonth = filteredItems.filter(i => i.days_until_call > 7 && i.days_until_call <= 30)
  const later     = filteredItems.filter(i => i.days_until_call > 30)

  function renderRow(item: FollowupItem) {
    const d = item.days_until_call
    const callLabel = d < 0
      ? `${Math.abs(d)} gün önce aranmalıydı`
      : d === 0 ? 'Bugün aranmalı'
      : d === 1 ? 'Yarın aranmalı'
      : `${d} gün sonra aranmalı`
    const cardCls = d < 0
      ? 'border-red-100 bg-red-50/50'
      : d === 0 ? 'border-amber-200 bg-amber-50/60'
      : 'border-stone-100 bg-white'
    const dColor = d < 0 ? 'text-red-600' : d === 0 ? 'text-amber-600' : d <= 7 ? 'text-blue-600' : 'text-stone-400'

    return (
      <div key={item.id} className={`border rounded-sm p-4 flex items-center gap-4 ${cardCls} ${item.followup_done ? 'opacity-40' : ''}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="font-semibold text-stone-900 text-sm">{item.customer_name}</p>
            {item.customer_phone && <span className="text-stone-400 text-xs font-mono">{item.customer_phone}</span>}
          </div>
          <p className="text-stone-500 text-xs mb-1">
            {item.product_name} <span className="text-stone-400">× {item.quantity} kutu</span>
            <span className="text-stone-300 mx-1.5">·</span>
            <span className="text-stone-400">{item.estimated_days} gün</span>
          </p>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold ${dColor}`}>{callLabel}</span>
            <span className="text-stone-300 text-[10px]">·</span>
            <span className="text-[10px] text-stone-400">Ara: {item.call_date.toLocaleDateString('tr-TR')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.customer_phone && !item.followup_done && (
            <a
              href={whatsappLink(item.customer_phone, item.customer_name, item.product_name)}
              target="_blank" rel="noopener noreferrer"
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-sm text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors"
            >WA</a>
          )}
          {!item.followup_done ? (
            <button
              onClick={() => markDone(item.id)}
              className="border border-stone-200 hover:border-teal-600 text-stone-600 hover:text-stone-900 px-3 py-2 rounded-sm text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors"
            >Arandı</button>
          ) : (
            <button onClick={() => markUndone(item.id)} className="text-[10px] text-emerald-600 font-semibold hover:text-stone-400 transition-colors">
              ✓ Arandı
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderGroup(title: string, groupItems: FollowupItem[], color: string) {
    if (groupItems.length === 0) return null
    return (
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${color}`}>{title}</span>
          <span className="bg-stone-100 text-stone-500 text-[10px] font-bold px-2 py-0.5 rounded-full">{groupItems.length}</span>
        </div>
        <div className="space-y-2">{groupItems.map(renderRow)}</div>
      </div>
    )
  }

  return (
    <div className="flex gap-0" style={{ height: 'calc(100vh - 88px)', minHeight: '500px' }}>

      {/* LEFT: Product duration config */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-stone-200 bg-white overflow-hidden">
        <div className="px-5 pt-6 pb-4 border-b border-stone-200 flex-shrink-0">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.2em] mb-1">Ayarlar</p>
          <h3 className="text-stone-900 font-bold text-base tracking-tight">Kullanım Süreleri</h3>
          <p className="text-stone-400 text-xs mt-1">Her kutu kaç günde biter?</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {products.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors ${i !== 0 ? 'border-t border-stone-100' : ''}`}
            >
              {/* Image */}
              <div className="w-10 h-10 flex-shrink-0 bg-stone-100 rounded-sm flex items-center justify-center overflow-hidden">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-0.5" />
                ) : (
                  <span className="text-stone-400 text-sm font-bold">{p.name.charAt(0).toUpperCase()}</span>
                )}
              </div>

              {/* Name */}
              <p className="flex-1 min-w-0 text-xs font-semibold text-stone-800 leading-tight line-clamp-2">{p.name}</p>

              {/* Days input */}
              <div className="flex items-center border border-stone-200 rounded-sm overflow-hidden bg-white flex-shrink-0">
                <input
                  type="text"
                  inputMode="numeric"
                  value={p.days_per_unit}
                  onChange={e => setProductDays(p.id, e.target.value)}
                  placeholder="—"
                  className="w-10 text-center text-xs font-bold text-stone-900 outline-none py-2 bg-transparent tabular-nums focus:bg-stone-50"
                />
                <span className="text-[9px] text-stone-400 pr-2 font-medium">gün</span>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-4 border-t border-stone-200 flex-shrink-0">
          <button
            onClick={saveDays}
            disabled={saving}
            className={`w-full py-2.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.2em] transition-all ${
              savedFlash
                ? 'bg-emerald-500 text-white'
                : 'bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white'
            }`}
          >
            {saving ? 'Kaydediliyor...' : savedFlash ? '✓ Kaydedildi' : 'Kaydet'}
          </button>
        </div>
      </div>

      {/* RIGHT: Follow-up list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.2em] mb-1">Takip Listesi</p>
            <h2 className="text-stone-900 font-bold text-xl tracking-tight">Müşteri Takip</h2>
          </div>
          {urgentCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-sm px-4 py-2.5">
              <p className="text-red-700 text-sm font-bold">{urgentCount} kişi hemen aranmalı</p>
            </div>
          )}
        </div>

        <div className="px-6 pt-4 pb-3 flex gap-2 flex-shrink-0 border-b border-stone-100">
          {([
            ['pending', 'Bekleyenler'],
            ['all', 'Tümü'],
            ['done', 'Tamamlananlar'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-1.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.12em] border transition-colors ${
                filter === key
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
              }`}
            >{label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2.5">
              <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
              <span className="text-stone-400 text-sm">Yükleniyor...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-stone-400 text-sm">
                {filter === 'pending' ? 'Bekleyen müşteri yok — harika!' : 'Kayıt bulunamadı'}
              </p>
              <p className="text-stone-300 text-xs mt-2">
                Soldaki tablodan ürünlere gün/kutu girin — satışlarda otomatik hesaplanır
              </p>
            </div>
          ) : (
            <>
              {renderGroup('Geçti — Hemen Arayın', overdue, 'text-red-600')}
              {renderGroup('Bugün', todayList, 'text-amber-600')}
              {renderGroup('Bu Hafta', thisWeek, 'text-blue-600')}
              {renderGroup('Bu Ay', thisMonth, 'text-stone-600')}
              {renderGroup('Sonraki', later, 'text-stone-400')}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
