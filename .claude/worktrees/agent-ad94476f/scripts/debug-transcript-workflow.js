#!/usr/bin/env node
/**
 * Script de diagnóstico para o workflow de transcrição
 * Testa cada etapa e mostra informações detalhadas
 */

const WEBHOOK_URL = 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/transcript-process';
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';
// Service Role Key (read from secrets)
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

// IDs de teste - usando reunião existente com transcrição
const TEST_CARD_ID = process.argv[2] || '9e5e2ec6-c7af-4d95-a915-4d0276921ff7';
const TEST_MEETING_ID = process.argv[3] || 'd7914eb6-2102-4afb-8097-bda967826e74';

// Transcrição de teste simplificada e clara
const TEST_TRANSCRIPTION = `
[00:00:15] Consultor Welcome Trips: Olá, bom dia! Eu sou da Welcome Trips. Me conta sobre a viagem que você está planejando.

[00:00:30] Cliente Maria: Oi! Então, eu e meu marido João queremos fazer nossa lua de mel. Casamos agora em janeiro e queremos viajar em setembro.

[00:00:50] Consultor Welcome Trips: Que maravilha! E vocês já têm algum destino em mente?

[00:01:05] Cliente Maria: A gente sonha muito com a Itália. Queremos conhecer Roma, Florença e a Costa Amalfitana. Talvez passar por Veneza também.

[00:01:25] Consultor Welcome Trips: Destinos lindos! E quantos dias vocês estão pensando?

[00:01:35] Cliente Maria: Uns 15 dias, mais ou menos.

[00:01:45] Consultor Welcome Trips: E em relação ao investimento, vocês já têm uma ideia de orçamento?

[00:02:00] Cliente Maria: A gente juntou 50 mil reais para essa viagem. Queremos fazer algo especial, é nossa lua de mel!

[00:02:15] Consultor Welcome Trips: Ótimo! O que é mais importante para vocês nessa viagem?

[00:02:30] Cliente Maria: A experiência gastronômica é super importante. A gente ama comida italiana! E queremos hotéis bonitos com boa localização.

[00:02:50] Consultor Welcome Trips: Tem alguma preocupação sobre a viagem?

[00:03:05] Cliente Maria: Meu marido tem um pouco de medo de avião. E eu tenho alergia a frutos do mar.

[00:03:20] Consultor Welcome Trips: Vocês costumam viajar internacionalmente?

[00:03:30] Cliente Maria: Viajamos umas 2 vezes por ano. Já fomos para Portugal e Espanha.

[00:03:45] Consultor Welcome Trips: E costumam usar agência de viagens?

[00:03:55] Cliente Maria: Normalmente organizamos por conta própria, mas dessa vez queremos algo mais especial.
`;

async function checkCardExists() {
  console.log('1️⃣  Verificando se o card existe...');

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/cards?id=eq.${TEST_CARD_ID}&select=id,titulo,produto_data,briefing_inicial,pipeline_stages(fase)`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    }
  );

  const data = await response.json();

  if (!data || data.length === 0) {
    console.log('   ❌ Card NÃO encontrado!');
    return null;
  }

  const card = data[0];
  console.log(`   ✅ Card encontrado: "${card.titulo}"`);
  console.log(`   📊 Fase: ${card.pipeline_stages?.fase || 'N/A'}`);
  console.log(`   📦 produto_data: ${JSON.stringify(card.produto_data || {}).slice(0, 100)}...`);
  console.log(`   📋 briefing_inicial: ${JSON.stringify(card.briefing_inicial || {}).slice(0, 100)}...`);

  return card;
}

async function checkMeetingExists() {
  console.log('\n2️⃣  Verificando se a reunião existe...');
  console.log(`   🔍 Buscando reunião com ID: ${TEST_MEETING_ID}`);

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/reunioes?id=eq.${TEST_MEETING_ID}&select=id,titulo,card_id,transcricao,transcricao_metadata`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    }
  );

  const responseText = await response.text();
  console.log(`   📥 Response (${response.status}): ${responseText.slice(0, 200)}`);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.log(`   ❌ Erro ao parsear: ${e.message}`);
    return await createTestMeeting();
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.log('   ❌ Reunião NÃO encontrada!');
    console.log('   → Criando uma nova reunião de teste...');
    return await createTestMeeting();
  }

  const meeting = data[0];
  if (!meeting || !meeting.id) {
    console.log('   ❌ Meeting inválido:', JSON.stringify(meeting));
    return await createTestMeeting();
  }

  console.log(`   ✅ Reunião encontrada: "${meeting.titulo || 'Sem título'}"`);
  console.log(`   📋 card_id: ${meeting.card_id}`);
  console.log(`   📝 Tem transcrição: ${meeting.transcricao ? 'Sim' : 'Não'}`);

  return meeting;
}

