import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://szyrzxvlptqqheizyrxu.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupDuplicates() {
  console.log('🔍 Buscando tarefas duplicadas...\n');

  // 1. Buscar IDs das duplicatas (manter a mais antiga, remover as outras)
  const { data: duplicates, error: queryError } = await supabase.rpc('exec_sql', {
    query: `
      WITH duplicates AS (
        SELECT
          id,
          card_id,
          tipo,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY card_id, tipo ORDER BY created_at ASC) as rn
        FROM public.tarefas
        WHERE concluida = false
        AND deleted_at IS NULL
      )
      SELECT id, card_id, tipo, created_at FROM duplicates WHERE rn > 1
    `
  });

  if (queryError) {
    console.error('❌ Erro ao buscar duplicatas:', queryError.message);
    return;
  }

  console.log(`📊 Encontradas ${duplicates.length} tarefas duplicadas\n`);

  if (duplicates.length === 0) {
    console.log('✅ Nenhuma duplicata encontrada!');
    return;
  }

  // 2. Agrupar por card para mostrar resumo
  const byCard = {};
  for (const d of duplicates) {
    const key = `${d.card_id}|${d.tipo}`;
    if (!byCard[key]) byCard[key] = [];
    byCard[key].push(d.id);
  }
  console.log(`📋 Cards afetados: ${Object.keys(byCard).length}\n`);

  // 3. Soft-delete cada duplicata
  const idsToDelete = duplicates.map(d => d.id);
  console.log(`🗑️  Removendo ${idsToDelete.length} tarefas duplicadas...\n`);

  // Fazer em batches de 100
  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);

    const { error: updateError } = await supabase
      .from('tarefas')
      .update({
        deleted_at: new Date().toISOString(),
        metadata: { deleted_reason: 'duplicate_cleanup_20260201' }
      })
      .in('id', batch);

    if (updateError) {
      console.error(`❌ Erro no batch ${i / batchSize + 1}:`, updateError.message);
    } else {
      deleted += batch.length;
      console.log(`  ✓ Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} tarefas removidas`);
    }
  }

  console.log(`\n✅ Cleanup concluído! ${deleted} tarefas removidas.`);

  // 4. Verificar se ainda há duplicatas
  const { data: remaining } = await supabase.rpc('exec_sql', {
    query: `
      SELECT COUNT(*) as total FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY card_id, tipo ORDER BY created_at ASC) as rn
        FROM public.tarefas
        WHERE concluida = false AND deleted_at IS NULL
      ) d WHERE d.rn > 1
    `
  });

  console.log(`\n📊 Duplicatas restantes: ${remaining?.[0]?.total || 0}`);
}

cleanupDuplicates().catch(console.error);
