/**
 * Debug parte 2 - verificar credenciais e tabela integrations
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
  console.log('\n🔍 DEBUG - VERIFICAÇÃO DETALHADA\n');

  // 1. Verificar credenciais AC
  console.log('📋 1. CREDENCIAIS AC\n');
  const { data: credentials } = await supabase
    .from('integration_settings')
    .select('key, value')
    .in('key', ['ACTIVECAMPAIGN_API_URL', 'ACTIVECAMPAIGN_API_KEY']);

  const apiUrl = credentials?.find(c => c.key === 'ACTIVECAMPAIGN_API_URL')?.value;
  const apiKey = credentials?.find(c => c.key === 'ACTIVECAMPAIGN_API_KEY')?.value;

  console.log('  API URL:', apiUrl ? `${apiUrl.substring(0, 30)}...` : '❌ NÃO CONFIGURADA');
  console.log('  API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : '❌ NÃO CONFIGURADA');

  // 2. Verificar tabela integrations
  console.log('\n📋 2. TABELA INTEGRATIONS\n');
  const { data: allIntegrations, error } = await supabase
    .from('integrations')
    .select('*');

  if (error) {
    console.log('  Erro ao consultar:', error.message);
  } else if (allIntegrations && allIntegrations.length > 0) {
    console.log(`  ${allIntegrations.length} integração(ões) encontrada(s):`);
    allIntegrations.forEach(i => {
      console.log(`    - ID: ${i.id}`);
      console.log(`      Provider: ${i.provider}`);
      console.log(`      Ativa: ${i.is_active}`);
      console.log('');
    });
  } else {
    console.log('  ⚠️ Tabela integrations está VAZIA!');
    console.log('  A função integration-sync-deals precisa de um registro aqui.');
  }

  // 3. Verificar eventos mais antigos
  console.log('\n📋 3. TODOS OS EVENTOS (histórico)\n');
  const { data: allEvents, count } = await supabase
    .from('integration_events')
    .select('status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`  Total de eventos no banco: ${count || 0}`);
  if (allEvents && allEvents.length > 0) {
    console.log('  Últimos 5 eventos:');
    allEvents.forEach(e => {
      console.log(`    - ${e.status} em ${new Date(e.created_at).toLocaleString('pt-BR')}`);
    });
  }

  // 4. Verificar stage mappings
  console.log('\n📋 4. MAPEAMENTO DE STAGES\n');
  const { data: stageMaps, count: stageCount } = await supabase
    .from('integration_stage_map')
    .select('*', { count: 'exact' })
    .limit(5);

  console.log(`  Total de mapeamentos: ${stageCount || 0}`);
  if (stageMaps && stageMaps.length > 0) {
    console.log('  Exemplos:');
    stageMaps.forEach(m => {
      console.log(`    - Pipeline ${m.pipeline_id} / Stage AC ${m.external_stage_id} -> Stage CRM ${m.internal_stage_id?.substring(0, 8)}...`);
    });
  } else {
    console.log('  ⚠️ Nenhum mapeamento de stage configurado!');
    console.log('  Isso vai causar erro "Unmapped Stage" ao processar eventos.');
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 DIAGNÓSTICO FINAL\n');

  const problems: string[] = [];
  const solutions: string[] = [];

  if (!apiUrl || !apiKey) {
    problems.push('Credenciais do ActiveCampaign não configuradas');
    solutions.push('Configure API URL e API Key em Admin > Integrações');
  }

  if (!allIntegrations || allIntegrations.length === 0 || !allIntegrations.find(i => i.provider === 'active_campaign')) {
    problems.push('Registro de integração AC não existe na tabela "integrations"');
    solutions.push('Precisa criar um registro na tabela integrations com provider="active_campaign"');
  }

  if (!stageMaps || (stageCount || 0) === 0) {
    problems.push('Nenhum mapeamento de stages configurado');
    solutions.push('Configure mapeamentos em Admin > Integrações > Mapeamento de Stages');
  }

  if (problems.length === 0) {
    console.log('  ✅ Configuração parece OK!\n');
    console.log('  Se ainda não funciona, verifique:');
    console.log('    1. O owner_id está correto (ID numérico do usuário no AC)');
    console.log('    2. O pipeline_id está correto (8 = Trips, 6 = Wedding)');
    console.log('    3. Os logs do edge function no Supabase Dashboard');
  } else {
    console.log('  ❌ PROBLEMAS ENCONTRADOS:\n');
    problems.forEach((p, i) => console.log(`    ${i + 1}. ${p}`));
    console.log('\n  💡 SOLUÇÕES:\n');
    solutions.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

debug().catch(console.error);
