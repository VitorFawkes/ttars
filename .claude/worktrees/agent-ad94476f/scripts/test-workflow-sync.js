#!/usr/bin/env node
/**
 * Script para testar o workflow de forma síncrona
 * Aguarda a resposta completa do workflow
 */

// URLs - o /test espera a execução completar
const WEBHOOK_URL = 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/transcript-process';
const WEBHOOK_TEST_URL = 'https://n8n-n8n.ymnmx7.easypanel.host/webhook-test/transcript-process';

const TEST_CARD_ID = '9e5e2ec6-c7af-4d95-a915-4d0276921ff7';
const TEST_MEETING_ID = 'd7914eb6-2102-4afb-8097-bda967826e74';

// Transcrição curta e clara para teste
const TEST_TRANSCRIPTION = `
Consultor: Olá, bom dia! Aqui é da Welcome Trips. Como posso ajudar?

Cliente: Oi! Estou planejando minha lua de mel com meu marido.

Consultor: Que lindo! Para onde vocês gostariam de ir?

Cliente: Queremos ir para a Itália. Roma, Florença e Costa Amalfitana.

Consultor: Ótima escolha! Quantos dias de viagem?

Cliente: Pensamos em 15 dias.

Consultor: E qual o orçamento aproximado?

Cliente: Temos 50 mil reais para a viagem toda.

Consultor: Perfeito! Quantas pessoas vão viajar?

Cliente: Somos 2, eu e meu marido.

Consultor: E quando pretendem viajar?

Cliente: Em setembro deste ano.

Consultor: O que é mais importante para vocês na viagem?

Cliente: A gastronomia italiana! Adoramos comer bem. E hotéis confortáveis.

Consultor: Algum receio ou preocupação?

Cliente: Meu marido tem medo de avião. E eu sou alérgica a frutos do mar.

Consultor: Vocês costumam viajar com frequência?

Cliente: Viajamos internacionalmente umas 2 vezes por ano.

Consultor: E costumam usar agência?

Cliente: Não, geralmente fazemos por conta própria.
`;

async function testWorkflow(url, name) {
  console.log(`\n🔄 Testando ${name}...`);
  console.log(`   URL: ${url}`);

  const payload = {
    card_id: TEST_CARD_ID,
    meeting_id: TEST_MEETING_ID,
    transcription: TEST_TRANSCRIPTION
  };

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const elapsed = Date.now() - startTime;
    console.log(`   ⏱️  Tempo: ${elapsed}ms`);
    console.log(`   📊 Status: ${response.status}`);

    const text = await response.text();

    try {
      const data = JSON.parse(text);
      console.log(`   📥 Resposta:`);
      console.log(JSON.stringify(data, null, 2));

      // Verificar se tem informações úteis
      if (data.status === 'success') {
        console.log(`\n   ✅ Workflow executou com sucesso!`);
      } else if (data.status === 'no_update') {
        console.log(`\n   ⚠️  Nenhuma atualização - IA não extraiu campos`);
      } else if (data.message === 'Workflow was started') {
        console.log(`\n   ⏳ Workflow iniciado assincronamente`);
      } else if (data.ai_raw_output) {
        console.log(`\n   🤖 Output da IA: ${data.ai_raw_output}`);
      }

      return data;
    } catch {
      console.log(`   📥 Resposta (texto): ${text.slice(0, 500)}`);
      return { raw: text };
    }
  } catch (error) {
    console.log(`   ❌ Erro: ${error.message}`);
    return null;
  }
}

async function run() {
  console.log('═'.repeat(60));
  console.log('🧪 TESTE SÍNCRONO DO WORKFLOW DE TRANSCRIÇÃO');
  console.log('═'.repeat(60));
  console.log(`\n📋 Card: ${TEST_CARD_ID}`);
  console.log(`📅 Reunião: ${TEST_MEETING_ID}`);
  console.log(`📝 Transcrição: ${TEST_TRANSCRIPTION.length} caracteres`);

  // Testar URL de produção
  const prodResult = await testWorkflow(WEBHOOK_URL, 'Webhook Produção');

  // Se produção retornou async, tentar URL de teste
  if (prodResult?.message === 'Workflow was started') {
    console.log('\n' + '─'.repeat(60));
    console.log('⚠️  Webhook de produção é assíncrono. Tentando webhook de teste...');
    await testWorkflow(WEBHOOK_TEST_URL, 'Webhook Teste');
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 CAMPOS ESPERADOS:');
  console.log('═'.repeat(60));
  console.log(`   destinos: ["Itália", "Roma", "Florença", "Costa Amalfitana"]`);
  console.log(`   epoca_viagem: "setembro"`);
  console.log(`   motivo: "lua de mel"`);
  console.log(`   duracao_viagem: 15`);
  console.log(`   orcamento: 50000`);
  console.log(`   quantidade_viajantes: 2`);
  console.log(`   o_que_e_importante: "gastronomia italiana, hotéis confortáveis"`);
  console.log(`   receio_ou_medo: "medo de avião, alergia a frutos do mar"`);
  console.log(`   frequencia_viagem: "2x_a_3x_ao_ano"`);
  console.log(`   usa_agencia: "não"`);
}

run().catch(console.error);
