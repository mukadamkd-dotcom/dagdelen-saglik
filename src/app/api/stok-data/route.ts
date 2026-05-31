import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [
    { data: locations, error: e1 },
    { data: products, error: e2 },
    { data: inventory, error: e3 },
    { data: miadData, error: e4 },
  ] = await Promise.all([
    supabaseAdmin.from('locations').select('id, name').order('name'),
    supabaseAdmin.from('products').select('id, name, barcode, category, unit, image_url').eq('is_active', true).order('name'),
    supabaseAdmin.from('inventory').select('product_id, location_id, quantity, min_stock_alert').limit(10000),
    supabaseAdmin.from('stock_movements').select('product_id, to_location_id, notes, quantity, created_at').like('notes', 'SAYIM_MIAD:%').order('created_at', { ascending: false }).limit(2000),
  ])

  if (e1 || e2 || e3 || e4) {
    return NextResponse.json(
      { error: [e1?.message, e2?.message, e3?.message, e4?.message].filter(Boolean).join(' | ') },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { locations: locations ?? [], products: products ?? [], inventory: inventory ?? [], miadData: miadData ?? [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
