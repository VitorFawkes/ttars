#!/usr/bin/env node
/**
 * Script para atualizar o workflow "Welcome CRM - Atualização Campo Reuniões" no n8n
 *
 * CORREÇÕES APLICADAS:
 * 1. responseMode: "responseNode" com nó de resposta explícito
 * 2. Prompt da IA atualizado para extrair TODOS os campos
 * 3. Nós de debug para verificar o fluxo
 *
 * Uso: N8N_API_KEY=xxx node scripts/update-n8n-workflow.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;

if (!API_KEY) {
  console.error('❌ Erro: N8N_API_KEY não definida');
  console.error('Uso: N8N_API_KEY=xxx node scripts/update-n8n-workflow.js');
  process.exit(1);
}

// Gerar UUIDs simples
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

// Prompt atualizado para extração
const AI_PROMPT = `# TAREFA: Extrair informações da TRANSCRIÇÃO DE REUNIÃO para o CRM

## DADOS ATUAIS DO CARD
Título: {{ $json.titulo }}

## TRANSCRIÇÃO DA REUNIÃO ({{ $json.total_caracteres }} caracteres)
{{ $json.transcricao }}

---

# INSTRUÇÕES DE EXTRAÇÃO

Analise a transcrição acima e extraia TODAS as informações que o **CLIENTE** mencionou.
Em uma reunião, identifique quem é o cliente (geralmente quem NÃO é da Welcome Trips/agência/consultor).
Extraia TODAS as informações relevantes ditas pelo cliente.

IMPORTANTE: Extraia TODOS os campos encontrados, mesmo que já existam dados anteriores.

---

# CAMPOS PARA EXTRAIR

1. **destinos** - Array de strings com destinos. Ex: ["Itália", "Roma", "Florença"]
2. **epoca_viagem** - String com quando quer viajar. Ex: "Setembro 2026", "Férias de julho"
3. **motivo** - String com motivo da viagem. Ex: "Lua de mel", "Férias em família"
4. **duracao_viagem** - Número de dias. Ex: 15, 21
5. **orcamento** - Número em reais. Ex: 50000, 100000
6. **quantidade_viajantes** - Número de pessoas. Ex: 2, 4
7. **servico_contratado** - Boolean se já contratou algo. Ex: true, false
8. **qual_servio_contratado** - String do que contratou. Ex: "Passagens aéreas"
9. **momento_viagem** - Contexto especial. Ex: "Comemorando 10 anos de casamento"
10. **prioridade_viagem** - Array de prioridades. Ex: ["viagem_alto_padrão"]
11. **o_que_e_importante** - String livre do que é importante
12. **algo_especial_viagem** - String livre de algo especial desejado
13. **receio_ou_medo** - String livre com receios/preocupações
14. **frequencia_viagem** - ENUM: "1x_ao_ano" | "2x_a_3x_ao_ano" | "mais_de_3x_ao_ano"
15. **usa_agencia** - ENUM: "sim" | "não"

---

# REGRAS

1. Extraia APENAS informações do CLIENTE (não do consultor)
2. NÃO invente informações - use apenas o que está na transcrição
3. Use os formatos EXATOS especificados acima
4. Retorne APENAS um JSON válido
5. Se não encontrar info para um campo, NÃO inclua o campo no JSON
6. Para arrays como destinos, inclua TODOS os lugares mencionados

Exemplo de resposta:
{"destinos": ["Itália", "Roma", "Florença", "Costa Amalfitana"], "motivo": "Lua de mel", "duracao_viagem": 15, "orcamento": 50000, "quantidade_viajantes": 2, "epoca_viagem": "Setembro", "frequencia_viagem": "2x_a_3x_ao_ano", "usa_agencia": "não"}`;

const workflow = {
  name: "Welcome CRM - Atualização Campo Reuniões",
  nodes: [
    // 1. Webhook Trigger - Configurado para resposta síncrona
    {
      parameters: {
        httpMethod: "POST",
        path: "transcript-process",
        responseMode: "responseNode",
        options: {}
      },
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [220, 300],
      id: uuid(),
      name: "1. Webhook Trigger"
    },

    // 2. Salvar Transcrição na Reunião
    {
      parameters: {
        method: "PATCH",
        url: "=https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/reunioes?id=eq.{{ $json.body.meeting_id }}",
        authentication: "predefinedCredentialType",
        nodeCredentialType: "supabaseApi",
        sendBody: true,
        specifyBody: "json",
        jsonBody: '={{ JSON.stringify({ transcricao: $json.body.transcription }) }}',
        options: {}
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [440, 300],
      id: uuid(),
      name: "2. Salvar Transcrição"
    },

    // 3. Buscar Card
    {
      parameters: {
        url: "=https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/cards?id=eq.{{ $('1. Webhook Trigger').item.json.body.card_id }}&select=id,titulo,produto_data,briefing_inicial,pipeline_stage_id,pipeline_stages(fase)",
        authentication: "predefinedCredentialType",
        nodeCredentialType: "supabaseApi",
        options: {}
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [660, 300],
      id: uuid(),
      name: "3. Busca Card"
    },

    // 4. Monta Contexto
    {
      parameters: {
        jsCode: `// Dados do card
const cardData = $('3. Busca Card').first().json || {};
const produtoData = cardData.produto_data || {};
const briefingData = cardData.briefing_inicial || {};

// Fase do card (SDR, Planner, Pós-venda)
const fase = cardData.pipeline_stages?.fase || 'SDR';

// Transcrição recebida via webhook
const transcricao = $('1. Webhook Trigger').first().json.body.transcription || '';
const meetingId = $('1. Webhook Trigger').first().json.body.meeting_id;

if (!transcricao || transcricao.trim().length === 0) {
  return [{
    json: {
      card_id: cardData.id,
      meeting_id: meetingId,
      titulo: cardData.titulo,
      fase: fase,
      transcricao: "(Nenhuma transcrição recebida)",
      total_caracteres: 0,
      error: "Transcrição vazia"
    }
  }];
}

return [{
  json: {
    card_id: cardData.id,
    meeting_id: meetingId,
    titulo: cardData.titulo,
    fase: fase,
    transcricao: transcricao,
    total_caracteres: transcricao.length
  }
}];
`
      },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [880, 300],
      id: uuid(),
      name: "4. Monta Contexto"
    },

    // 5. AI Extrator
    {
      parameters: {
        promptType: "define",
        text: AI_PROMPT,
        options: {
          systemMessage: `Você é um assistente especializado em extrair dados de transcrições de reuniões para um CRM de agência de viagens.

REGRAS CRÍTICAS:
1. Retorne APENAS JSON válido, sem markdown ou texto adicional
2. Extraia APENAS informações ditas pelo CLIENTE
3. Use os formatos EXATOS especificados
4. Se não houver informação para um campo, NÃO inclua o campo`
        }
      },
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 2.2,
      position: [1100, 300],
      id: uuid(),
      name: "5. AI Extrator"
    },

    // GPT Model
    {
      parameters: {
        model: {
          __rl: true,
          value: "gpt-4o",
          mode: "list"
        },
        options: {
          responseFormat: "json_object",
          temperature: 0.1
        }
      },
      type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      typeVersion: 1.2,
      position: [1100, 520],
      id: uuid(),
      name: "GPT-4o"
    },

    // 6. Valida Output
    {
      parameters: {
        jsCode: `const aiOutput = $('5. AI Extrator').first().json.output || '{}';

let extracted = {};
try {
  let cleanOutput = aiOutput;
  if (typeof cleanOutput === 'string') {
    cleanOutput = cleanOutput.replace(/\`\`\`json\\n?/g, '').replace(/\`\`\`\\n?/g, '').trim();
    extracted = JSON.parse(cleanOutput);
  } else {
    extracted = cleanOutput;
  }
} catch (e) {
  extracted = {};
}

const camposValidos = [
  'destinos', 'epoca_viagem', 'motivo', 'duracao_viagem', 'orcamento',
  'quantidade_viajantes', 'servico_contratado', 'qual_servio_contratado',
  'momento_viagem', 'degustacao_tp', 'taxa_planejamento',
  'origem_lead', 'prioridade_viagem', 'o_que_e_importante',
  'algo_especial_viagem', 'receio_ou_medo', 'frequencia_viagem', 'usa_agencia'
];

const produtoDataUpdate = {};
for (const campo of camposValidos) {
  const valor = extracted[campo];
  if (valor !== undefined && valor !== null && valor !== '') {
    if (campo === 'destinos') {
      if (typeof valor === 'string') {
        const destinos = valor.split(/[,e]/).map(d => d.trim()).filter(d => d.length > 0);
        if (destinos.length > 0) produtoDataUpdate[campo] = destinos;
      } else if (Array.isArray(valor) && valor.length > 0) {
        produtoDataUpdate[campo] = valor;
      }
    } else if (['duracao_viagem', 'quantidade_viajantes', 'orcamento'].includes(campo)) {
      const num = Number(valor);
      if (!isNaN(num) && num > 0) produtoDataUpdate[campo] = num;
    } else if (['servico_contratado', 'degustacao_tp'].includes(campo)) {
      if (typeof valor === 'boolean') produtoDataUpdate[campo] = valor;
    } else {
      produtoDataUpdate[campo] = valor;
    }
  }
}

return [{
  json: {
    card_id: $('4. Monta Contexto').first().json.card_id,
    meeting_id: $('4. Monta Contexto').first().json.meeting_id,
    fase: $('4. Monta Contexto').first().json.fase,
    tem_atualizacao: Object.keys(produtoDataUpdate).length > 0,
    campos_extraidos: produtoDataUpdate,
    total_campos: Object.keys(produtoDataUpdate).length,
    ai_raw_output: aiOutput
  }
}];
`
      },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1320, 300],
      id: uuid(),
      name: "6. Valida Output"
    },

    // 7. IF Tem Atualização
    {
      parameters: {
        conditions: {
          boolean: [
            {
              value1: "={{ $json.tem_atualizacao }}",
              value2: true
            }
          ]
        }
      },
      type: "n8n-nodes-base.if",
      typeVersion: 1,
      position: [1540, 300],
      id: uuid(),
      name: "7. Tem Atualização?"
    },

    // 8. Busca produto_data Atual
    {
      parameters: {
        url: "=https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/cards?id=eq.{{ $json.card_id }}&select=produto_data,briefing_inicial,pipeline_stages(fase)",
        authentication: "predefinedCredentialType",
        nodeCredentialType: "supabaseApi",
        options: {}
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1760, 200],
      id: uuid(),
      name: "8. Busca produto_data Atual"
    },

    // 9. Merge Dados
    {
      parameters: {
        jsCode: `const camposExtraidos = $('6. Valida Output').first().json.campos_extraidos;
const cardId = $('6. Valida Output').first().json.card_id;
const meetingId = $('6. Valida Output').first().json.meeting_id;
const fase = $('6. Valida Output').first().json.fase;

const currentCard = $('8. Busca produto_data Atual').first().json;
const currentProdutoData = currentCard.produto_data || {};
const currentBriefing = currentCard.briefing_inicial || {};

const tripInfoFields = [
  'destinos', 'epoca_viagem', 'motivo', 'duracao_viagem', 'orcamento',
  'quantidade_viajantes', 'servico_contratado', 'qual_servio_contratado',
  'momento_viagem', 'degustacao_tp', 'taxa_planejamento'
];

const observacoesFields = [
  'prioridade_viagem', 'o_que_e_importante', 'algo_especial_viagem',
  'receio_ou_medo', 'frequencia_viagem', 'usa_agencia', 'origem_lead'
];

const tripInfoUpdate = {};
const observacoesUpdate = {};

for (const [key, value] of Object.entries(camposExtraidos)) {
  if (tripInfoFields.includes(key)) {
    tripInfoUpdate[key] = value;
  } else if (observacoesFields.includes(key)) {
    observacoesUpdate[key] = value;
  }
}

let produtoDataFinal = { ...currentProdutoData };
let briefingFinal = { ...currentBriefing };

if (fase === 'SDR') {
  briefingFinal = { ...briefingFinal, ...tripInfoUpdate };
  const currentObs = currentBriefing.observacoes || {};
  briefingFinal.observacoes = { ...currentObs, ...observacoesUpdate };
} else if (fase === 'Planner') {
  produtoDataFinal = { ...produtoDataFinal, ...tripInfoUpdate };
  const currentObs = currentProdutoData.observacoes_criticas || {};
  produtoDataFinal.observacoes_criticas = { ...currentObs, ...observacoesUpdate };
} else {
  produtoDataFinal = { ...produtoDataFinal, ...tripInfoUpdate };
  const currentObs = currentProdutoData.observacoes_pos_venda || {};
  produtoDataFinal.observacoes_pos_venda = { ...currentObs, ...observacoesUpdate };
}

return [{
  json: {
    card_id: cardId,
    meeting_id: meetingId,
    fase: fase,
    produto_data: produtoDataFinal,
    briefing_inicial: briefingFinal,
    campos_atualizados: Object.keys(camposExtraidos)
  }
}];
`
      },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1980, 200],
      id: uuid(),
      name: "9. Merge Dados"
    },

    // 10. Atualiza Card
    {
      parameters: {
        method: "PATCH",
        url: "=https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/cards?id=eq.{{ $json.card_id }}",
        authentication: "predefinedCredentialType",
        nodeCredentialType: "supabaseApi",
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify({ produto_data: $json.produto_data, briefing_inicial: $json.briefing_inicial }) }}",
        options: {}
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [2200, 200],
      id: uuid(),
      name: "10. Atualiza Card"
    },

    // 11. Atualiza Metadata Reunião
    {
      parameters: {
        method: "PATCH",
        url: "=https://szyrzxvlptqqheizyrxu.supabase.co/rest/v1/reunioes?id=eq.{{ $('9. Merge Dados').item.json.meeting_id }}",
        authentication: "predefinedCredentialType",
        nodeCredentialType: "supabaseApi",
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({ transcricao_metadata: { processed_at: new Date().toISOString(), campos_extraidos: $('9. Merge Dados').item.json.campos_atualizados } }) }}`,
        options: {}
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [2420, 200],
      id: uuid(),
      name: "11. Atualiza Metadata"
    },

    // 12. Resposta Sucesso
    {
      parameters: {
        respondWith: "json",
        responseBody: `={{ JSON.stringify({ status: "success", message: "Transcrição processada com sucesso", campos_extraidos: $('9. Merge Dados').item.json.campos_atualizados }) }}`
      },
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [2640, 200],
      id: uuid(),
      name: "12. Resposta Sucesso"
    },

    // 13. Sem Atualização - Resposta
    {
      parameters: {
        respondWith: "json",
        responseBody: `={{ JSON.stringify({ status: "no_update", message: "Nenhuma informação nova extraída", ai_output: $('6. Valida Output').first().json.ai_raw_output }) }}`
      },
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [1760, 400],
      id: uuid(),
      name: "13. Sem Atualização"
    }
  ],
  connections: {
    "1. Webhook Trigger": {
      main: [[{ node: "2. Salvar Transcrição", type: "main", index: 0 }]]
    },
    "2. Salvar Transcrição": {
      main: [[{ node: "3. Busca Card", type: "main", index: 0 }]]
    },
    "3. Busca Card": {
      main: [[{ node: "4. Monta Contexto", type: "main", index: 0 }]]
    },
    "4. Monta Contexto": {
      main: [[{ node: "5. AI Extrator", type: "main", index: 0 }]]
    },
    "5. AI Extrator": {
      main: [[{ node: "6. Valida Output", type: "main", index: 0 }]]
    },
    "GPT-4o": {
      ai_languageModel: [[{ node: "5. AI Extrator", type: "ai_languageModel", index: 0 }]]
    },
    "6. Valida Output": {
      main: [[{ node: "7. Tem Atualização?", type: "main", index: 0 }]]
    },
    "7. Tem Atualização?": {
      main: [
        [{ node: "8. Busca produto_data Atual", type: "main", index: 0 }],
        [{ node: "13. Sem Atualização", type: "main", index: 0 }]
      ]
    },
    "8. Busca produto_data Atual": {
      main: [[{ node: "9. Merge Dados", type: "main", index: 0 }]]
    },
    "9. Merge Dados": {
      main: [[{ node: "10. Atualiza Card", type: "main", index: 0 }]]
    },
    "10. Atualiza Card": {
      main: [[{ node: "11. Atualiza Metadata", type: "main", index: 0 }]]
    },
    "11. Atualiza Metadata": {
      main: [[{ node: "12. Resposta Sucesso", type: "main", index: 0 }]]
    }
  },
  settings: {
    executionOrder: "v1"
  }
};

async function findAndUpdateWorkflow() {
  console.log('🔍 Buscando workflow existente...');

  // 1. Listar workflows
  const listResponse = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  });

  if (!listResponse.ok) {
    throw new Error(`Erro ao listar workflows: ${await listResponse.text()}`);
  }

  const workflows = (await listResponse.json()).data || [];

  // 2. Encontrar o workflow de transcrição
  const existingWorkflow = workflows.find(w =>
    w.name === "Welcome CRM - Atualização Campo Reuniões"
  );

  if (existingWorkflow) {
    console.log(`✅ Workflow encontrado: ${existingWorkflow.id}`);
    console.log('📝 Atualizando workflow...');

    // Atualizar workflow existente (sem o campo active que é read-only)
    const updateResponse = await fetch(`${N8N_API_URL}/api/v1/workflows/${existingWorkflow.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': API_KEY
      },
      body: JSON.stringify(workflow)
    });

    if (!updateResponse.ok) {
      throw new Error(`Erro ao atualizar: ${await updateResponse.text()}`);
    }

    const result = await updateResponse.json();
    console.log('✅ Workflow atualizado com sucesso!');
    return result;
  } else {
    console.log('📝 Criando novo workflow...');

    // Criar novo workflow
    const createResponse = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': API_KEY
      },
      body: JSON.stringify(workflow)
    });

    if (!createResponse.ok) {
      throw new Error(`Erro ao criar: ${await createResponse.text()}`);
    }

    const result = await createResponse.json();
    console.log(`✅ Workflow criado: ${result.id}`);

    // Ativar workflow
    await fetch(`${N8N_API_URL}/api/v1/workflows/${result.id}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });

    console.log('✅ Workflow ativado!');
    return result;
  }
}

async function run() {
  console.log('═'.repeat(60));
  console.log('🔄 ATUALIZANDO WORKFLOW DE TRANSCRIÇÃO');
  console.log('═'.repeat(60));
  console.log('');

  try {
    const result = await findAndUpdateWorkflow();

    console.log('');
    console.log('═'.repeat(60));
    console.log('📋 RESUMO');
    console.log('═'.repeat(60));
    console.log(`   ID: ${result.id}`);
    console.log(`   Nome: ${result.name}`);
    console.log(`   Ativo: ${result.active ? 'Sim' : 'Não'}`);
    console.log('');
    console.log('🌐 Webhook URL:');
    console.log(`   ${N8N_API_URL}/webhook/transcript-process`);
    console.log('');
    console.log('📋 CORREÇÕES APLICADAS:');
    console.log('   1. ✅ responseMode: "responseNode" - Resposta síncrona');
    console.log('   2. ✅ Nós "Respond to Webhook" para respostas');
    console.log('   3. ✅ Prompt da IA atualizado para extrair TODOS os campos');
    console.log('   4. ✅ Debug output no caso de "sem atualização"');
    console.log('');
    console.log('⚠️  IMPORTANTE:');
    console.log('   Certifique-se de que as credenciais estão configuradas:');
    console.log('   - Supabase API');
    console.log('   - OpenAI API (ou Financeiro Automação)');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

run();
