#!/usr/bin/env node
/**
 * Atualiza o prompt do AI no workflow para melhorar a extração
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;

if (!API_KEY) {
  console.error('N8N_API_KEY não definida');
  process.exit(1);
}

// Novo prompt mais direto e enfático
const NEW_PROMPT = `TAREFA CRÍTICA: Extrair informações da transcrição de reunião abaixo.

TRANSCRIÇÃO DA REUNIÃO:
---
{{ $json.transcricao }}
---

INSTRUÇÕES OBRIGATÓRIAS:
1. Leia ATENTAMENTE a transcrição acima
2. Extraia APENAS informações que o CLIENTE mencionou (não o consultor)
3. NÃO INVENTE dados - use SOMENTE o que está escrito na transcrição
4. Se a transcrição mencionar "Itália", extraia "Itália" - NÃO troque por outro país
5. Retorne APENAS um JSON válido

CAMPOS PARA EXTRAIR:
- destinos: Array de strings ["destino1", "destino2"] - EXATAMENTE como mencionado
- epoca_viagem: String - quando quer viajar
- motivo: String - motivo da viagem (ex: "Lua de mel", "Férias")
- duracao_viagem: Número de dias
- orcamento: Número em reais (50000, não "50 mil")
- quantidade_viajantes: Número de pessoas
- o_que_e_importante: String - o que é importante para o cliente
- receio_ou_medo: String - medos ou preocupações
- frequencia_viagem: "1x_ao_ano" | "2x_a_3x_ao_ano" | "mais_de_3x_ao_ano"
- usa_agencia: "sim" | "não"

EXEMPLO de transcrição e resposta:
Transcrição: "Cliente: Queremos ir para a Itália. Cliente: É nossa lua de mel."
Resposta: {"destinos": ["Itália"], "motivo": "Lua de mel"}

RESPONDA APENAS COM O JSON, SEM EXPLICAÇÕES.`;

const NEW_SYSTEM_MESSAGE = `Você é um extrator de dados preciso. Extraia EXATAMENTE o que está escrito na transcrição. NUNCA invente ou substitua informações. Se a transcrição diz "Itália", você DEVE retornar "Itália", não "Grécia" ou outro país. Retorne APENAS JSON válido.`;

async function run() {
  console.log('Buscando workflow...');

  const res = await fetch(`${N8N_API_URL}/api/v1/workflows/ms2tgIwCWJvWT8Kn`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  });

  const workflow = await res.json();

  console.log('Atualizando prompt da IA...');

  // Encontrar o nó AI Extrator
  for (const node of workflow.nodes) {
    if (node.name === '5. AI Extrator' || node.type.includes('langchain.agent')) {
      console.log('  Atualizando nó:', node.name);
      node.parameters.text = NEW_PROMPT;
      node.parameters.options = {
        systemMessage: NEW_SYSTEM_MESSAGE
      };
    }
  }

  const updatePayload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: { executionOrder: 'v1' }
  };

  // Desativar
  console.log('\nDesativando...');
  await fetch(`${N8N_API_URL}/api/v1/workflows/ms2tgIwCWJvWT8Kn/deactivate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': API_KEY }
  });

  // Atualizar
  console.log('Atualizando...');
  const updateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/ms2tgIwCWJvWT8Kn`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': API_KEY
    },
    body: JSON.stringify(updatePayload)
  });

  if (!updateRes.ok) {
    console.log('Erro:', await updateRes.text());
    return;
  }

  console.log('Workflow atualizado!');

  // Ativar
  console.log('Ativando...');
  await fetch(`${N8N_API_URL}/api/v1/workflows/ms2tgIwCWJvWT8Kn/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': API_KEY }
  });

  console.log('\nAguardando 3 segundos...');
  await new Promise(r => setTimeout(r, 3000));

  // Testar com transcrição simples e clara
  const testTranscription = `
Consultor: Olá! Para onde gostariam de viajar?
Cliente: Queremos ir para a Itália. Roma, Florença e Costa Amalfitana.
Consultor: Quando?
Cliente: Em setembro deste ano.
Consultor: Por qual motivo?
Cliente: É nossa lua de mel. Casamos em janeiro.
Consultor: Quantos dias?
Cliente: 15 dias.
Consultor: Orçamento?
Cliente: 50 mil reais.
Consultor: Quantas pessoas?
Cliente: 2 pessoas, eu e meu marido.
`;

  console.log('Testando com transcrição clara...');
  console.log('Transcrição de teste menciona: Itália, Roma, Florença, lua de mel, 15 dias, 50 mil');
  console.log('');

  const testRes = await fetch(`${N8N_API_URL}/webhook/transcript-process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_id: '9e5e2ec6-c7af-4d95-a915-4d0276921ff7',
      meeting_id: 'd7914eb6-2102-4afb-8097-bda967826e74',
      transcription: testTranscription
    })
  });

  console.log('Status:', testRes.status);
  const responseData = await testRes.json();
  console.log('Resposta:', JSON.stringify(responseData, null, 2));

  // Verificar o que foi salvo
  if (responseData.status === 'success') {
    console.log('\nVerificando dados salvos...');
    await new Promise(r => setTimeout(r, 1000));

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required for verification');
      return;
    }
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szyrzxvlptqqheizyrxu.supabase.co';

    const cardRes = await fetch(`${SUPABASE_URL}/rest/v1/cards?id=eq.9e5e2ec6-c7af-4d95-a915-4d0276921ff7&select=briefing_inicial`, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    const cardData = await cardRes.json();
    const briefing = cardData[0]?.briefing_inicial || {};

    console.log('\n=== DADOS NO CARD ===');
    console.log('destinos:', JSON.stringify(briefing.destinos));
    console.log('motivo:', briefing.motivo);
    console.log('duracao_viagem:', briefing.duracao_viagem);
    console.log('orcamento:', briefing.orcamento);
    console.log('quantidade_viajantes:', briefing.quantidade_viajantes);
    console.log('epoca_viagem:', briefing.epoca_viagem);

    // Verificar se os dados estão corretos
    console.log('\n=== VERIFICAÇÃO ===');
    const destinos = briefing.destinos || [];
    if (destinos.some(d => d.toLowerCase().includes('itália') || d.toLowerCase().includes('roma'))) {
      console.log('✅ Destinos corretos (menciona Itália/Roma)');
    } else {
      console.log('❌ Destinos INCORRETOS - esperava Itália/Roma, recebeu:', destinos);
    }

    if (briefing.motivo?.toLowerCase().includes('lua de mel')) {
      console.log('✅ Motivo correto (lua de mel)');
    } else {
      console.log('❌ Motivo INCORRETO - esperava lua de mel, recebeu:', briefing.motivo);
    }

    if (briefing.duracao_viagem === 15) {
      console.log('✅ Duração correta (15 dias)');
    } else {
      console.log('❌ Duração INCORRETA - esperava 15, recebeu:', briefing.duracao_viagem);
    }
  }
}

run().catch(console.error);
