#!/usr/bin/env node
/**
 * Script para testar o workflow "Welcome CRM - Atualização Campo Reuniões"
 *
 * Uso: node scripts/test-transcript-workflow.js [card_id] [meeting_id]
 *
 * Se não fornecer IDs, usa valores de teste padrão
 */

const WEBHOOK_URL = 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/transcript-process';

// IDs de teste (substitua pelos seus)
const TEST_CARD_ID = process.argv[2] || '9e5e2ec6-c7af-4d95-a915-4d0276921ff7';
const TEST_MEETING_ID = process.argv[3] || 'test-meeting-' + Date.now();

// Transcrição de exemplo realista
const SAMPLE_TRANSCRIPTION = `
[00:00:15] Consultor: Olá, bom dia! Aqui é da Welcome Trips. Tudo bem com você?

[00:00:22] Cliente: Oi, tudo ótimo! Obrigada por retornar.

[00:00:28] Consultor: Claro! Então, você mencionou que está interessada em uma viagem especial. Me conta mais sobre o que você tem em mente?

[00:00:45] Cliente: Então, eu e meu marido estamos planejando nossa lua de mel. A gente casou agora em janeiro e queremos fazer a viagem em setembro, quando ele consegue tirar férias.

[00:01:05] Consultor: Que maravilha! Parabéns pelo casamento! E vocês já têm algum destino em mente?

[00:01:15] Cliente: A gente sonha muito com a Itália. Queríamos conhecer Roma, Florença e a Costa Amalfitana. Talvez passar por Veneza também se der tempo.

[00:01:35] Consultor: Destinos lindos! E quantos dias vocês estão pensando para essa viagem?

[00:01:42] Cliente: A gente tava pensando em uns 15 dias, mais ou menos. Talvez 14 noites.

[00:01:55] Consultor: Perfeito, 15 dias é um tempo ótimo para esse roteiro. E em relação ao investimento, vocês já têm uma ideia de orçamento?

[00:02:10] Cliente: Olha, a gente conseguiu juntar uns 50 mil reais para essa viagem. É nossa lua de mel, então queremos fazer algo especial, sabe? Não precisa ser o mais barato.

[00:02:28] Consultor: Entendi perfeitamente. Com esse orçamento dá para fazer uma viagem muito bonita. O que é mais importante para vocês nessa viagem?

[00:02:42] Cliente: Acho que a experiência gastronômica é super importante para nós. A gente ama comida italiana! E também queremos hotéis bonitos, com boa localização. Não precisa ser 5 estrelas, mas queremos conforto.

[00:03:05] Consultor: Ótimo! E tem alguma preocupação ou receio sobre a viagem?

[00:03:15] Cliente: Ah, meu marido tem um pouco de medo de avião, então voos muito longos ele fica nervoso. E eu tenho alergia a frutos do mar, então precisamos ter cuidado com isso nos restaurantes.

[00:03:35] Consultor: Anotado! Vou levar isso em consideração. Vocês costumam viajar internacionalmente com frequência?

[00:03:45] Cliente: A gente viaja umas 2 vezes por ano para fora. Já fomos para a Europa uma vez, para Portugal e Espanha.

[00:03:58] Consultor: E costumam usar agência de viagens?

[00:04:05] Cliente: Normalmente a gente organiza por conta própria, mas dessa vez como é lua de mel queremos algo mais especial e sem preocupação.

[00:04:20] Consultor: Faz total sentido. Deixa eu anotar tudo aqui e vou preparar uma proposta linda para vocês. Algo mais que gostaria de mencionar?

[00:04:35] Cliente: Ah sim! A gente queria muito fazer um jantar especial em algum lugar romântico, talvez com vista. E se tiver como incluir uma aula de culinária italiana seria perfeito!

[00:04:55] Consultor: Que ideia maravilhosa! Vou incluir essas experiências na proposta. Obrigado pelas informações!
`;

async function testWorkflow() {
  console.log('🧪 Testando workflow de transcrição...');
  console.log('');
  console.log(`📍 Webhook: ${WEBHOOK_URL}`);
  console.log(`📋 Card ID: ${TEST_CARD_ID}`);
  console.log(`📅 Meeting ID: ${TEST_MEETING_ID}`);
  console.log(`📝 Transcrição: ${SAMPLE_TRANSCRIPTION.length} caracteres`);
  console.log('');
  console.log('─'.repeat(60));
  console.log('');

  const payload = {
    card_id: TEST_CARD_ID,
    meeting_id: TEST_MEETING_ID,
    transcription: SAMPLE_TRANSCRIPTION
  };

  try {
    console.log('📤 Enviando requisição...');
    const startTime = Date.now();

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const elapsed = Date.now() - startTime;

    console.log(`⏱️  Tempo de resposta: ${elapsed}ms`);
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log('');

    const responseText = await response.text();

    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log('📥 Resposta:');
      console.log(JSON.stringify(responseData, null, 2));
    } catch {
      console.log('📥 Resposta (texto):');
      console.log(responseText);
    }

    console.log('');
    console.log('─'.repeat(60));

    if (response.ok) {
      console.log('');
      console.log('✅ Teste concluído com sucesso!');
      console.log('');
      console.log('📋 Campos que deveriam ser extraídos da transcrição:');
      console.log('   • destinos: ["Roma", "Florença", "Costa Amalfitana", "Veneza"]');
      console.log('   • epoca_viagem: "Setembro"');
      console.log('   • motivo: "Lua de mel"');
      console.log('   • duracao_viagem: 15');
      console.log('   • orcamento: 50000');
      console.log('   • quantidade_viajantes: 2');
      console.log('   • o_que_e_importante: "Experiência gastronômica, hotéis bonitos"');
      console.log('   • receio_ou_medo: "Medo de avião, alergia a frutos do mar"');
      console.log('   • frequencia_viagem: "2x_a_3x_ao_ano"');
      console.log('   • usa_agencia: "não"');
    } else {
      console.log('');
      console.log('❌ Teste falhou - verifique o workflow no n8n');
    }

  } catch (error) {
    console.error('❌ Erro ao testar:', error.message);
    process.exit(1);
  }
}

testWorkflow();
