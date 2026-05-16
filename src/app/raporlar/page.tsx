'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface LocationReport {
  location_id: string
  location_name: string
  totalSales: number
  totalRevenue: number
  totalProfit: number
  totalLosses: number
  pendingDebts: number
}

export default function RaporlarPage() {
  const [reports, setReports] = useState<LocationReport[]>([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => { fetchReports() }, [startDate, endDate])

  async function fetchReports() {
    setLoading(true)
    const [{ data: locs }, { data: sales }, { data: losses }, { data: debts }] = await Promise.all([
      supabase.from('locations').select('id, name'),
      supabase.from('sales').select('location_id, total_amount, status, sale_items(profit)').gte('sale_date', startDate).lte('sale_date', endDate + 'T23:59:59'),
      supabase.from('losses').select('location_id, quantity, products(purchase_price)').gte('created_at', startDate).lte('created_at', endDate + 'T23:59:59'),
      supabase.from('internal_debts').select('debtor_location_id, amount').eq('status', 'odenmedi'),
    ])

    const result: LocationReport[] = (locs ?? []).map(loc => {
      const locSales = (sales ?? []).filter(s => s.location_id === loc.id && s.status === 'tamamlandi')
      const totalRevenue = locSales.reduce((s, x) => s + Number(x.total_amount), 0)
      const totalProfit = locSales.reduce((s, x) => s + (x.sale_items ?? []).reduce((a: number, i: any) => a + Number(i.profit ?? 0), 0), 0)
      const totalLosses = (losses ?? []).filter(l => l.location_id === loc.id).reduce((s, l) => s + (Number(l.quantity) * Number((l.products as any)?.purchase_price ?? 0)), 0)
      const pendingDebts = (debts ?? []).filter(d => d.debtor_location_id === loc.id).reduce((s, d) => s + Number(d.amount), 0)
      return { location_id: loc.id, location_name: loc.name, totalSales: locSales.length, totalRevenue, totalProfit, totalLosses, pendingDebts }
    })

    setReports(result)
    setLoading(false)
  }

  const grandRevenue = reports.reduce((s, r) => s + r.totalRevenue, 0)
  const grandProfit = reports.reduce((s, r) => s + r.totalProfit, 0)
  const grandLoss = reports.reduce((s, r) => s + r.totalLosses, 0)

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Raporlar</h2>
        <p className="text-stone-400 text-sm mt-1">Lokasyon bazlı karlılık ve satış analizi</p>
      </div>

      {/* Date Filter */}
      <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-5 mb-6 flex gap-5 items-end flex-wrap">
        <div>
          <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1.5">Başlangıç</label>
          <input
            type="date"
            className="border border-stone-200 rounded px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors text-stone-700"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1.5">Bitiş</label>
          <input
            type="date"
            className="border border-stone-200 rounded px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors text-stone-700"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
        <button
          onClick={fetchReports}
          className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase shadow-sm transition-all"
        >
          Uygula
        </button>
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
        </div>
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-2">Toplam Fire Maliyeti</p>
          <p className="text-3xl font-bold text-red-500 tabular-nums">₺{grandLoss.toLocaleString('tr-TR')}</p>
        </div>
      </div>

      {/* Location Table */}
      <div className="bg-white border border-stone-200 shadow-sm rounded-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-50">
          <h3 className="font-semibold text-stone-900 text-sm tracking-wide">Lokasyon Bazlı Rapor</h3>
        </div>
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
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                      <span className="text-stone-400 text-sm">Yükleniyor...</span>
                    </div>
                  </td>
                </tr>
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
    </div>
  )
}
