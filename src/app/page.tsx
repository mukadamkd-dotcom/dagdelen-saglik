'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMode } from '@/contexts/ModeContext'

interface Stats {
  totalProducts: number
  totalSalesToday: number
  totalRevenue: number
  todayProfit: number
  lowStockCount: number
  pendingCouriers: number
  totalCustomers: number
}

interface LocationStock { location: string; totalItems: number }

interface RecentSale {
  id: string; location: string; channel: string
  total_amount: number; sale_date: string; status: string
}

interface TopProduct {
  product_id: string; name: string; image_url: string | null
  totalQty: number; totalRevenue: number
}

interface AlertItem {
  id: string; name: string
  type: 'expiry_critical' | 'expiry_warning' | 'low_stock'
  detail: string
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
  const [stats, setStats] = useState<Stats>({ totalProducts: 0, totalSalesToday: 0, totalRevenue: 0, todayProfit: 0, lowStockCount: 0, pendingCouriers: 0, totalCustomers: 0 })
  const [salesTodayRaw, setSalesTodayRaw] = useState<{ total_amount: number; location_id: string }[]>([])
  const [locationStocks, setLocationStocks] = useState<LocationStock[]>([])
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchDashboard() }, [])

  async function fetchDashboard() {
    const today = new Date().toISOString().split('T')[0]
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const thirtyDays = new Date()
    thirtyDays.setDate(thirtyDays.getDate() + 30)

    const [
      productsRes, salesToday, customers, couriers,
      inventory, sales, salesWithProfit, saleItemsMonth,
      expiringBatches, invForAlerts,
    ] = await Promise.all([
      supabase.from('products').select('id, name, image_url').eq('is_active', true),
      supabase.from('sales').select('total_amount, location_id').gte('sale_date', today).eq('status', 'tamamlandi'),
      supabase.from('customers').select('id', { count: 'exact' }),
      supabase.from('courier_orders').select('id', { count: 'exact' }).in('status', ['hazirlaniyor', 'kuryede']),
      supabase.from('inventory').select('quantity, locations(name)'),
      supabase.from('sales').select('id, total_amount, sale_date, status, channel, locations(name)').order('created_at', { ascending: false }).limit(8),
      supabase.from('sales').select('sale_items(profit)').gte('sale_date', today).eq('status', 'tamamlandi'),
      supabase.from('sale_items').select('product_id, quantity, sale_price').gte('created_at', monthStart.toISOString()),
      supabase.from('inventory_batches').select('product_id, expiry_date, quantity').gt('quantity', 0).not('expiry_date', 'is', null).lte('expiry_date', thirtyDays.toISOString().split('T')[0]).order('expiry_date').limit(50),
      supabase.from('inventory').select('product_id, quantity, min_stock_alert, locations(name)').gt('quantity', 0),
    ])

    // Product lookup map
    const productLookup: Record<string, { name: string; image_url: string | null }> = {}
    ;(productsRes.data ?? []).forEach((p: any) => {
      productLookup[p.id] = { name: p.name, image_url: p.image_url ?? null }
    })

    // Today's stats
    const rawData = salesToday.data ?? []
    setSalesTodayRaw(rawData)
    const revenue = rawData.reduce((s, x) => s + Number(x.total_amount), 0)

    const todayProfit = (salesWithProfit.data ?? []).reduce((sum: number, sale: any) => {
      return sum + (sale.sale_items ?? []).reduce((s: number, item: any) => s + Number(item.profit ?? 0), 0)
    }, 0)

    // Low stock count (uses min_stock_alert threshold)
    const lowStockItems = (invForAlerts.data ?? []).filter((r: any) =>
      r.min_stock_alert != null && r.quantity < r.min_stock_alert
    )

    setStats({
      totalProducts: (productsRes.data ?? []).length,
      totalSalesToday: rawData.length,
      totalRevenue: revenue,
      todayProfit,
      lowStockCount: lowStockItems.length,
      pendingCouriers: couriers.count ?? 0,
      totalCustomers: customers.count ?? 0,
    })

    // Location stocks
    const locMap: Record<string, number> = {}
    ;(inventory.data ?? []).forEach((inv: any) => {
      const name = inv.locations?.name ?? 'Bilinmiyor'
      locMap[name] = (locMap[name] ?? 0) + Number(inv.quantity)
    })
    setLocationStocks(Object.entries(locMap).map(([location, totalItems]) => ({ location, totalItems })))

    // Recent sales
    setRecentSales((sales.data ?? []).map((s: any) => ({
      id: s.id, location: s.locations?.name ?? '-', channel: s.channel,
      total_amount: s.total_amount, sale_date: s.sale_date, status: s.status,
    })))

    // Top products this month
    const topMap: Record<string, TopProduct> = {}
    ;(saleItemsMonth.data ?? []).forEach((item: any) => {
      const pid = item.product_id
      if (!topMap[pid]) {
        topMap[pid] = {
          product_id: pid,
          name: productLookup[pid]?.name ?? 'Bilinmiyor',
          image_url: productLookup[pid]?.image_url ?? null,
          totalQty: 0, totalRevenue: 0,
        }
      }
      topMap[pid].totalQty += Number(item.quantity)
      topMap[pid].totalRevenue += Number(item.quantity) * Number(item.sale_price)
    })
    const top = Object.values(topMap).sort((a, b) => b.totalQty - a.totalQty).slice(0, 7)
    setTopProducts(top)

    // Alerts
    const alertItems: AlertItem[] = []
    const seen7 = new Set<string>()
    const seen30 = new Set<string>()

    ;(expiringBatches.data ?? []).forEach((b: any) => {
      const pid = b.product_id
      const daysLeft = Math.floor((new Date(b.expiry_date).getTime() - Date.now()) / 86400000)
      const name = productLookup[pid]?.name ?? `Ürün #${pid?.slice(0, 6) ?? '?'}`
      const detail = daysLeft <= 0 ? 'SKT geçti!' : `${daysLeft} gün kaldı`

      if (daysLeft <= 7 && !seen7.has(pid)) {
        seen7.add(pid)
        alertItems.push({ id: `exp7_${pid}`, name, type: 'expiry_critical', detail })
      } else if (daysLeft <= 30 && !seen30.has(pid)) {
        seen30.add(pid)
        alertItems.push({ id: `exp30_${pid}`, name, type: 'expiry_warning', detail })
      }
    })

    const seenLow = new Set<string>()
    ;(invForAlerts.data ?? []).forEach((r: any) => {
      const pid = r.product_id
      if (r.min_stock_alert != null && r.quantity < r.min_stock_alert && !seenLow.has(pid)) {
        seenLow.add(pid)
        const name = productLookup[pid]?.name ?? 'Bilinmiyor'
        alertItems.push({
          id: `low_${pid}`,
          name,
          type: 'low_stock',
          detail: `${r.quantity} adet (min: ${r.min_stock_alert})`,
        })
      }
    })

    setAlerts(alertItems)
    setLoading(false)
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-8 h-8 border-2 border-stone-200 border-t-[#7C3AED] rounded-full animate-spin" />
      <p className="text-stone-400 text-sm">Yükleniyor...</p>
    </div>
  )

  const displayRevenue = isAdminMode
    ? stats.totalRevenue
    : salesTodayRaw.filter(s => s.location_id === cashierLocationId).reduce((sum, x) => sum + Number(x.total_amount), 0)

  const criticalAlerts = alerts.filter(a => a.type === 'expiry_critical')
  const warningAlerts = alerts.filter(a => a.type === 'expiry_warning')
  const lowStockAlerts = alerts.filter(a => a.type === 'low_stock')

  const statCards = [
    { label: 'Aktif Ürün', value: stats.totalProducts, color: 'text-stone-900' },
    { label: 'Bugünkü Satış', value: stats.totalSalesToday, color: 'text-stone-900' },
    { label: 'Bugünkü Ciro', value: `₺${displayRevenue.toLocaleString('tr-TR')}`, color: 'text-stone-900', adminOnly: true },
    { label: 'Bugünkü Kâr', value: `₺${stats.todayProfit.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}`, color: stats.todayProfit > 0 ? 'text-emerald-600' : 'text-stone-900', adminOnly: true },
    { label: 'Düşük Stok', value: stats.lowStockCount, color: stats.lowStockCount > 0 ? 'text-amber-600' : 'text-stone-900' },
    { label: 'Bekleyen Kargo', value: stats.pendingCouriers, color: stats.pendingCouriers > 0 ? 'text-amber-700' : 'text-stone-900' },
    { label: 'Toplam Müşteri', value: stats.totalCustomers, color: 'text-stone-900' },
  ]

  const maxStock = Math.max(...locationStocks.map(l => l.totalItems), 1)

  return (
    <div>
      {/* Greeting */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-stone-900 text-2xl font-bold tracking-tight">{getGreeting()}, hoş geldiniz</h2>
          <p className="text-stone-400 text-sm mt-1">
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <a href="/gorsel" className="flex items-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-4 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-semibold shadow-sm transition-colors whitespace-nowrap flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          Görsel Üret
        </a>
      </div>

      {/* Alert Section */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {criticalAlerts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-sm p-4">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-[0.15em] mb-2.5">
                Son Kullanma Tarihi Kritik — {criticalAlerts.length} ürün
              </p>
              <div className="flex flex-wrap gap-2">
                {criticalAlerts.map(a => (
                  <span key={a.id} className="bg-red-100 border border-red-200 text-red-800 text-xs px-2.5 py-1 rounded-sm font-medium">
                    {a.name} <span className="font-bold">· {a.detail}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {warningAlerts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-sm p-4">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-[0.15em] mb-2.5">
                Son Kullanma Tarihi Yaklaşıyor — {warningAlerts.length} ürün
              </p>
              <div className="flex flex-wrap gap-2">
                {warningAlerts.map(a => (
                  <span key={a.id} className="bg-amber-100 border border-amber-200 text-amber-800 text-xs px-2.5 py-1 rounded-sm font-medium">
                    {a.name} <span className="font-bold">· {a.detail}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {lowStockAlerts.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-sm p-4">
              <p className="text-[10px] font-bold text-[#7C3AED] uppercase tracking-[0.15em] mb-2.5">
                Düşük Stok Uyarısı — {lowStockAlerts.length} ürün
              </p>
              <div className="flex flex-wrap gap-2">
                {lowStockAlerts.map(a => (
                  <span key={a.id} className="bg-purple-50 border border-purple-200 text-purple-800 text-xs px-2.5 py-1 rounded-sm font-medium">
                    {a.name} <span className="font-bold">· {a.detail}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-7">
        {statCards.filter(c => isAdminMode || !c.adminOnly).map((c) => (
          <div key={c.label} className="bg-white rounded-sm p-5 border border-stone-200 shadow-sm hover:shadow-md transition-all duration-200">
            <p className={`text-2xl font-bold ${c.color} leading-none tabular-nums`}>{c.value}</p>
            <p className="text-stone-400 text-[10px] font-semibold mt-2 uppercase tracking-[0.15em]">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Lokasyon Stokları */}
        <div className="bg-white border border-stone-200 shadow-sm p-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-5">Lokasyon Stokları</h3>
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
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-700 rounded-full"
                      style={{ width: `${(ls.totalItems / maxStock) * 100}%`, background: '#7C3AED' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* En Çok Satan Bu Ay */}
        <div className="bg-white border border-stone-200 shadow-sm p-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-5">En Çok Satan — Bu Ay</h3>
          {topProducts.length === 0 ? (
            <p className="text-stone-400 text-sm text-center py-4">Bu ay satış yok</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={p.product_id} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-stone-300 w-4 tabular-nums flex-shrink-0">{i + 1}</span>
                  <div className="w-8 h-8 bg-stone-100 rounded-sm flex items-center justify-center overflow-hidden flex-shrink-0">
                    {p.image_url
                      ? <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-0.5" />
                      : <span className="text-stone-400 text-xs font-bold">{p.name.charAt(0)}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-stone-800 truncate">{p.name}</p>
                    <p className="text-[10px] text-stone-400 tabular-nums">
                      {p.totalQty} adet · ₺{p.totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Son Satışlar */}
        <div className="bg-white border border-stone-200 shadow-sm p-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-5">Son Satışlar</h3>
          {recentSales.length === 0 ? (
            <p className="text-stone-400 text-sm text-center py-4">Satış verisi yok</p>
          ) : (
            <div className="space-y-2">
              {recentSales.slice(0, 8).map((s) => {
                const badge = statusMap[s.status]
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-stone-50 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-stone-800 truncate">{s.location}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${channelColors[s.channel] ?? 'border border-stone-200 text-stone-600 bg-stone-50'}`}>
                          {channelLabel[s.channel] ?? s.channel}
                        </span>
                        {badge && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${badge.style}`}>{badge.label}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-stone-900 tabular-nums flex-shrink-0">
                      ₺{Number(s.total_amount).toLocaleString('tr-TR')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
