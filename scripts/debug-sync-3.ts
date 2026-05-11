/**
 * Debug completo - verificar todas as tabelas de mapeamento
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szyrzxvlptqqheizyrxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_ANON_KEY or VITE_SUPABASE_KEY is required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function debug() {
  console.log('\n🔍 VERIFICAÇÃO COMPLETA DE MAPEAMENTOS\n');
  console.log('='.repeat(60));

  // Listar todas as tabelas que começam com integration_
  const tables = [
    'integrations',
    'integration_settings',
    'integration_stage_map',
    'integration_user_map',
    'integration_field_map',
    'integration_catalog',
    'integration_events',
    'integration_inbound_triggers'
  ];

  for (const table of tables) {
    const { data, count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact' })
      .limit(3);

    console.log(`\n📋 ${table}`);

    if (error) {
      console.log(`   ❌ Erro: ${error.message}`);
      continue;
    }

    console.log(`   Total: ${count || 0} registros`);

    if (data && data.length > 0) {
      console.log('   Amostra:');
      data.forEach((row, i) => {
        // Mostrar campos principais dependendo da tabela
        if (table === 'integrations') {
          console.log(`     ${i + 1}. provider=${row.provider}, is_active=${row.is_active}, id=${row.id}`);
        } else if (table === 'integration_stage_map') {
          console.log(`     ${i + 1}. pipeline=${row.pipeline_id}, ext_stage=${row.external_stage_id} -> int_stage=${row.internal_stage_id?.substring(0, 8)}...`);
        } else if (table === 'integration_user_map') {
          console.log(`     ${i + 1}. ext_user=${row.external_user_id} -> int_user=${row.internal_user_id?.substring(0, 8)}...`);
        } else if (table === 'integration_field_map') {
          console.log(`     ${i + 1}. ext_field=${row.external_field_id} -> local=${row.local_field_key}`);
        } else if (table === 'integration_catalog') {
          console.log(`     ${i + 1}. type=${row.entity_type}, ext_id=${row.external_id}, name=${row.external_name?.substring(0, 30)}`);
        } else if (table === 'integration_settings') {
          const val = row.value?.length > 30 ? row.value.substring(0, 30) + '...' : row.value;
          console.log(`     ${i + 1}. ${row.key} = ${val}`);
        } else if (table === 'integration_events') {
          console.log(`     ${i + 1}. status=${row.status}, type=${row.event_type}, ext_id=${row.external_id}`);
        } else {
          console.log(`     ${i + 1}.`, JSON.stringify(row).substring(0, 100));
        }
      });
    }
  }

  // Verificar pipelines e stages do CRM
  console.log('\n' + '='.repeat(60));
  console.log('\n🏗️ PIPELINES E STAGES DO CRM\n');

  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('id, nome, produto');

  if (pipelines) {
    for (const p of pipelines) {
      console.log(`\n  Pipeline: ${p.nome} (${p.produto})`);
      console.log(`  ID: ${p.id}`);

      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id, nome, ordem')
        .eq('pipeline_id', p.id)
        .order('ordem');

      if (stages) {
        stages.forEach(s => {
          console.log(`    - ${s.nome} (ordem: ${s.ordem}, id: ${s.id.substring(0, 8)}...)`);
        });
      }
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

debug().catch(console.error);
