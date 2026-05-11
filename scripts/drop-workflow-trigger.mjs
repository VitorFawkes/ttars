import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://szyrzxvlptqqheizyrxu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ N8N_API_KEY ou SUPABASE_SERVICE_ROLE_KEY não definidos');
  process.exit(1);
}
)

async function main() {
  console.log('Dropping orphaned workflow trigger on tarefas...')

  // Execute DDL via RPC
  const { data, error } = await supabase.rpc('exec_ddl', {
    ddl_statement: 'DROP TRIGGER IF EXISTS trg_workflow_task_outcome ON public.tarefas'
  })

  if (error) {
    console.error('exec_ddl error:', error)

    // Fallback: Try creating a function to do it
    console.log('\nTrying alternative approach...')
    const { error: err2 } = await supabase.rpc('exec_sql', {
      query: `
        DO $$
        BEGIN
          DROP TRIGGER IF EXISTS trg_workflow_task_outcome ON public.tarefas;
          DROP FUNCTION IF EXISTS trigger_workflow_on_task_outcome() CASCADE;
        END $$;
      `
    })

    if (err2) {
      console.error('Alternative failed:', err2)
    } else {
      console.log('Trigger dropped successfully via DO block!')
    }
  } else {
    console.log('Trigger dropped successfully!')
  }

  // Verify
  const { data: triggers } = await supabase.rpc('exec_sql', {
    query: "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.tarefas'::regclass AND tgname LIKE '%workflow%'"
  })

  console.log('\nRemaining workflow triggers on tarefas:', triggers)
}

main().catch(console.error)
