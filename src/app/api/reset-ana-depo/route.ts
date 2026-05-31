import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ANA_DEPO_UUID = 'b680b1a7-2e3b-4325-a5a6-3d7746fe0a71'

export async function POST() {
  const { error, count } = await supabaseAdmin
    .from('inventory')
    .update({ quantity: 0 })
    .eq('location_id', ANA_DEPO_UUID)
    .select('*', { count: 'exact', head: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated_rows: count })
}