async function createTestMeeting() {
  // Não definir ID manualmente - deixar o banco gerar
  const newMeeting = {
    card_id: TEST_CARD_ID,
    titulo: 'Reunião de Teste - Diagnóstico Workflow',
    tipo: 'Reunião inicial',
    data: new Date().toISOString(),
    status: 'Agendada'
  };

  console.log('   📤 Criando reunião:', JSON.stringify(newMeeting));

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/reunioes`,
    {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(newMeeting)
    }
  );

  const responseText = await response.text();
  console.log(`   📥 Response (${response.status}): ${responseText.slice(0, 200)}`);

  if (!response.ok) {
    console.log(`   ❌ Erro ao criar reunião: ${responseText}`);
    return null;
  }

  try {
    const data = JSON.parse(responseText);
    const meeting = Array.isArray(data) ? data[0] : data;
    console.log(`   ✅ Reunião criada: ${meeting.id}`);
    // Atualizar o TEST_MEETING_ID global para usar o ID gerado
    global.CREATED_MEETING_ID = meeting.id;
    return meeting;
  } catch (e) {
    console.log(`   ❌ Erro ao parsear resposta: ${e.message}`);
    return null;
  }
}

async function testWorkflow(meetingId) {
  // Usar o ID da reunião passado ou o criado dinamicamente
  const useMeetingId = meetingId || global.CREATED_MEETING_ID || TEST_MEETING_ID;

  console.log('\n3️⃣  Enviando transcrição para o workflow...');
  console.log(`   📍 Webhook: ${WEBHOOK_URL}`);
  console.log(`   📝 Transcrição: ${TEST_TRANSCRIPTION.length} caracteres`);

  const payload = {
    card_id: TEST_CARD_ID,
    meeting_id: useMeetingId,
    transcription: TEST_TRANSCRIPTION
  };

  console.log(`   📤 Payload: card_id=${TEST_CARD_ID}, meeting_id=${useMeetingId}`);

  const startTime = Date.now();

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const elapsed = Date.now() - startTime;
    console.log(`   ⏱️  Tempo de resposta: ${elapsed}ms`);
    console.log(`   📊 Status HTTP: ${response.status} ${response.statusText}`);

    const responseText = await response.text();

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      console.log('\n   📥 Resposta (texto bruto):');
      console.log('   ' + responseText);
      return { raw: responseText };
    }

    console.log('\n   📥 Resposta do Workflow:');
    console.log(JSON.stringify(responseData, null, 2));

    return responseData;
  } catch (error) {
    console.log(`   ❌ Erro: ${error.message}`);
    return null;
  }
}

async function checkCardAfterWorkflow() {
  console.log('\n4️⃣  Verificando card após o workflow...');

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/cards?id=eq.${TEST_CARD_ID}&select=id,titulo,produto_data,briefing_inicial`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    }
  );

  const data = await response.json();
  const card = data[0];

  console.log('\n   📦 produto_data após workflow:');
  console.log(JSON.stringify(card.produto_data, null, 2));

  console.log('\n   📋 briefing_inicial após workflow:');
  console.log(JSON.stringify(card.briefing_inicial, null, 2));
}

async function checkMeetingAfterWorkflow(meetingId) {
  const useMeetingId = meetingId || global.CREATED_MEETING_ID || TEST_MEETING_ID;
  console.log('\n5️⃣  Verificando reunião após o workflow...');

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/reunioes?id=eq.${useMeetingId}&select=id,titulo,transcricao,transcricao_metadata`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    }
  );

  const data = await response.json();

  if (!data || data.length === 0) {
    console.log('   ❌ Reunião não encontrada');
    return;
  }

  const meeting = data[0];
  console.log(`   📝 Transcrição salva: ${meeting.transcricao ? `${meeting.transcricao.length} caracteres` : 'NÃO'}`);
  console.log(`   📊 Metadata: ${JSON.stringify(meeting.transcricao_metadata || {})}`);
}

async function run() {
  console.log('═'.repeat(60));
  console.log('🔬 DIAGNÓSTICO DO WORKFLOW DE TRANSCRIÇÃO');
  console.log('═'.repeat(60));
  console.log('');

  // 1. Verificar card
  const card = await checkCardExists();
  if (!card) {
    console.log('\n❌ Abortando: Card não encontrado');
    return;
  }

  // 2. Verificar reunião
  const meeting = await checkMeetingExists();
  if (!meeting) {
    console.log('\n❌ Abortando: Não foi possível criar/encontrar reunião');
    return;
  }

  // 3. Testar workflow
  const workflowResult = await testWorkflow(meeting.id);

  // 4. Verificar resultado
  await checkCardAfterWorkflow();
  await checkMeetingAfterWorkflow(meeting.id);

  console.log('\n' + '═'.repeat(60));
  console.log('📊 ANÁLISE');
  console.log('═'.repeat(60));

  if (workflowResult) {
    if (workflowResult.status === 'success') {
      console.log('✅ Workflow executou com sucesso');
    } else if (workflowResult.status === 'no_update') {
      console.log('⚠️  Workflow não extraiu campos novos');
      console.log('   Possíveis causas:');
      console.log('   1. Prompt da IA não está extraindo corretamente');
      console.log('   2. Modelo GPT não recebeu a transcrição');
      console.log('   3. Validação está rejeitando os campos');
    } else if (workflowResult.ai_raw_output) {
      console.log('📝 Output da IA:', workflowResult.ai_raw_output);
    }
  }

  console.log('\n🔧 CAMPOS ESPERADOS da transcrição:');
  console.log('   destinos: ["Roma", "Florença", "Costa Amalfitana", "Veneza"]');
  console.log('   epoca_viagem: "Setembro"');
  console.log('   motivo: "Lua de mel"');
  console.log('   duracao_viagem: 15');
  console.log('   orcamento: 50000');
  console.log('   quantidade_viajantes: 2');
  console.log('   o_que_e_importante: "Experiência gastronômica, hotéis bonitos"');
  console.log('   receio_ou_medo: "Medo de avião, alergia a frutos do mar"');
  console.log('   frequencia_viagem: "2x_a_3x_ao_ano"');
  console.log('   usa_agencia: "não"');
}

run().catch(console.error);
