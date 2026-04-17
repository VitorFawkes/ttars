const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env manually
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const url = envVars.VITE_SUPABASE_URL;
const key = envVars.VITE_SUPABASE_ANON_KEY;

console.log('URL:', url);
console.log('Key exists:', !!key);

if (!url || !key) {
  console.log('Missing env vars');
  process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
  // Buscar stages primeiro
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, nome');

  const stageMap = new Map(stages?.map(s => [s.id, s.nome]));
  console.log('\n=== Stages disponíveis ===');
  stages?.forEach(s => console.log(`${s.id.substring(0,8)} -> ${s.nome}`));

  const { data, error } = await supabase
    .from('cards')
    .select('id, titulo, status_comercial, produto, created_at, valor_final, valor_estimado, deleted_at, briefing_inicial, data_viagem_inicio, data_viagem_fim, pipeline_stage_id, taxa_data_status')
    .limit(100);

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Filtrar os importados
  const importados = data?.filter(c => c.briefing_inicial?.importado_em);
  console.log('\n=== Cards IMPORTADOS ===');
  console.log('Total:', importados?.length);
  importados?.forEach(c => {
    const stageName = c.pipeline_stage_id ? stageMap.get(c.pipeline_stage_id) : 'Unknown';
    console.log({
      titulo: c.titulo?.substring(0, 40),
      status_comercial: c.status_comercial,
      stage: stageName,
      stage_id: c.pipeline_stage_id?.substring(0, 8),
      produto: c.produto,
      created_at: c.created_at?.substring(0,10),
      data_viagem_inicio: c.data_viagem_inicio?.substring(0, 10),
      taxa_data_status: c.taxa_data_status,
      valor_final: c.valor_final,
      deleted: !!c.deleted_at
    });
  });

  // Simular transformação para Analytics
  console.log('\n=== Simulação Analytics (leads e trips) ===');
  const analyticsLeads = importados?.filter(c => !c.deleted_at).map(c => {
    const stageName = c.pipeline_stage_id ? stageMap.get(c.pipeline_stage_id) : 'Unknown';

    let status = 'open';
    if (c.status_comercial === 'ganho') status = 'won';
    else if (c.status_comercial === 'perdido' || c.deleted_at) status = 'lost';

    return {
      id: c.id,
      name: c.titulo,
      status: status,
      stage: stageName,
      createdAt: new Date(c.created_at),
      wonAt: c.taxa_data_status ? new Date(c.taxa_data_status) : undefined,
      value: c.valor_final || c.valor_estimado || 0,
      product: c.produto,
      tripStartDate: c.data_viagem_inicio ? new Date(c.data_viagem_inicio) : undefined
    };
  });

  console.log('Leads (não deletados):', analyticsLeads?.length);
  analyticsLeads?.forEach(l => {
    console.log(`  - ${l.name?.substring(0,30)}: status=${l.status}, stage=${l.stage}, createdAt=${l.createdAt?.toISOString().substring(0,10)}, wonAt=${l.wonAt?.toISOString().substring(0,10) || 'undefined'}, tripStart=${l.tripStartDate?.toISOString().substring(0,10) || 'undefined'}`);
  });

  // Trips (apenas leads com status 'won')
  const trips = analyticsLeads?.filter(l => l.status === 'won').map(l => ({
    id: l.id,
    leadId: l.id,
    value: l.value,
    startDate: l.tripStartDate
  }));

  console.log('\nTrips criadas:', trips?.length);
  trips?.forEach(t => {
    console.log(`  - value=${t.value}, startDate=${t.startDate?.toISOString().substring(0,10) || 'undefined'}`);
  });

  // Verificar se passam no filtro de data
  const dateRange = { start: new Date(2020, 0, 1), end: new Date() };
  console.log('\n=== Verificação de filtros (período: 2020-01-01 até hoje) ===');

  analyticsLeads?.forEach(lead => {
    const passCreatedAt = lead.createdAt >= dateRange.start && lead.createdAt <= dateRange.end;
    console.log(`Lead "${lead.name?.substring(0, 20)}": createdAt=${lead.createdAt?.toISOString().substring(0, 10)} -> passa filtro: ${passCreatedAt}`);
  });

  // Verificar o filtro de trips (mode = activity)
  console.log('\n=== Verificação de trips (mode=activity) ===');
  trips?.forEach(t => {
    const lead = analyticsLeads?.find(l => l.id === t.leadId);
    const dateToCheck = lead?.wonAt || t.startDate || new Date(0);
    const passFilter = dateToCheck >= dateRange.start && dateToCheck <= dateRange.end;
    console.log(`Trip ${t.leadId.substring(0,8)}: dateToCheck=${dateToCheck?.toISOString().substring(0,10)} (wonAt=${lead?.wonAt?.toISOString().substring(0,10) || 'undefined'}, startDate=${t.startDate?.toISOString().substring(0,10) || 'undefined'}) -> passa filtro: ${passFilter}`);
  });
}
check();
