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

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.VITE_SUPABASE_ANON_KEY);

async function simulate() {
  // 1. Fetch data like useAnalyticsData
  const { data: profiles } = await supabase.from('profiles').select('id, nome, avatar_url');
  const { data: stages } = await supabase.from('pipeline_stages').select('id, nome');
  const { data: cards } = await supabase.from('cards').select('*');

  const stageMap = new Map(stages?.map(s => [s.id, s.nome]));

  // Transform to leads
  const leads = (cards || []).map(card => {
    const stageName = card.pipeline_stage_id ? stageMap.get(card.pipeline_stage_id) || 'Unknown' : 'Unknown';
    let status = 'open';
    if (card.status_comercial === 'ganho') status = 'won';
    else if (card.status_comercial === 'perdido' || card.deleted_at) status = 'lost';

    return {
      id: card.id,
      name: card.titulo,
      status: status,
      stage: stageName,
      createdAt: new Date(card.created_at || Date.now()),
      wonAt: card.taxa_data_status ? new Date(card.taxa_data_status) : undefined,
      value: card.valor_final || card.valor_estimado || 0,
      product: card.produto,
      _isImported: !!(card.briefing_inicial?.importado_em),
      _data_viagem_inicio: card.data_viagem_inicio
    };
  });

  // Transform to trips
  const trips = leads
    .filter(l => l.status === 'won')
    .map(l => {
      const card = cards?.find(c => c.id === l.id);
      return {
        id: l.id,
        leadId: l.id,
        value: l.value,
        startDate: card?.data_viagem_inicio ? new Date(card.data_viagem_inicio) : undefined,
        _isImported: l._isImported
      };
    });

  console.log('=== DADOS BRUTOS ===');
  console.log('Total leads:', leads.length);
  console.log('Total leads imported:', leads.filter(l => l._isImported).length);
  console.log('Total leads won:', leads.filter(l => l.status === 'won').length);
  console.log('Total trips:', trips.length);
  console.log('Total trips imported:', trips.filter(t => t._isImported).length);

  // 2. Apply Context filter (like AnalyticsContext)
  const dateRange = { start: new Date(2020, 0, 1), end: new Date() };

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  const isWithinInterval = (date, interval) => {
    return date >= interval.start && date <= interval.end;
  };

  let filteredLeads = leads.filter(lead => {
    try {
      return isWithinInterval(lead.createdAt, {
        start: startOfDay(dateRange.start),
        end: endOfDay(dateRange.end)
      });
    } catch {
      return true;
    }
  });

  const filteredLeadIds = new Set(filteredLeads.map(l => l.id));
  const filteredTrips = trips.filter(trip => filteredLeadIds.has(trip.leadId));

  console.log('\n=== APÓS FILTRO DO CONTEXT ===');
  console.log('Filtered leads:', filteredLeads.length);
  console.log('Filtered leads imported:', filteredLeads.filter(l => l._isImported).length);
  console.log('Filtered trips:', filteredTrips.length);
  console.log('Filtered trips imported:', filteredTrips.filter(t => t._isImported).length);

  // Show imported leads detail
  console.log('\nImported leads in filteredLeads:');
  filteredLeads.filter(l => l._isImported).forEach(l => {
    console.log(`  - ${l.name?.substring(0,30)}: status=${l.status}, stage=${l.stage}, createdAt=${l.createdAt.toISOString().substring(0,10)}`);
  });

  // 3. Apply metrics filter (like useOverviewMetrics)
  const mode = 'activity';
  const metricsFilteredLeads = filteredLeads.filter(lead => {
    const dateToCheck = mode === 'cohort' ? lead.createdAt : (lead.contactedAt || lead.createdAt);
    return isWithinInterval(dateToCheck, { start: dateRange.start, end: dateRange.end });
  });

  const metricsFilteredTrips = filteredTrips.filter(trip => {
    const lead = filteredLeads.find(l => l.id === trip.leadId);
    if (!lead) return false;
    const dateToCheck = mode === 'cohort' ? lead.createdAt : (lead.wonAt || trip.startDate || new Date(0));
    return isWithinInterval(dateToCheck, { start: dateRange.start, end: dateRange.end });
  });

  console.log('\n=== APÓS FILTRO DE MÉTRICAS ===');
  console.log('Metrics filtered leads:', metricsFilteredLeads.length);
  console.log('Metrics filtered trips:', metricsFilteredTrips.length);
  console.log('Metrics filtered trips imported:', metricsFilteredTrips.filter(t => t._isImported).length);

  // 4. Calculate confirmedTrips
  const stageNames = [
    'Novo Lead', 'Tentativa de Contato', 'Conectado', 'Apresentação Feita',
    'Taxa Paga / Cliente Elegível', 'Aguardando Briefing', 'Oportunidade',
    'Briefing Realizado', 'Proposta em Construção', 'Proposta Enviada',
    'Ajustes & Refinamentos', 'Viagem Aprovada', 'Reservas em Andamento',
    'Pagamento & Documentação', 'Viagem Confirmada (Ganho)', 'App & Conteúdo em Montagem',
    'Pré-embarque', 'Em Viagem', 'Viagem Concluída', 'Pós-viagem & Reativação',
    'Fechado - Perdido'
  ];

  const getStageIndex = (stage) => stageNames.indexOf(stage);
  const targetIndex = getStageIndex('Viagem Confirmada (Ganho)');

  const confirmedTrips = metricsFilteredTrips.filter(t => {
    const lead = filteredLeads.find(l => l.id === t.leadId);
    if (!lead) return false;
    const leadIndex = getStageIndex(lead.stage);
    return leadIndex >= targetIndex;
  });

  console.log('\n=== VIAGENS CONFIRMADAS ===');
  console.log('Target stage index (Viagem Confirmada):', targetIndex);
  console.log('Confirmed trips:', confirmedTrips.length);
  console.log('Confirmed trips value:', confirmedTrips.reduce((a, t) => a + t.value, 0));

  // Detail of imported trips
  console.log('\nDetail of imported trips in confirmedTrips:');
  confirmedTrips.filter(t => t._isImported).forEach(t => {
    const lead = filteredLeads.find(l => l.id === t.leadId);
    console.log(`  - value=${t.value}, startDate=${t.startDate?.toISOString().substring(0,10)}, lead.stage=${lead?.stage}, stageIdx=${getStageIndex(lead?.stage)}`);
  });
}

simulate().catch(console.error);
