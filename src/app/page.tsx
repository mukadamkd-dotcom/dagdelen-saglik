'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMode } from '@/contexts/ModeContext'

interface Stats {
  totalProducts: number
  totalSalesToday: number
  totalRevenue: number
  lowStockCount: number
  pendingCouriers: number
  totalCustomers: number
}

interface LocationStock {
  location: string
  totalItems: number
}

interface RecentSale {
  id: string
  location: string
  channel: string
  total_amount: number
  sale_date: string
  status: string
}

const channelLabel: Record<string, string> = { fiziksel: 'Fiziksel', instagram: 'Instagram', online: 'Online' }
const channelColors: Record<string, string> = {
  fiziksel: 'border border-stone-200 text-stone-600 bg-stone-50',
  instagram: 'border border-pink-200 text-pink-700 bg-pink-50/50',
  online: 'border border-stone-200 text-stone-600 bg-stone-50',
}
const statusMap: Record<string, { style: string; label: string }> = {
  tamamlandi: { style: 'border border-emerald-200 text-emerald-700 bg-emerald-50/50', label: 'Tamamlandı' },
  iptal: { style: 'border border-red-200 text-red-600 bg-red-50/50', label: 'İptal' },
  iade: { style: 'border border-amber-200 text-amber-700 bg-amber-50/50', label: 'İade' },
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Günaydın'
  if (h < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

export default function Dashboard() {
  const { isAdminMode, cashierLocationId } = useMode()
  const [stats, setStats] = useState<Stats>({ totalProducts: 0, totalSalesToday: 0, totalRevenue: 0, lowStockCount: 0, pendingCouriers: 0, totalCustomers: 0 })
  const [salesTodayRaw, setSalesTodayRaw] = useState<{ total_amount: number; location_id: string }[]>([])
  const [locationStocks, setLocationStocks] = useState<LocationStock[]>([])
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchDashboard() }, [])

  async function fetchDashboard() {
    const today = new Date().toISOString().split('T')[0]
    const [products, salesToday, customers, lowStock, couriers, inventory, sales] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact' }).eq('is_active', true),
      supabase.from('sales').select('total_amount, location_id').gte('sale_date', today).eq('status', 'tamamlandi'),
      supabase.from('customers').select('id', { count: 'exact' }),
      supabase.from('inventory').select('id', { count: 'exact' }).lt('quantity', 5).gt('quantity', 0),
      supabase.from('courier_orders').select('id', { count: 'exact' }).in('status', ['hazirlaniyor', 'kuryede']),
      supabase.from('inventory').select('quantity, locations(name)'),
      supabase.from('sales').select('id, total_amount, sale_date, status, channel, locations(name)').order('created_at', { ascending: false }).limit(8),
    ])

    const rawData = salesToday.data ?? []
    setSalesTodayRaw(rawData)
    const revenue = rawData.reduce((s, x) => s + Number(x.total_amount), 0)
    setStats({
      totalProducts: products.count ?? 0,
      totalSalesToday: rawData.length,
      totalRevenue: revenue,
      lowStockCount: lowStock.count ?? 0,
      pendingCouriers: couriers.count ?? 0,
      totalCustomers: customers.count ?? 0,
    })

    const locMap: Record<string, number> = {}
    inventory.data?.forEach((inv: any) => {
      const name = inv.locations?.name ?? 'Bilinmiyor'
      locMap[name] = (locMap[name] ?? 0) + Number(inv.quantity)
    })
    setLocationStocks(Object.entries(locMap).map(([location, totalItems]) => ({ location, totalItems })))
    setRecentSales((sales.data ?? []).map((s: any) => ({
      id: s.id, location: s.locations?.name ?? '-', channel: s.channel,
      total_amount: s.total_amount, sale_date: s.sale_date, status: s.status,
    })))
    setLoading(false)
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
      <p className="text-stone-400 text-sm">Yükleniyor...</p>
    </div>
  )

  const displayRevenue = isAdminMode
    ? stats.totalRevenue
    : salesTodayRaw.filter(s => s.location_id === cashierLocationId).reduce((sum, x) => sum + Number(x.total_amount), 0)

  const cards = [
    { label: 'Aktif Ürün', value: stats.totalProducts, num: 'text-stone-900' },
    { label: 'Bugünkü Satış', value: stats.totalSalesToday, num: 'text-stone-900' },
    { label: 'Bugünkü Ciro', value: `₺${displayRevenue.toLocaleString('tr-TR')}`, num: 'text-stone-700 font-semibold' },
    { label: 'Düşük Stok', value: stats.lowStockCount, num: stats.lowStockCount > 0 ? 'text-red-600' : 'text-stone-900' },
    { label: 'Bekleyen Kargo', value: stats.pendingCouriers, num: stats.pendingCouriers > 0 ? 'text-amber-700' : 'text-stone-900' },
    { label: 'Toplam Müşteri', value: stats.totalCustomers, num: 'text-stone-900' },
  ]

  const maxStock = Math.max(...locationStocks.map(l => l.totalItems), 1)

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-stone-900">{getGreeting()}, hoş geldiniz</h2>
        <p className="text-stone-400 text-sm mt-1">
          {new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-7">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-sm p-5 border border-stone-200 shadow-sm hover:shadow-md transition-all duration-200">
            <p className={`text-3xl font-bold ${c.num} leading-none tabular-nums`}>{c.value}</p>
            <p className="text-stone-400 text-[10px] font-semibold mt-2 uppercase tracking-[0.15em]">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white border border-stone-200 shadow-sm p-6">
          <h3 className="font-semibold text-stone-900 mb-5 text-[10px] tracking-[0.15em] uppercase text-stone-400">
            Lokasyon Stokları
          </h3>
          {locationStocks.length === 0 ? (
            <p className="text-stone-400 text-sm text-center py-4">Stok verisi yok</p>
          ) : (
            <div className="space-y-4">
              {locationStocks.map((ls) => (
                <div key={ls.location}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-medium text-stone-700">{ls.location}</span>
                    <span className="text-sm font-bold text-stone-900 tabular-nums">{ls.totalItems.toLocaleString('tr-TR')}</span>
                  </div>
                  <div className="h-1 bg-stone-100 overflow-hidden">
                    <div className="h-full transition-all duration-700 bg-stone-700" style={{ width: `${(ls.totalItems / maxStock) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-stone-200 shadow-sm p-6 lg:col-span-2">
          <h3 className="font-semibold mb-5 text-[10px] tracking-[0.15em] uppercase text-stone-400">
            Son Satışlar
          </h3>
          {recentSales.length === 0 ? (
            <p className="text-stone-400 text-sm text-center py-4">Satış verisi yok</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100">
                    <th className="pb-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Lokasyon</th>
                    <th className="pb-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] pl-4">Kanal</th>
                    <th className="pb-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] pl-4">Tutar</th>
                    <th className="pb-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] pl-4">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((s) => {
                    const badge = statusMap[s.status]
                    return (
                      <tr key={s.id} className="border-b border-stone-50 hover:bg-stone-50/70 transition-colors last:border-0">
                        <td className="py-3 text-stone-700 font-medium">{s.location}</td>
                        <td className="py-3 pl-4">
                          <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${channelColors[s.channel] ?? 'border border-stone-200 text-stone-600 bg-stone-50'}`}>
                            {channelLabel[s.channel] ?? s.channel}
                          </span>
                        </td>
                        <td className="py-3 pl-4 font-bold text-stone-900 tabular-nums">₺{Number(s.total_amount).toLocaleString('tr-TR')}</td>
                        <td className="py-3 pl-4">
                          {badge ? (
                            <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${badge.style}`}>{badge.label}</span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded text-xs font-semibold border border-stone-200 text-stone-600">{s.status}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
