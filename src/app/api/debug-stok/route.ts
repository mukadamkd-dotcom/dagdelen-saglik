import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ECZANE_UUID = 'd8c34681-88dc-474c-9b9f-e9e8779a374a'

export async function GET() {
  // 1) Tüm lokasyonlar
  const { data: locations } = await supabaseAdmin.from('locations').select('id, name').order('name')

  // 2) Eczane inventory - direkt filtreli
  const { data: eczaneInv, error: eczaneErr } = await supabaseAdmin
    .from('inventory')
    .select('product_id, quantity')
    .eq('location_id', ECZANE_UUID)
    .order('quantity', { ascending: false })

  // 3) Test: bir Eczane ürününe yazıp hemen oku (trigger var mı?)
  let triggerTest: Record<string, unknown> = {}
  if (eczaneInv && eczaneInv.length > 0) {
    const testProductId = eczaneInv[0].product_id
    const originalQty = eczaneInv[0].quantity

    // UPDATE → 777
    const { data: afterUpdate } = await supabaseAdmin
      .from('inventory')
      .update({ quantity: 777 })
      .eq('product_id', testProductId)
      .eq('location_id', ECZANE_UUID)
      .select('quantity')

    // Hemen SELECT ile kontrol
    const { data: afterSelect } = await supabaseAdmin
      .from('inventory')
      .select('quantity')
      .eq('product_id', testProductId)
      .eq('location_id', ECZANE_UUID)
      .single()

    // Geri al
    await supabaseAdmin
      .from('inventory')
      .update({ quantity: originalQty })
      .eq('product_id', testProductId)
      .eq('location_id', ECZANE_UUID)

    triggerTest = {
      product_id: testProductId,
      original_qty: originalQty,
      returning_qty: afterUpdate?.[0]?.quantity ?? null,
      select_after_update_qty: afterSelect?.quantity ?? null,
      trigger_detected: afterSelect?.quantity !== 777,
    }
  }

  const eczaneStats = {
    total_rows: eczaneInv?.length ?? 0,
    zero_qty: eczaneInv?.filter(r => r.quantity === 0).length ?? 0,
    nonzero_qty: eczaneInv?.filter(r => r.quantity > 0).length ?? 0,
    error: eczaneErr?.message ?? null,
  }

  return NextResponse.json({
    locations: locations ?? [],
    eczane_stats: eczaneStats,
    trigger_test: triggerTest,
    eczane_top10_nonzero: eczaneInv?.filter(r => r.quantity > 0).slice(0, 10) ?? [],
  })
}
