/**
 * Diagnóstico completo com Service Role Key
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szyrzxvlptqqheizyrxu.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function diagnose() {
  console.log('\n🔍 DIAGNÓSTICO COMPLETO (Service Role)\n');
  console.log('='.repeat(70));

  // 1. Inbound Triggers - A CAUSA DO PROBLEMA
  console.log('\n🎯 1. INBOUND TRIGGERS (Regras de Filtro)\n');

  const { data: triggers, error: triggerError } = await supabase
    .from('integration_inbound_triggers')
    .select('*')
    .eq('is_active', true);

  if (triggerError) {
    console.log('  Erro ao consultar:', triggerError.message);
  } else if (triggers && triggers.length > 0) {
    console.log(`  ⚠️  ${triggers.length} TRIGGER(S) ATIVO(S) - Isso está filtrando eventos!\n`);
    triggers.forEach((t, i) => {
      console.log(`  [${i + 1}] Pipeline: ${t.external_pipeline_id} | Stage: ${t.external_stage_id}`);
      console.log(`      Entidades: ${t.entity_types?.join(', ') || 'N/A'}`);
      console.log(`      Ação: ${t.action_type}`);
      console.log(`      Descrição: ${t.description || 'N/A'}`);
      console.log('');
    });

    // Verificar quais stages estão sendo ignorados
    console.log('  📊 ANÁLISE: Stages que NÃO têm trigger configurado:\n');

    const configuredStages = new Set(
      triggers
        .filter(t => t.external_pipeline_id === '8')
        .map(t => t.external_stage_id)
    );

    // Stages que estão sendo ignorados nos eventos
    const { data: ignoredEvents } = await supabase
      .from('integration_events')
      .select('payload')
      .eq('status', 'ignored')
      .ilike('processing_log', '%No trigger for Pipeline 8%')
      .limit(100);

    const ignoredStages = new Set<string>();
    ignoredEvents?.forEach(e => {
      const stage = e.payload?.stage || e.payload?.stage_id || e.payload?.['deal[stageid]'];
      if (stage) ignoredStages.add(String(stage));
    });

    console.log('  Stages do Pipeline 8 COM trigger:', Array.from(configuredStages).join(', ') || 'Nenhum');
    console.log('  Stages do Pipeline 8 sendo IGNORADOS:', Array.from(ignoredStages).join(', '));

  } else {
    console.log('  ✅ Nenhum trigger ativo - todos os eventos seriam permitidos');
  }

  // 2. Stage Mappings
  console.log('\n🗺️  2. STAGE MAPPINGS (Mapeamento AC → CRM)\n');

  const { data: stageMaps } = await supabase
    .from('integration_stage_map')
    .select('pipeline_id, external_stage_id, external_stage_name, internal_stage_id')
    .order('pipeline_id');

  if (stageMaps && stageMaps.length > 0) {
    console.log(`  Total: ${stageMaps.length} mapeamentos\n`);

    const byPipeline: Record<string, typeof stageMaps> = {};
    stageMaps.forEach(m => {
      if (!byPipeline[m.pipeline_id]) byPipeline[m.pipeline_id] = [];
      byPipeline[m.pipeline_id].push(m);
    });

    Object.entries(byPipeline).forEach(([pipeline, maps]) => {
      console.log(`  Pipeline ${pipeline}:`);
      maps.forEach(m => {
        console.log(`    - Stage ${m.external_stage_id} (${m.external_stage_name}) → ${m.internal_stage_id?.substring(0, 8)}...`);
      });
      console.log('');
    });
  } else {
    console.log('  ❌ Nenhum mapeamento de stage!');
  }

  // 3. Eventos recentes
  console.log('\n📊 3. CONTAGEM DE EVENTOS\n');

  const { data: statusCounts } = await supabase
    .from('integration_events')
    .select('status')
    .then(res => {
      const counts: Record<string, number> = {};
      res.data?.forEach(e => {
        counts[e.status] = (counts[e.status] || 0) + 1;
      });
      return { data: counts };
    });

  if (statusCounts) {
    Object.entries(statusCounts).forEach(([status, count]) => {
      const icon = status === 'processed' ? '✅' :
        status === 'pending' ? '⏳' :
          status === 'failed' ? '❌' :
            status === 'ignored' ? '🚫' : '❓';
      console.log(`  ${icon} ${status}: ${count}`);
    });
  }

  // 4. Eventos pendentes - amostra
  console.log('\n⏳ 4. AMOSTRA DE EVENTOS PENDENTES (últimos 5)\n');

  const { data: pendingEvents } = await supabase
    .from('integration_events')
    .select('id, external_id, event_type, payload, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5);

  if (pendingEvents && pendingEvents.length > 0) {
    pendingEvents.forEach((e, i) => {
      const stage = e.payload?.stage || e.payload?.stage_id || e.payload?.['deal[stageid]'] || '?';
      const pipeline = e.payload?.pipeline || e.payload?.pipeline_id || e.payload?.['deal[pipelineid]'] || '?';
      console.log(`  [${i + 1}] Deal ${e.external_id} | Pipeline ${pipeline} | Stage ${stage}`);
    });
  } else {
    console.log('  Nenhum evento pendente');
  }

  // 5. Eventos com erro - amostra
  console.log('\n❌ 5. AMOSTRA DE EVENTOS COM FALHA (últimos 5)\n');

  const { data: failedEvents } = await supabase
    .from('integration_events')
    .select('id, external_id, processing_log, created_at')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(5);

  if (failedEvents && failedEvents.length > 0) {
    failedEvents.forEach((e, i) => {
      console.log(`  [${i + 1}] Deal ${e.external_id}`);
      console.log(`      Erro: ${e.processing_log}`);
      console.log('');
    });
  } else {
    console.log('  Nenhum evento com falha');
  }

  // 6. Resumo e Recomendação
  console.log('\n' + '='.repeat(70));
  console.log('📋 RESUMO E RECOMENDAÇÃO\n');

  if (triggers && triggers.length > 0) {
    console.log('  🔴 PROBLEMA IDENTIFICADO: Inbound Triggers estão filtrando eventos\n');
    console.log('  Os eventos estão sendo IGNORADOS porque há triggers configurados,');
    console.log('  mas não há trigger para todas as combinações de Pipeline + Stage.\n');
    console.log('  SOLUÇÕES:\n');
    console.log('  Opção A) Desativar triggers para permitir TODOS os eventos:');
    console.log('           UPDATE integration_inbound_triggers SET is_active = false;\n');
    console.log('  Opção B) Adicionar triggers para os stages faltantes (153, 59, 43, etc)');
    console.log('           na aba "Gatilhos" do painel de integrações.\n');
  }

  console.log('='.repeat(70) + '\n');
}

diagnose().catch(console.error);
