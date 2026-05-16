'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function VeresiyePage() {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [paying, setPaying] = useState<string | null>(null)

  useEffect(() => { fetchVeresiye() }, [])

  async function fetchVeresiye() {
    const { data } = await supabase
      .from('sales')
      .select('*, customers(name, phone), locations(name), sale_items(quantity, sale_price, products(name))')
      .eq('status', 'veresiye')
      .order('created_at', { ascending: false })
    setSales(data ?? [])
    setLoading(false)
  }

  async function markPaid(id: string) {
    setPaying(id)
    await supabase.from('sales').update({ status: 'tamamlandi', notes: 'Veresiye ödendi' }).eq('id', id)
    setPaying(null)
    fetchVeresiye()
  }

  // Group by customer
  const byCustomer: Record<string, { customer: any; sales: any[] }> = {}
  sales.forEach(s => {
    const cid = s.customer_id ?? '__unknown'
    if (!byCustomer[cid]) byCustomer[cid] = { customer: s.customers, sales: [] }
    byCustomer[cid].sales.push(s)
  })
  const groups = Object.values(byCustomer)
  const grandTotal = sales.reduce((s, x) => s + Number(x.total_amount), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-stone-900">Veresiye</h2>
          <p className="text-stone-400 text-sm mt-1">{sales.length} bekleyen satış</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-sm px-4 py-2.5 shadow-sm">
          <span className="text-amber-700 text-[10px] font-semibold uppercase tracking-[0.15em]">Toplam Alacak</span>
          <p className="text-amber-900 font-bold text-lg tabular-nums">₺{grandTotal.toLocaleString('tr-TR')}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 gap-2.5">
          <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
          <span className="text-stone-400 text-sm">Yükleniyor...</span>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-stone-200 shadow-sm px-5 py-16 text-center">
          <p className="text-stone-400 text-sm">Bekleyen veresiye yok</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => {
            const customerId = group.sales[0].customer_id ?? '__unknown'
            const customerTotal = group.sales.reduce((s, x) => s + Number(x.total_amount), 0)
            const isOpen = expanded === customerId
            return (
              <div key={customerId} className="bg-white border border-stone-200 shadow-sm overflow-hidden">
                {/* Customer header row */}
                <div
                  className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-stone-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : customerId)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold text-sm flex-shrink-0">
                      {(group.customer?.name ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-stone-900">{group.customer?.name ?? 'Bilinmeyen Müşteri'}</p>
                      {group.customer?.phone && <p className="text-xs text-stone-400">{group.customer.phone}</p>}
                    </div>
                    <span className="px-2 py-0.5 border border-amber-200 text-amber-700 bg-amber-50/50 text-xs font-semibold rounded-sm">
                      {group.sales.length} satış
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.1em]">Toplam Borç</p>
                      <p className="text-lg font-bold text-amber-700 tabular-nums">₺{customerTotal.toLocaleString('tr-TR')}</p>
                    </div>
                    <span className="text-stone-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded sales */}
                {isOpen && (
                  <div className="border-t border-stone-100 divide-y divide-stone-50">
                    {group.sales.map(s => (
                      <div key={s.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-xs text-stone-500">{new Date(s.created_at).toLocaleDateString('tr-TR')}</span>
                            {s.locations?.name && <span className="text-xs text-stone-400">{s.locations.name}</span>}
                          </div>
                          <p className="text-xs text-stone-600 truncate">
                            {(s.sale_items ?? []).map((i: any) => `${i.products?.name} ×${i.quantity}`).join(', ')}
                          </p>
                          {s.discount_amount > 0 && (
                            <p className="text-[10px] text-stone-400 mt-0.5">İndirim: ₺{Number(s.discount_amount).toLocaleString('tr-TR')}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-sm font-bold text-stone-900 tabular-nums">₺{Number(s.total_amount).toLocaleString('tr-TR')}</span>
                          <button
                            onClick={() => markPaid(s.id)}
                            disabled={paying === s.id}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-sm text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors"
                          >
                            {paying === s.id ? '...' : 'Ödendi'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
