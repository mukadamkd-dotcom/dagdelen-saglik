'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface LocationReport {
  location_id: string; location_name: string
  totalSales: number; totalRevenue: number; totalProfit: number
  totalLosses: number; pendingDebts: number
}

interface ProductReport {
  product_id: string; name: string; image_url: string | null
  totalQty: number; totalRevenue: number; totalProfit: number; marginPct: number
}

type Tab = 'lokasyon' | 'urunler'

export default function RaporlarPage() {
  const [tab, setTab] = useState<Tab>('lokasyon')
  const [reports, setReports] = useState<LocationReport[]>([])
  const [productReports, setProductReports] = useState<ProductReport[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'qty' | 'revenue' | 'profit' | 'margin'>('revenue')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => { fetchReports() }, [startDate, endDate])

  async function fetchReports() {
    setLoading(true)
    const endWithTime = endDate + 'T23:59:59'

    const [{ data: locs }, { data: sales }, { data: losses }, { data: debts }, { data: saleItems }] = await Promise.all([
      supabase.from('locations').select('id, name'),
      supabase.from('sales').select('location_id, total_amount, status, sale_items(profit)').gte('sale_date', startDate).lte('sale_date', endWithTime),
      supabase.from('losses').select('location_id, quantity, products(purchase_price)').gte('created_at', startDate).lte('created_at', endWithTime),
      supabase.from('internal_debts').select('debtor_location_id, amount').eq('status', 'odenmedi'),
      supabase.from('sale_items').select('product_id, quantity, sale_price, profit, products(name, image_url)').gte('created_at', startDate).lte('created_at', endWithTime),
    ])

    // Location reports (existing logic)
    const locResult: LocationReport[] = (locs ?? []).map(loc => {
      const locSales = (sales ?? []).filter(s => s.location_id === loc.id && s.status === 'tamamlandi')
      const totalRevenue = locSales.reduce((s, x) => s + Number(x.total_amount), 0)
      const totalProfit = locSales.reduce((s, x) => s + (x.sale_items ?? []).reduce((a: number, i: any) => a + Number(i.profit ?? 0), 0), 0)
      const totalLosses = (losses ?? []).filter(l => l.location_id === loc.id).reduce((s, l) => s + (Number(l.quantity) * Number((l.products as any)?.purchase_price ?? 0)), 0)
      const pendingDebts = (debts ?? []).filter(d => d.debtor_location_id === loc.id).reduce((s, d) => s + Number(d.amount), 0)
      return { location_id: loc.id, location_name: loc.name, totalSales: locSales.length, totalRevenue, totalProfit, totalLosses, pendingDebts }
    })
    setReports(locResult)

    // Product reports
    const prodMap: Record<string, ProductReport> = {}
    ;(saleItems ?? []).forEach((item: any) => {
      const pid = item.product_id
      if (!prodMap[pid]) {
        prodMap[pid] = {
          product_id: pid,
          name: item.products?.name ?? 'Bilinmiyor',
          image_url: item.products?.image_url ?? null,
          totalQty: 0, totalRevenue: 0, totalProfit: 0, marginPct: 0,
        }
      }
      prodMap[pid].totalQty += Number(item.quantity)
      prodMap[pid].totalRevenue += Number(item.quantity) * Number(item.sale_price)
      prodMap[pid].totalProfit += Number(item.profit ?? 0)
    })
    const prodList = Object.values(prodMap).map(p => ({
      ...p,
      marginPct: p.totalRevenue > 0 ? (p.totalProfit / p.totalRevenue) * 100 : 0,
    }))
    setProductReports(prodList)
    setLoading(false)
  }

  const grandRevenue = reports.reduce((s, r) => s + r.totalRevenue, 0)
  const grandProfit = reports.reduce((s, r) => s + r.totalProfit, 0)
  const grandLoss = reports.reduce((s, r) => s + r.totalLosses, 0)

  const sortedProducts = [...productReports].sort((a, b) => {
    if (sortBy === 'qty') return b.totalQty - a.totalQty
    if (sortBy === 'revenue') return b.totalRevenue - a.totalRevenue
    if (sortBy === 'profit') return b.totalProfit - a.totalProfit
    return b.marginPct - a.marginPct
  })

  const maxRevenue = Math.max(...productReports.map(p => p.totalRevenue), 1)

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Raporlar</h2>
          <p className="text-stone-400 text-sm mt-1">Satış, karlılık ve ürün analizi</p>
        </div>
        <a
          href="/downloads/dagdelen-strateji-plani.csv"
          download="Dagdelen-Strateji-Plani.csv"
          className="flex items-center gap-2 px-4 py-2.5 text-white text-[11px] tracking-[0.2em] uppercase font-semibold shadow-sm transition-all"
          style={{ background: '#16A34A', borderRadius: '6px' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Strateji Planı İndir
        </a>
      </div>

      {/* Date Filter */}
      <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-5 mb-6 flex gap-5 items-end flex-wrap">
        <div>
          <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1.5">Başlangıç</label>
          <input type="date" className="border border-stone-200 rounded px-3.5 py-2.5 text-sm outline-none focus:border-[#7C3AED] transition-colors text-stone-700" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1.5">Bitiş</label>
          <input type="date" className="border border-stone-200 rounded px-3.5 py-2.5 text-sm outline-none focus:border-[#7C3AED] transition-colors text-stone-700" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button onClick={fetchReports} className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase shadow-sm transition-all">Uygula</button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-2">Toplam Ciro</p>
          <p className="text-3xl font-bold text-stone-900 tabular-nums">₺{grandRevenue.toLocaleString('tr-TR')}</p>
        </div>
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-2">Toplam Kar</p>
          <p className="text-3xl font-bold text-emerald-600 tabular-nums">₺{grandProfit.toLocaleString('tr-TR')}</p>
          {grandRevenue > 0 && (
            <p className="text-xs text-stone-400 mt-1">%{((grandProfit / grandRevenue) * 100).toFixed(1)} marj</p>
          )}
        </div>
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-2">Toplam Fire Maliyeti</p>
          <p className="text-3xl font-bold text-red-500 tabular-nums">₺{grandLoss.toLocaleString('tr-TR')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {([['lokasyon', 'Lokasyon Bazlı'], ['urunler', 'Ürün Analizi']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-sm text-[11px] font-semibold uppercase tracking-[0.12em] border transition-colors ${
              tab === key ? 'bg-[#7C3AED] text-white border-[#7C3AED]' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
            }`}
          >{label}</button>
        ))}
      </div>

      {/* Lokasyon Tab */}
      {tab === 'lokasyon' && (
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Lokasyon</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Satış</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ciro</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Kar</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Kar Marjı</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Fire Mal.</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Bekleyen Borç</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="w-5 h-5 border-2 border-stone-200 border-t-[#7C3AED] rounded-full animate-spin" />
                      <span className="text-stone-400 text-sm">Yükleniyor...</span>
                    </div>
                  </td></tr>
                ) : reports.map(r => (
                  <tr key={r.location_id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-stone-900">{r.location_name}</td>
                    <td className="px-5 py-3.5 text-right text-stone-600 tabular-nums">{r.totalSales}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-stone-900 tabular-nums">₺{r.totalRevenue.toLocaleString('tr-TR')}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-emerald-600 tabular-nums">₺{r.totalProfit.toLocaleString('tr-TR')}</td>
                    <td className="px-5 py-3.5 text-right text-stone-400 tabular-nums">
                      {r.totalRevenue > 0 ? ((r.totalProfit / r.totalRevenue) * 100).toFixed(1) : '0'}%
                    </td>
                    <td className="px-5 py-3.5 text-right text-red-500 tabular-nums">₺{r.totalLosses.toLocaleString('tr-TR')}</td>
                    <td className="px-5 py-3.5 text-right text-amber-600 tabular-nums">₺{r.pendingDebts.toLocaleString('tr-TR')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-stone-50 border-t-2 border-stone-200">
                  <td className="px-5 py-4 font-bold text-stone-900 text-[11px] tracking-[0.15em] uppercase">Toplam</td>
                  <td className="px-5 py-4 text-right font-bold text-stone-900 tabular-nums">{reports.reduce((s, r) => s + r.totalSales, 0)}</td>
                  <td className="px-5 py-4 text-right font-bold text-stone-900 tabular-nums">₺{grandRevenue.toLocaleString('tr-TR')}</td>
                  <td className="px-5 py-4 text-right font-bold text-emerald-600 tabular-nums">₺{grandProfit.toLocaleString('tr-TR')}</td>
                  <td className="px-5 py-4 text-right font-bold text-stone-400 tabular-nums">
                    {grandRevenue > 0 ? ((grandProfit / grandRevenue) * 100).toFixed(1) : '0'}%
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-red-500 tabular-nums">₺{grandLoss.toLocaleString('tr-TR')}</td>
                  <td className="px-5 py-4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Ürün Analizi Tab */}
      {tab === 'urunler' && (
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm overflow-hidden">
          {/* Sort controls */}
          <div className="px-5 py-3.5 border-b border-stone-100 bg-stone-50 flex items-center gap-2">
            <span className="text-[10px] text-stone-400 font-semibold uppercase tracking-[0.1em] mr-2">Sırala:</span>
            {([['revenue', 'Ciro'], ['qty', 'Adet'], ['profit', 'Kar'], ['margin', 'Marj']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-3 py-1 rounded-sm text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                  sortBy === key ? 'bg-[#7C3AED] text-white' : 'bg-white border border-stone-200 text-stone-500 hover:border-stone-400'
                }`}
              >{label}</button>
            ))}
            <span className="ml-auto text-[10px] text-stone-400">{productReports.length} ürün</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] w-10">#</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] w-12">Görsel</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürün</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Satış Adedi</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ciro</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Kar</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Kar Marjı</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="w-5 h-5 border-2 border-stone-200 border-t-[#7C3AED] rounded-full animate-spin" />
                      <span className="text-stone-400 text-sm">Yükleniyor...</span>
                    </div>
                  </td></tr>
                ) : sortedProducts.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-stone-400 text-sm">Bu dönemde satış yok</td></tr>
                ) : sortedProducts.map((p, i) => (
                  <tr key={p.product_id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                    <td className="px-5 py-3 text-[11px] text-stone-300 font-bold tabular-nums">{i + 1}</td>
                    <td className="px-5 py-3">
                      <div className="w-9 h-9 bg-stone-100 rounded-sm flex items-center justify-center overflow-hidden">
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-0.5" />
                          : <span className="text-stone-400 text-xs font-bold">{p.name.charAt(0)}</span>
                        }
                      </div>
                    </td>
                    <td className="px-5 py-3 font-semibold text-stone-800">{p.name}</td>
                    <td className="px-5 py-3 text-right text-stone-600 tabular-nums font-medium">{p.totalQty}</td>
                    <td className="px-5 py-3 text-right font-bold text-stone-900 tabular-nums">₺{p.totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    <td className={`px-5 py-3 text-right font-bold tabular-nums ${p.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      ₺{p.totalProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden max-w-24">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(Math.max(p.marginPct, 0), 100)}%`,
                              background: p.marginPct >= 30 ? '#059669' : p.marginPct >= 15 ? '#7C3AED' : p.marginPct >= 0 ? '#F59E0B' : '#EF4444',
                            }}
                          />
                        </div>
                        <span className={`text-xs font-bold tabular-nums ${p.marginPct >= 0 ? 'text-stone-600' : 'text-red-500'}`}>
                          {p.marginPct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
