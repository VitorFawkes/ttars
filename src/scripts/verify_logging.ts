
import { createClient } from '@supabase/supabase-js'

// Hardcoded credentials from seed_activities.ts for convenience in this script
// Credentials should be loaded from environment
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://szyrzxvlptqqheizyrxu.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || ''

if (!supabaseKey) {
    console.error('Error: SUPABASE_ANON_KEY or VITE_SUPABASE_KEY is required.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function verifyLogging() {
    console.log('Starting Activity Logging Verification...')

    // 1. Create a Test Card
    console.log('\n1. Creating Test Card...')
    const { data: card, error: cardError } = await supabase
        .from('cards')
        .insert({
            titulo: 'VERIFICATION_TEST_CARD',
            pipeline_id: '00000000-0000-0000-0000-000000000000', // Assuming a valid ID or nullable, checking schema might be safer but let's try
            // We need valid IDs for pipeline/stage usually. Let's fetch one first.
        })
        .select()
        .single()

    // If simple insert fails, we might need valid FKs. Let's fetch a stage first.
    let validStageId, validPipelineId;
    if (cardError) {
        console.log('Simple insert failed, fetching valid pipeline/stage...')
        const { data: stages, error: stageError } = await supabase.from('pipeline_stages').select('id, pipeline_id').limit(1)

        if (stageError) {
            console.error('Error fetching stages:', stageError)
            return
        }

        if (stages && stages.length > 0) {
            validStageId = stages[0].id
            validPipelineId = stages[0].pipeline_id
            console.log(`Found stage: ${validStageId}, pipeline: ${validPipelineId}`)

            const { data: cardRetry, error: retryError } = await supabase
                .from('cards')
                .insert({
                    titulo: 'VERIFICATION_TEST_CARD',
                    pipeline_id: validPipelineId,
                    pipeline_stage_id: validStageId
                })
                .select()
                .single()

            if (retryError) {
                console.error('Failed to create test card:', retryError)
                return
            }
            console.log('Test Card Created:', cardRetry.id)
            await performChecks(cardRetry.id)
        } else {
            console.error('Could not find any pipeline stages to create a card. Table might be empty.')
            return
        }
    } else {
        console.log('Test Card Created:', card.id)
        await performChecks(card.id)
    }
}

async function performChecks(cardId: string) {
    // Helper to check log
    const checkLog = async (actionType: string) => {
        // Give DB a moment to process trigger
        await new Promise(r => setTimeout(r, 1000))

        const { data: logs, error } = await supabase
            .from('activities')
            .select('*')
            .eq('card_id', cardId)
            .eq('tipo', actionType)
            .order('created_at', { ascending: false })
            .limit(1)

        if (error) {
            console.error(`[FAIL] Error checking log for ${actionType}:`, error)
            return false
        }

        if (logs && logs.length > 0) {
            console.log(`[PASS] Log found for ${actionType}: "${logs[0].descricao}"`)
            return true
        } else {
            console.error(`[FAIL] No log found for ${actionType}`)
            return false
        }
    }

    // Check 1: Card Creation Log
    await checkLog('card_created')

    // 2. Create a Task
    console.log('\n2. Creating Task...')
    const { error: taskError } = await supabase
        .from('tarefas')
        .insert({
            card_id: cardId,
            titulo: 'Test Task',
            prioridade: 'media'
        })
        .select()
        .single()

    if (!taskError) {
        await checkLog('task_created')
    } else {
        console.error('Failed to create task:', taskError)
    }

    // 3. Add a Note
    console.log('\n3. Adding Note...')
    const { error: noteError } = await supabase
        .from('notas')
        .insert({
            card_id: cardId,
            conteudo: 'Test Note Content'
        })

    if (!noteError) {
        await checkLog('note_created')
    } else {
        console.error('Failed to create note:', noteError)
    }

    // 4. Update Card Title (should trigger update log if configured, or maybe stage change)
    // Let's try updating the title
    console.log('\n4. Updating Card Title...')
    await supabase
        .from('cards')
        .update({ titulo: 'VERIFICATION_TEST_CARD_UPDATED' })
        .eq('id', cardId)

    // Note: The migration I saw earlier didn't seem to have a generic "card_updated" trigger for title changes, 
    // only specific ones or maybe I missed it. Let's see if it logs.
    // Actually, I saw `log_card_created` but didn't explicitly see a generic `log_card_updated` in the snippet I read 
    // (I saw `audit_cards_changes` for `audit_logs`, but `activities` triggers were specific).
    // Let's check `audit_logs` for this one too if `activities` fails.

    // Wait and check
    await new Promise(r => setTimeout(r, 1000))
    const { data: activityLogs } = await supabase
        .from('activities')
        .select('*')
        .eq('card_id', cardId)
        .order('created_at', { ascending: false })
        .limit(1)

    if (activityLogs && activityLogs.length > 0 && activityLogs[0].tipo === 'card_updated') {
        console.log(`[PASS] Log found for card update: "${activityLogs[0].descricao}"`)
    } else {
        console.log(`[INFO] No 'activities' log for title update (this might be expected if only specific changes are logged to activities).`)
    }

    // Cleanup
    console.log('\nCleaning up...')
    await supabase.from('cards').delete().eq('id', cardId)
    console.log('Test card deleted.')
}

verifyLogging()
