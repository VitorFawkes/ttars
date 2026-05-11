
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)


async function verifyFixes() {
    console.log('\n--- Verifying Proposals Query Fix ---')
    // FIXED: Removed total_value
    const { data: pData, error: pError } = await supabase
        .from('proposals')
        .select(`
            id,
            status,
            created_at,
            card:cards!proposals_card_id_fkey(titulo)
        `)
        .in('status', ['sent', 'viewed', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(5)

    if (pError) {
        console.error('Proposals Query FAILED:', JSON.stringify(pError, null, 2))
    } else {
        console.log('Proposals Query SUCCESS. Rows:', pData?.length)
    }

    console.log('\n--- Verifying View Cards Acoes Query Fix ---')
    // FIXED: Removed archived_at check
    const { data: vData, error: vError } = await supabase
        .from('view_cards_acoes')
        .select('*')
        .eq('produto', 'TRIPS')
        // .is('archived_at', null) // REMOVED
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(5)

    if (vError) {
        console.error('View Cards Acoes Query FAILED:', JSON.stringify(vError, null, 2))
    } else {
        console.log('View Cards Acoes Query SUCCESS. Rows:', vData?.length)
    }
}

async function main() {
    await verifyFixes()
}

main()
