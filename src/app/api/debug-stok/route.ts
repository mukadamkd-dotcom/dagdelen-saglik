import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [
    { data: locations },
    { data: inventory },
  ] = await Promise.all([
    supabaseAdmin.from('locations').select('id, name').order('name'),
    supabaseAdmin.from('inventory').select('product_id, location_id, quantity').order('location_id'),
  ])

  const locMap: Record<string, string> = {}
  for (const l of locations ?? []) locMap[l.id] = l.name

  const rows = (inventory ?? []).map(r => ({
    product_id: r.product_id,
    location_id: r.location_id,
    location_name: locMap[r.location_id] ?? '⚠️ BİLİNMEYEN',
    quantity: r.quantity,
  }))

  return NextResponse.json({
    locations: locations ?? [],
    inventory_rows: rows,
    unknown_location_rows: rows.filter(r => r.location_name.startsWith('⚠️')),
  })
}
