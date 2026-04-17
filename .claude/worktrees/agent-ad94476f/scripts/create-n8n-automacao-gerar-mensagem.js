#!/usr/bin/env node
/**
 * Deploy: "Automação - Gerar Mensagem IA" workflow in n8n
 *
 * Generates personalized WhatsApp messages using AI (OpenAI) based on
 * card/contact context. Workflow receives execution ID, fetches card,
 * contact, agent, and optionally conversation history. AI generates
 * message, then updates automacao_execucoes table for processing.
 *
 * Flow:
 *   Webhook → Fetch Card/Contact/Agent → [opt] Fetch Conversation
 *   → Assemble Context → AI Generate → Callback to Supabase
 *
 * Prerequisites:
 *   - OpenAI credential configured in n8n (id: ZLg8WpP4UNXepE8g)
 *   - Supabase credentials configured in n8n
 *
 * Usage: source .env && node scripts/create-n8n-automacao-gerar-mensagem.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Credential IDs (managed by n8n, not env vars)
const SUPABASE_CREDENTIAL = { id: 'SXzk2uSaw8b7BcaN', name: 'WelcomeSupabase' };
const OPENAI_CREDENTIAL = { id: 'ZLg8WpP4UNXepE8g', name: 'Vitor TESTE' };

if (!API_KEY) {
  console.error('❌ N8N_API_KEY is required.');
  console.error('Usage: source .env && node scripts/create-n8n-automacao-gerar-mensagem.js');
  process.exit(1);
}

// OPENAI_API_KEY not needed — n8n manages credentials internally via OPENAI_CREDENTIAL

// ============================================================================
// CODE NODE SCRIPTS
// ============================================================================

const CODE_MONTA_CONTEXTO = `// Assemble context from fetched data
const webhook = $('Webhook').first().json;
const card = $('2. Fetch Card').first().json[0] || {};
const contact = $('3. Fetch Contact').first().json[0] || {};
const agent = $('4. Fetch Agent').first().json[0] || {};

let context = '';
context += '\\n=== CLIENTE ===\\n';
context += 'Nome: ' + contact.nome + ' ' + (contact.sobrenome || '');
if (contact.tipo_cliente) context += ' (' + contact.tipo_cliente + ')';
context += '\\n';
if (contact.data_nascimento) context += 'Aniversário: ' + contact.data_nascimento + '\\n';
if (contact.tags) {
  const tags = typeof contact.tags === 'string' ? JSON.parse(contact.tags) : (contact.tags || []);
  if (Array.isArray(tags) && tags.length > 0) {
    context += 'Tags: ' + tags.join(', ') + '\\n';
  }
}

context += '\\n=== VIAGEM ===\\n';
context += 'Título: ' + card.titulo + '\\n';
context += 'Produto: ' + (card.produto || 'desconhecido') + '\\n';
if (card.data_viagem_inicio) context += 'Data Ida: ' + card.data_viagem_inicio + '\\n';
if (card.data_viagem_fim) context += 'Data Volta: ' + card.data_viagem_fim + '\\n';

const valor = card.valor_final || card.valor_estimado;
if (valor) {
  const valorNum = typeof valor === 'string' ? parseFloat(valor) : valor;
  context += 'Valor: R$ ' + valorNum.toLocaleString('pt-BR') + '\\n';
}

// Briefing inicial
if (card.briefing_inicial) {
  context += '\\n=== BRIEFING ===\\n';
  const bi = typeof card.briefing_inicial === 'string'
    ? (function() { try { return JSON.parse(card.briefing_inicial); } catch(e) { return {}; } })()
    : (card.briefing_inicial || {});

  if (bi.trip_info?.destinos) {
    context += 'Destinos: ' + bi.trip_info.destinos + '\\n';
  }
  if (bi.trip_info?.duracao_viagem?.display) {
    context += 'Duração: ' + bi.trip_info.duracao_viagem.display + '\\n';
  }
  if (bi.trip_info?.orcamento?.display) {
    context += 'Orçamento: ' + bi.trip_info.orcamento.display + '\\n';
  }
  if (bi.observacoes?.briefing) {
    const briefing = bi.observacoes.briefing.substring(0, 500);
    context += 'Anotações: ' + briefing + '\\n';
  }
}

// Conversation history (if available)
try {
  const conversionaryData = $('5. Fetch Conversation').first();
  if (conversionaryData) {
    const msgs = conversionaryData.json || [];
    if (Array.isArray(msgs) && msgs.length > 0) {
      context += '\\n=== ÚLTIMAS MENSAGENS ===\\n';
      // Reverse to show chronologically
      const sortedMsgs = msgs.slice().reverse();
      sortedMsgs.forEach(m => {
        const who = m.is_from_me ? (m.sent_by_user_name || 'Agente') : (m.sender_name || 'Cliente');
        const body = (m.body || '').substring(0, 200);
        context += '[' + who + ']: ' + body + '\\n';
      });
    }
  }
} catch(e) {
  // No conversation node or empty response
}

context += '\\n=== AGENTE RESPONSÁVEL ===\\n';
context += 'Nome: ' + agent.nome + '\\n';
if (agent.telefone) context += 'Tel: ' + agent.telefone + '\\n';
if (agent.email) context += 'Email: ' + agent.email + '\\n';

// Build system prompt based on restricoes
const restricoes = webhook.ia_restricoes || {};
let systemPrompt = 'Você é ' + agent.nome + ', consultor de viagens da Welcome Trips. ';
systemPrompt += 'Você deve gerar UMA mensagem WhatsApp para o cliente. ';

if (restricoes.tom) {
  systemPrompt += 'Tom: ' + restricoes.tom + '. ';
}
if (restricoes.max_caracteres) {
  systemPrompt += 'Máximo ' + restricoes.max_caracteres + ' caracteres. ';
}
if (restricoes.idioma) {
  systemPrompt += 'Idioma: ' + restricoes.idioma + '. ';
}
if (restricoes.proibido && restricoes.proibido.length > 0) {
  systemPrompt += 'NUNCA mencione: ' + restricoes.proibido.join(', ') + '. ';
}
if (restricoes.deve_incluir && restricoes.deve_incluir.length > 0) {
  systemPrompt += 'DEVE incluir: ' + restricoes.deve_incluir.join(', ') + '. ';
}

systemPrompt += 'Responda APENAS com o texto da mensagem, sem aspas, sem prefixos, sem formatação. ';
systemPrompt += 'Máximo uma parágrafo.';

const userPrompt = (webhook.ia_prompt || 'Envie uma mensagem amigável ao cliente') + '\\n\\nContexto:\\n' + context;

return [{
  json: {
    systemPrompt,
    userPrompt,
    execucao_id: webhook.execucao_id,
    card_id: webhook.card_id,
    contact_id: webhook.contact_id,
    context_snapshot: context.substring(0, 2000)
  }
}];`;

const CODE_CALLBACK = `// Prepare callback to Supabase
const contextNode = $('6. Assemble Context').first().json;
const aiOutput = $('7. Generate Message').first().json;

let geradoText = '';
try {
  // Try to extract from different possible response formats
  if (aiOutput.message && aiOutput.message[0]?.content) {
    geradoText = aiOutput.message[0].content;
  } else if (aiOutput.choices && aiOutput.choices[0]?.message?.content) {
    geradoText = aiOutput.choices[0].message.content;
  } else if (typeof aiOutput === 'string') {
    geradoText = aiOutput;
  } else if (aiOutput.text) {
    geradoText = aiOutput.text;
  }
} catch(e) {
  geradoText = 'Erro ao gerar mensagem. Tente novamente.';
}

// Trim and ensure it's not too long
geradoText = (geradoText || '').trim().substring(0, 1000);

return [{
  json: {
    corpo_ia_gerado: geradoText,
    ia_contexto_usado: contextNode.context_snapshot,
    status: 'pending',
    execucao_id: contextNode.execucao_id,
    card_id: contextNode.card_id,
    contact_id: contextNode.contact_id
  }
}];`;

const CODE_RESPOSTA = `// Final response to webhook
try {
  return [{
    json: {
      success: true,
      corpo_gerado: $('8. Prepare Callback').first().json.corpo_ia_gerado
    }
  }];
} catch(e) {
  return [{
    json: {
      success: false,
      erro: e.message
    }
  }];
}`;

function buildWorkflow() {
  const nodes = [
    // 1. Webhook
    {
      parameters: {
        path: 'automacao-gerar-mensagem',
        responseMode: 'responseNode',
        responseData: 'first',
        options: {}
      },
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 200]
    },

    // 2. Fetch Card
    {
      parameters: {
        method: 'GET',
        url: SUPABASE_URL + '/rest/v1/cards?id=eq.{{ $json.card_id }}&select=titulo,produto,data_viagem_inicio,data_viagem_fim,valor_estimado,valor_final,briefing_inicial,dono_atual_id,pipeline_stage_id',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'apikey',
              value: SUPABASE_CREDENTIAL.id
            },
            {
              name: 'Accept',
              value: 'application/json'
            }
          ]
        }
      },
      name: '2. Fetch Card',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [250, 50],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 3. Fetch Contact
    {
      parameters: {
        method: 'GET',
        url: SUPABASE_URL + '/rest/v1/contatos?id=eq.{{ $json.contact_id }}&select=nome,sobrenome,tipo_cliente,tags,data_nascimento',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'apikey',
              value: SUPABASE_CREDENTIAL.id
            },
            {
              name: 'Accept',
              value: 'application/json'
            }
          ]
        }
      },
      name: '3. Fetch Contact',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [250, 150],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 4. Fetch Agent
    {
      parameters: {
        method: 'GET',
        url: SUPABASE_URL + '/rest/v1/profiles?id=eq.{{ $("2. Fetch Card").first().json[0].dono_atual_id }}&select=nome,email,telefone',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'apikey',
              value: SUPABASE_CREDENTIAL.id
            },
            {
              name: 'Accept',
              value: 'application/json'
            }
          ]
        }
      },
      name: '4. Fetch Agent',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [250, 250],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 5. Fetch Conversation (conditional - only if enabled in config)
    {
      parameters: {
        method: 'GET',
        url: SUPABASE_URL + '/rest/v1/whatsapp_messages?contact_id=eq.{{ $json.contact_id }}&order=created_at.desc&limit={{ ($json.ia_contexto_config?.conversa_limite || 30) }}&select=body,direction,is_from_me,sender_name,sent_by_user_name,created_at',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'apikey',
              value: SUPABASE_CREDENTIAL.id
            },
            {
              name: 'Accept',
              value: 'application/json'
            }
          ]
        }
      },
      name: '5. Fetch Conversation',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [250, 350],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 6. Code: Assemble Context
    {
      parameters: {
        jsCode: CODE_MONTA_CONTEXTO,
        options: {}
      },
      name: '6. Assemble Context',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [500, 150]
    },

    // 7. Generate Message via OpenAI (n8n native node with managed credential)
    {
      parameters: {
        resource: 'chat',
        operation: 'message',
        model: { __rl: true, mode: 'list', value: 'gpt-4o' },
        messages: {
          values: [
            { role: 'system', content: '={{ $json.systemPrompt }}' },
            { role: 'user', content: '={{ $json.userPrompt }}' },
          ],
        },
        options: {
          temperature: 0.7,
          maxTokens: 500,
        },
      },
      name: '7. Generate Message',
      type: '@n8n/n8n-nodes-langchain.openAi',
      typeVersion: 1.7,
      credentials: { openAiApi: OPENAI_CREDENTIAL },
      position: [750, 150],
    },

    // 8. Code: Prepare Callback
    {
      parameters: {
        jsCode: CODE_CALLBACK,
        options: {}
      },
      name: '8. Prepare Callback',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1000, 150]
    },

    // 9. Update automacao_execucoes (PATCH)
    {
      parameters: {
        method: 'PATCH',
        url: SUPABASE_URL + '/rest/v1/automacao_execucoes?id=eq.{{ $json.execucao_id }}',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'apikey',
              value: SUPABASE_CREDENTIAL.id
            },
            {
              name: 'Accept',
              value: 'application/json'
            },
            {
              name: 'Content-Type',
              value: 'application/json'
            }
          ]
        },
        sendBody: true,
        bodyParametersUi: 'json',
        body: {
          corpo_ia_gerado: '={{ $json.corpo_ia_gerado }}',
          ia_contexto_usado: '={{ $json.ia_contexto_usado }}',
          status: '={{ $json.status }}'
        }
      },
      name: '9. Update automacao_execucoes',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1250, 150],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 10. Code: Final Response
    {
      parameters: {
        jsCode: CODE_RESPOSTA,
        options: {}
      },
      name: '10. Final Response',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1500, 150]
    },

    // 11. Respond to Webhook
    {
      parameters: {
        responseMode: 'responseNode'
      },
      name: '11. Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1750, 150]
    }
  ];

  const connections = {
    'Webhook': {
      main: [[
        { node: '2. Fetch Card', type: 'main', index: 0 },
        { node: '3. Fetch Contact', type: 'main', index: 0 },
        { node: '4. Fetch Agent', type: 'main', index: 0 },
        { node: '5. Fetch Conversation', type: 'main', index: 0 }
      ]]
    },
    '2. Fetch Card': {
      main: [[
        { node: '6. Assemble Context', type: 'main', index: 0 }
      ]]
    },
    '3. Fetch Contact': {
      main: [[
        { node: '6. Assemble Context', type: 'main', index: 0 }
      ]]
    },
    '4. Fetch Agent': {
      main: [[
        { node: '6. Assemble Context', type: 'main', index: 0 }
      ]]
    },
    '5. Fetch Conversation': {
      main: [[
        { node: '6. Assemble Context', type: 'main', index: 0 }
      ]]
    },
    '6. Assemble Context': {
      main: [[
        { node: '7. Generate Message', type: 'main', index: 0 }
      ]]
    },
    '7. Generate Message': {
      main: [[
        { node: '8. Prepare Callback', type: 'main', index: 0 }
      ]]
    },
    '8. Prepare Callback': {
      main: [[
        { node: '9. Update automacao_execucoes', type: 'main', index: 0 }
      ]]
    },
    '9. Update automacao_execucoes': {
      main: [[
        { node: '10. Final Response', type: 'main', index: 0 }
      ]]
    },
    '10. Final Response': {
      main: [[
        { node: '11. Respond to Webhook', type: 'main', index: 0 }
      ]]
    }
  };

  return {
    name: 'Automação - Gerar Mensagem IA',
    nodes,
    connections,
    settings: {
      executionOrder: 'v1'
    }
  };
}

// ============================================================================
// DEPLOY
// ============================================================================

async function main() {
  const workflow = buildWorkflow();

  console.log(`\n📝 Deploying workflow "${workflow.name}"...`);

  try {
    // Check if workflow exists
    const listRes = await fetch(`${N8N_API_URL}/api/v1/workflows?name=Automação - Gerar Mensagem IA`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const listData = await listRes.json();
    let workflowId;

    if (listData.data && listData.data.length > 0) {
      // Update existing
      workflowId = listData.data[0].id;
      console.log(`⚡ Found existing workflow: ${workflowId}`);

      const updateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}`, {
        method: 'PUT',
        headers: {
          'X-N8N-API-KEY': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: workflow.name,
          nodes: workflow.nodes,
          connections: workflow.connections,
          settings: workflow.settings
        })
      });

      if (updateRes.ok) {
        const result = await updateRes.json();
        console.log(`✅ Workflow updated: ${result.id}`);
      } else {
        throw new Error(`Failed to update workflow: ${updateRes.statusText}`);
      }
    } else {
      // Create new
      const createRes = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
        method: 'POST',
        headers: {
          'X-N8N-API-KEY': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(workflow)
      });

      if (createRes.ok) {
        const result = await createRes.json();
        workflowId = result.id;
        console.log(`✅ Workflow created: ${workflowId}`);
      } else {
        throw new Error(`Failed to create workflow: ${createRes.statusText}`);
      }
    }

    // Activate workflow
    const activateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });

    if (activateRes.ok) {
      const activateData = await activateRes.json();
      console.log(`⚡ Workflow ${activateData.active ? 'activated ✓' : 'inactive ✗'}`);
    }

    console.log(`\n🔗 Webhook URL: ${N8N_API_URL}/webhook/automacao-gerar-mensagem`);
    console.log(`📋 Editor: ${N8N_API_URL}/workflow/${workflowId}`);

    console.log(`\n📌 Prerequisites:`);
    console.log(`   1. ✓ WelcomeSupabase credential (supabaseApi) configured in n8n`);
    console.log(`   2. ✓ OpenAI credential managed by n8n (id: ${OPENAI_CREDENTIAL.id})`);
    console.log(`   3. Tables required: cards, contatos, profiles, whatsapp_messages, automacao_execucoes`);

    console.log(`\n📤 Expected webhook payload:`);
    console.log(JSON.stringify({
      card_id: 'uuid-here',
      contact_id: 'uuid-here',
      execucao_id: 'uuid-here',
      ia_prompt: 'Gere follow-up amigável...',
      ia_contexto_config: {
        conversa: true,
        conversa_limite: 30,
        briefing: true
      },
      ia_restricoes: {
        max_caracteres: 500,
        tom: 'informal_caloroso',
        proibido: ['preço']
      }
    }, null, 2));

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
