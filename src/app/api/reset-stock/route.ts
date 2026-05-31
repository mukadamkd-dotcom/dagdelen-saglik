import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { productId, locationId } = await req.json()
  if (!productId || !locationId) {
    return NextResponse.json({ error: 'productId ve locationId zorunludur' }, { status: 400 })
  }

  // Inventory kaydı varsa 0 yap, yoksa oluştur
  const { data: existing } = await supabaseAdmin
    .from('inventory')
    .select('id')
    .eq('product_id', productId)
    .eq('location_id', locationId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabaseAdmin
      .from('inventory')
      .update({ quantity: 0 })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabaseAdmin
      .from('inventory')
      .insert({ product_id: productId, location_id: locationId, quantity: 0, min_stock_alert: 5 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // SAYIM_MIAD geçmişini de sil — yoksa fallback eski değeri göstermeye devam eder
  await supabaseAdmin
    .from('stock_movements')
    .delete()
    .eq('product_id', productId)
    .eq('to_location_id', locationId)
    .like('notes', 'SAYIM_MIAD:%')

  return NextResponse.json({ ok: true })
}
