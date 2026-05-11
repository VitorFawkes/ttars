
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugCards() {
    console.log('Fetching recent cards...')
    const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('origem', 'manual')
        .order('created_at', { ascending: false })
        .limit(5)

    if (error) {
        console.error('Error fetching cards:', error)
        return
    }

    console.log('Recent manual cards:', JSON.stringify(data, null, 2))

    // Also try to query the view directly to replicate the 500
    console.log('Attempting to query view_cards_acoes...')
    const { data: viewData, error: viewError } = await supabase
        .from('view_cards_acoes')
        .select('*')
        .eq('status_comercial', 'ganho')
        .limit(1)

    if (viewError) {
        console.error('Error querying view_cards_acoes:', viewError)
    } else {
        console.log('View query success (unexpected):', viewData)
    }
}

debugCards()
