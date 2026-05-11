import pg from 'pg'

const { Client } = pg

async function main() {
  console.log('Connecting to Supabase database...')

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })

  if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
    console.error('❌ DATABASE_URL or DB_PASSWORD is required')
    process.exit(1)
  }

  // Fallback to individual configs if connectionString is not provided
  if (!process.env.DATABASE_URL) {
    client.options.host = process.env.DB_HOST || 'db.szyrzxvlptqqheizyrxu.supabase.co'
    client.options.port = parseInt(process.env.DB_PORT || '5432')
    client.options.database = process.env.DB_NAME || 'postgres'
    client.options.user = process.env.DB_USER || 'postgres'
    client.options.password = process.env.DB_PASSWORD
  }

  try {
    await client.connect()
    console.log('Connected!')

    // Step 1: Check current triggers
    console.log('\nStep 1: Checking current workflow triggers on tarefas...')
    const beforeResult = await client.query(`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'public.tarefas'::regclass
      AND tgname LIKE '%workflow%'
    `)
    console.log('Found triggers:', beforeResult.rows.map(r => r.tgname))

    // Step 2: Drop trigger
    console.log('\nStep 2: Dropping trigger trg_workflow_task_outcome...')
    await client.query('DROP TRIGGER IF EXISTS trg_workflow_task_outcome ON public.tarefas')
    console.log('Trigger dropped!')

    // Step 3: Drop trigger (alternative name)
    console.log('\nStep 3: Dropping trigger trg_workflow_on_task_outcome (if exists)...')
    await client.query('DROP TRIGGER IF EXISTS trg_workflow_on_task_outcome ON public.tarefas')
    console.log('Done!')

    // Step 4: Drop function
    console.log('\nStep 4: Dropping function trigger_workflow_on_task_outcome...')
    await client.query('DROP FUNCTION IF EXISTS trigger_workflow_on_task_outcome() CASCADE')
    console.log('Function dropped!')

    // Verify
    console.log('\nStep 5: Verifying...')
    const afterResult = await client.query(`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'public.tarefas'::regclass
      AND tgname LIKE '%workflow%'
    `)
    console.log('Remaining workflow triggers:', afterResult.rows.map(r => r.tgname))

    if (afterResult.rows.length === 0) {
      console.log('\n✅ SUCCESS: All workflow triggers removed from tarefas table!')
    } else {
      console.log('\n⚠️ Some workflow triggers still exist')
    }

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await client.end()
  }
}

main()
