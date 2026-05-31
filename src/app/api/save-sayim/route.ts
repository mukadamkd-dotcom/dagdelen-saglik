import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

interface MiadRow { expiry_date: string; qty: number }
interface Item { productId: string; productName: string; totalQty: number; miadRows: MiadRow[] }

export async function POST(req: NextRequest) {
  const { sayimLocId, changedItems }: { sayimLocId: string; changedItems: Item[] } = await req.json()

  if (!sayimLocId || !Array.isArray(changedItems) || changedItems.length === 0) {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }

  const results: string[] = []
  const errors: string[] = []

  for (const item of changedItems) {
    try {
      // Direkt product_id + location_id ile UPDATE — id'ye gerek yok
      const { data: updatedRows, error: ue } = await supabaseAdmin
        .from('inventory')
        .update({ quantity: item.totalQty })
        .eq('product_id', item.productId)
        .eq('location_id', sayimLocId)
        .select('quantity')

      if (ue) throw new Error('UPDATE hata: ' + ue.message)

      if (!updatedRows || updatedRows.length === 0) {
        // Satır yok → INSERT
        const { error: ie } = await supabaseAdmin
          .from('inventory')
          .insert({ product_id: item.productId, location_id: sayimLocId, quantity: item.totalQty, min_stock_alert: 5 })
        if (ie) throw new Error('INSERT hata: ' + ie.message)
        results.push(`${item.productName}: ${item.totalQty} eklendi ✓`)
      } else {
        results.push(`${item.productName}: ${updatedRows[0].quantity} güncellendi ✓`)
      }

      for (const miad of item.miadRows) {
        if (!miad.expiry_date) continue
        await supabaseAdmin.from('stock_movements').insert({
          product_id: item.productId,
          to_location_id: sayimLocId,
          quantity: miad.qty,
          movement_type: 'satin_alma',
          notes: `SAYIM_MIAD:${miad.expiry_date}`,
        })
      }
    } catch (e: any) {
      errors.push(`${item.productName}: ${e.message}`)
    }
  }

  return NextResponse.json({ results, errors })
}
