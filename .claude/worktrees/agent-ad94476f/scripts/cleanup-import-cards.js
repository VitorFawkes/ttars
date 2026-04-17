
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://szyrzxvlptqqheizyrxu.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey)

async function cleanup() {
    console.log('Cleaning up problematic cards...')

    // Find cards created in the last 24 hours AND having the import marker
    const timeWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Note: Searching inside JSONB column efficiently requires specific operators.
    // We'll trust the 'origem'='manual' + check JS side or use 'cs' (contains) filter if possible.
    // Supabase JS allows .contains('briefing_inicial', { importado_em: ... }) but importado_em is dynamic date.
    // Easier: Fetch wider range of 'manual' cards and filter in JS to be 100% safe.

    const { data: cards, error } = await supabase
        .from('cards')
        .select('id, titulo, created_at, briefing_inicial')
        .eq('origem', 'manual')
        .gt('created_at', timeWindow)
        .limit(2000)

    if (error) {
        console.error('Error finding cards:', error)
        return
    }

    // Safe filter in JS
    const cardsToDelete = cards.filter(c => {
        // Check if briefing_inicial has 'importado_em'
        return c.briefing_inicial && typeof c.briefing_inicial === 'object' && 'importado_em' in c.briefing_inicial
    })

    console.log(`Found ${cards.length} recent manual cards.`)
    console.log(`Verified ${cardsToDelete.length} imported cards to delete (checking 'importado_em' key).`)

    if (cardsToDelete.length === 0) {
        console.log('No imported cards found to delete.')
        return
    }

    for (const card of cardsToDelete) {
        console.log(`Deleting card: ${card.titulo} (${card.id})`)
        const { error: delError } = await supabase
            .from('cards')
            .delete()
            .eq('id', card.id)

        if (delError) console.error(`Failed to delete ${card.id}:`, delError)
        else console.log(`Deleted ${card.id}`)
    }

    console.log('Cleanup complete.')
}

cleanup()
