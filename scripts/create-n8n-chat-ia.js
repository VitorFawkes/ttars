#!/usr/bin/env node
/**
 * Create "Chat IA — Conversas" workflow in n8n
 *
 * Receives a question from the consultant about a client's WhatsApp
 * conversation history. Fetches all messages, card context and contact
 * info, then uses GPT to answer the question.
 *
 * Flow: Webhook → Set → Card → Contato → Mensagens → Code(context) → Agent → Code(format)
 *
 * Usage: source .env && node scripts/create-n8n-chat-ia.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';
const TARGET_WORKFLOW_ID = 'Huo62PptqGDrARtu'; // Existing Chat IA workflow to update

// Credential IDs from existing workflows
const SUPABASE_CREDENTIAL = { id: 'SXzk2uSaw8b7BcaN', name: 'WelcomeSupabase' };
const OPENAI_CREDENTIAL = { id: 'ZLg8WpP4UNXepE8g', name: 'Vitor TESTE' };

if (!API_KEY) {
  console.error('N8N_API_KEY is required.');
  console.error('Usage: source .env && node scripts/create-n8n-chat-ia.js');
  process.exit(1);
}

// ============================================================================
// AI PROMPTS
// ============================================================================

const SYSTEM_PROMPT = `Voce e um assistente de CRM da Welcome Trips, uma agencia premium de viagens que atua em tres frentes principais: Destination Weddings (casamentos no destino com convidados), Viagens Corporativas (reservas de hotel, voo e transfer para empresas), e Viagens Personalizadas (lazer e experiencias sob medida).

Sua funcao e responder perguntas dos consultores sobre o historico de conversas com clientes no WhatsApp, ajudando-os a retomar contextos, localizar informacoes e preparar proximos passos.

## CONTEXTO DO NEGOCIO

- O pipeline de vendas segue: Captacao (SDR) → Planejamento (Planner) → Pos-Venda
- Consultores frequentemente precisam localizar: datas de check-in/check-out, preferencias de hotel, orcamentos mencionados, restricoes do cliente, decisoes pendentes vs confirmadas
- A agente Julia (IA) pode ter enviado mensagens automaticas — identifique-as pelo padrao "Mensagem automatica" ou pelo tom padronizado
- Clientes enviam audios, imagens de documentos, vouchers — as transcricoes e descricoes ficam no campo media_content
- Mensagens de template/cadencia sao disparos em massa — nao confundir com conversa real
- Em Destination Weddings, o cliente e um convidado e nao necessariamente quem organiza o evento

## REGRAS ABSOLUTAS

1. Responda EXCLUSIVAMENTE com base no historico de conversas fornecido. NUNCA use conhecimento externo
2. NUNCA invente, suponha ou infira informacoes que nao estejam EXPLICITAMENTE nas mensagens. Se voce nao tem certeza absoluta, diga que nao encontrou
3. Se a informacao nao esta no historico, diga claramente: "Nao encontrei essa informacao nas conversas." — NUNCA tente deduzir ou completar com suposicoes
4. Cite datas e horarios (Sao Paulo) quando relevante (ex: "Em 15/02 as 14:30, o cliente disse...")
5. Diferencie quem disse o que: cliente vs consultor vs Julia (IA)
6. Se houver informacoes contraditoras, mencione ambas e destaque a mais recente
7. Para resumos, organize cronologicamente e destaque decisoes, valores e pendencias
8. Inclua transcricoes de audio e descricoes de midia quando relevantes
9. Ignore mensagens de teste, lixo ou automaticas repetidas — foque no conteudo real
10. Quando o consultor perguntar algo vago como "me atualiza", faca um resumo executivo focando em: (a) o que o cliente quer, (b) o que foi acordado, (c) o que esta pendente
11. Todos os horarios nas conversas estao no fuso de Sao Paulo (UTC-3). Cite sempre nesse fuso

## TOM
- Profissional, conciso e direto
- Fale como um colega de equipe que leu todas as conversas
- Cite a fonte quando necessario: "No dia [data], [quem] mencionou..."

## FORMATO
Responda em texto natural, em portugues. Use marcadores para listar multiplos pontos. Nao use JSON.`;

// ============================================================================
// CODE NODE SCRIPTS
// ============================================================================

// Receives all message items from the HTTP node + references card & contact nodes
const CODE_MONTA_CONTEXTO = `// Monta contexto para o AI Chat
const params = $('1. Extrai Params').first().json;
const cardData = $('2. Busca Card').first().json;
const contactData = $('3. Busca Contato').first().json;
const messagesRaw = $input.all().map(i => i.json);

const card = cardData || {};
const contact = contactData || {};
const question = params.question;

// Parse chat_history
let chatHistory = [];
try {
  const raw = params.chat_history;
  if (typeof raw === 'string' && raw.startsWith('[')) {
    chatHistory = JSON.parse(raw);
  } else if (Array.isArray(raw)) {
    chatHistory = raw;
  }
} catch(e) { chatHistory = []; }

// Format messages into readable text
const messages = messagesRaw.filter(m => m.body || m.media_content);
const totalMessages = messages.length;

if (totalMessages === 0) {
  return [{ json: {
    question,
    total_messages: 0,
    card_context: '',
    contact_context: '',
    conversation_text: '(Nenhuma mensagem de WhatsApp encontrada para este contato)',
    chat_history_text: '',
    card_id: params.card_id
  }}];
}

let conversationText = '';
let lastDate = '';

for (const msg of messages) {
  if (!msg.created_at) continue;

  const date = new Date(msg.created_at);
  const dateStr = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  if (dateStr !== lastDate) {
    conversationText += '\\n--- ' + dateStr + ' ---\\n';
    lastDate = dateStr;
  }

  let sender;
  if (msg.direction === 'inbound' || msg.is_from_me === false) {
    // Distinguish travelers by contact_id (different from primary contact)
    const isPrimary = !msg.contact_id || msg.contact_id === contact.id;
    const nameLabel = msg.sender_name || contact.nome || 'Cliente';
    sender = isPrimary ? nameLabel : (nameLabel + ' (Acompanhante)');
  } else {
    sender = msg.sent_by_user_name || 'Equipe';
  }

  let content = '';
  if (msg.media_content) {
    const mediaLabel = msg.message_type === 'audio' ? '[Audio transcrito]'
      : msg.message_type === 'image' ? '[Imagem]'
      : msg.message_type === 'document' ? '[Documento]'
      : msg.message_type === 'video' ? '[Video]'
      : '[Midia]';
    content += mediaLabel + ' ' + msg.media_content;
    if (msg.body && msg.body !== msg.media_content) {
      content += '\\n' + msg.body;
    }
  } else if (msg.body) {
    content = msg.body;
  }

  if (!content.trim()) continue;
  content = content.replace(/---BUTTONS---[\\\\s\\\\S]*/g, '').trim();
  conversationText += '[' + timeStr + '] ' + sender + ': ' + content + '\\n';
}

// Truncate if too long (~80k chars ~ 20k tokens)
const MAX_CHARS = 80000;
if (conversationText.length > MAX_CHARS) {
  const truncated = conversationText.slice(-MAX_CHARS);
  const firstNewline = truncated.indexOf('\\n');
  conversationText = '... (mensagens anteriores omitidas por limite)\\n' +
    truncated.slice(firstNewline > 0 ? firstNewline : 0);
}

let cardContext = '';
if (card.titulo) cardContext += 'Titulo do card: ' + card.titulo + '\\n';
if (card.pipeline_stages?.nome) cardContext += 'Etapa: ' + card.pipeline_stages.nome + '\\n';
if (card.pipeline_stages?.fase) cardContext += 'Fase: ' + card.pipeline_stages.fase + '\\n';
if (card.ai_resumo) cardContext += 'Resumo IA: ' + card.ai_resumo + '\\n';

let contactContext = '';
if (contact.nome) contactContext += 'Nome: ' + contact.nome + '\\n';
if (contact.email) contactContext += 'Email: ' + contact.email + '\\n';
if (contact.telefone) contactContext += 'Telefone: ' + contact.telefone + '\\n';
if (contact.tipo_cliente) contactContext += 'Tipo: ' + contact.tipo_cliente + '\\n';

let historyText = '';
if (chatHistory.length > 0) {
  historyText = '\\n## CONVERSA ANTERIOR COM O CONSULTOR\\n';
  for (const msg of chatHistory.slice(-10)) {
    historyText += (msg.role === 'user' ? 'Consultor' : 'Assistente') + ': ' + msg.content + '\\n';
  }
}

console.log('[ChatIA] Mensagens: ' + totalMessages + ', Contexto: ' + conversationText.length + ' chars');

return [{ json: {
  question,
  total_messages: totalMessages,
  card_context: cardContext,
  contact_context: contactContext,
  conversation_text: conversationText,
  chat_history_text: historyText,
  card_id: params.card_id
}}];`;

const CODE_FORMATA_RESPOSTA = `// Formata resposta final
const contextData = $('4. Monta Contexto').first().json;
let aiOutput = '';
try {
  aiOutput = $('5. AI Chat').first().json.output || '';
} catch(e) {
  aiOutput = 'Desculpe, nao consegui processar sua pergunta. Tente novamente.';
}

return [{ json: {
  answer: aiOutput.trim() || 'Nao consegui gerar uma resposta. Tente reformular sua pergunta.',
  sources_count: contextData.total_messages || 0,
  card_id: contextData.card_id || ''
}}];`;

// ============================================================================
// WORKFLOW DEFINITION
// ============================================================================

function buildWorkflow() {
  const nodes = [
    // 0. Webhook
    {
      parameters: {
        httpMethod: 'POST',
        path: 'chat-ia',
        responseMode: 'lastNode',
        options: {}
      },
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300],
      webhookId: 'chat-ia'
    },

    // 1. Set: Extract params
    {
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments: [
            { id: 'card_id', name: 'card_id', value: '={{ $json.body.card_id }}', type: 'string' },
            { id: 'contact_id', name: 'contact_id', value: '={{ $json.body.contact_id }}', type: 'string' },
            { id: 'question', name: 'question', value: '={{ $json.body.question }}', type: 'string' },
            { id: 'chat_history', name: 'chat_history', value: '={{ JSON.stringify($json.body.chat_history || []) }}', type: 'string' }
          ]
        },
        options: {}
      },
      name: '1. Extrai Params',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [260, 300]
    },

    // 2. HTTP Request: Busca Card (returns 1 item)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards?id=eq.{{ $json.card_id }}&select=id,titulo,ai_resumo,ai_contexto,pipeline_stages(nome,fase)`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '2. Busca Card',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [520, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      alwaysOutputData: true
    },

    // 3. HTTP Request: Busca Contato (returns 1 item)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/contatos?id=eq.{{ $('1. Extrai Params').item.json.contact_id }}&select=nome,email,telefone,tipo_cliente`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '3. Busca Contato',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [780, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      alwaysOutputData: true
    },

    // 3b. HTTP Request: Busca Mensagens WhatsApp (returns N items, or 1 empty item)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/whatsapp_messages?card_id=eq.{{ $('1. Extrai Params').item.json.card_id }}&select=body,direction,is_from_me,sender_name,sent_by_user_name,contact_id,message_type,media_content,created_at&order=created_at.asc&limit=500`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '3b. Busca Mensagens',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1040, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      alwaysOutputData: true
    },

    // 4. Code: Monta Contexto — aggregates all message items + card + contact
    {
      parameters: {
        jsCode: CODE_MONTA_CONTEXTO,
        options: {}
      },
      name: '4. Monta Contexto',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1300, 300]
    },

    // 5. Agent: AI Chat
    {
      parameters: {
        promptType: 'define',
        text: `=## DADOS DO CARD/CLIENTE
{{ $json.card_context }}
{{ $json.contact_context }}

## HISTORICO COMPLETO DE CONVERSAS WHATSAPP ({{ $json.total_messages }} mensagens)
{{ $json.conversation_text }}
{{ $json.chat_history_text }}

## PERGUNTA DO CONSULTOR
{{ $json.question }}

Responda a pergunta acima com base EXCLUSIVAMENTE no historico de conversas fornecido. Se a resposta nao estiver nas mensagens, diga que nao encontrou. NUNCA invente informacoes.`,
        options: {
          systemMessage: SYSTEM_PROMPT
        }
      },
      name: '5. AI Chat',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 2.2,
      position: [1560, 300]
    },

    // 5b. LLM: GPT-5.1 (máxima qualidade + zero alucinação)
    {
      parameters: {
        model: { __rl: true, value: 'gpt-5.1', mode: 'list', cachedResultName: 'gpt-5.1' },
        options: {
          temperature: 0
        }
      },
      name: 'GPT-5.1',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      typeVersion: 1.2,
      position: [1560, 520],
      credentials: { openAiApi: OPENAI_CREDENTIAL }
    },

    // 6. Code: Formata Resposta
    {
      parameters: {
        jsCode: CODE_FORMATA_RESPOSTA,
        options: {}
      },
      name: '6. Formata Resposta',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1820, 300]
    }
  ];

  const connections = {
    'Webhook': {
      main: [[
        { node: '1. Extrai Params', type: 'main', index: 0 }
      ]]
    },
    '1. Extrai Params': {
      main: [[
        { node: '2. Busca Card', type: 'main', index: 0 }
      ]]
    },
    '2. Busca Card': {
      main: [[
        { node: '3. Busca Contato', type: 'main', index: 0 }
      ]]
    },
    '3. Busca Contato': {
      main: [[
        { node: '3b. Busca Mensagens', type: 'main', index: 0 }
      ]]
    },
    '3b. Busca Mensagens': {
      main: [[
        { node: '4. Monta Contexto', type: 'main', index: 0 }
      ]]
    },
    '4. Monta Contexto': {
      main: [[
        { node: '5. AI Chat', type: 'main', index: 0 }
      ]]
    },
    '5. AI Chat': {
      main: [[
        { node: '6. Formata Resposta', type: 'main', index: 0 }
      ]]
    },
    'GPT-5.1': {
      ai_languageModel: [[
        { node: '5. AI Chat', type: 'ai_languageModel', index: 0 }
      ]]
    }
  };

  return {
    name: 'Welcome CRM - Chat IA Conversas',
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

  console.log(`Atualizando workflow "${workflow.name}" (ID: ${TARGET_WORKFLOW_ID})...`);

  let result;
  let existing = null;

  // Try to update existing workflow by ID first
  if (TARGET_WORKFLOW_ID) {
    existing = { id: TARGET_WORKFLOW_ID };
    console.log(`Workflow encontrado (ID: ${existing.id}). Atualizando...`);
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows/${existing.id}`, {
      method: 'PATCH',
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings
      })
    });
    result = await res.json();
    console.log(`Workflow atualizado: ${result.id}`);
  } else {
    console.log('Criando novo workflow...');
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflow)
    });
    result = await res.json();
    console.log(`Workflow criado: ${result.id}`);
  }

  // Activate
  const workflowId = result.id || existing?.id;
  if (workflowId) {
    const activateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}/activate`, {
      method: 'POST',
      headers: { 'x-n8n-api-key': API_KEY }
    });
    const activateData = await activateRes.json();
    console.log(`Workflow ${activateData.active ? 'ativado' : 'inativo'}`);
    console.log(`\nWebhook URL: ${N8N_API_URL}/webhook/chat-ia`);
    console.log(`Editor: ${N8N_API_URL}/workflow/${workflowId}`);
  }

  // Cleanup old duplicate workflows
  const duplicates = listData.data?.filter(w => w.name === workflow.name && w.id !== workflowId) || [];
  for (const dup of duplicates) {
    console.log(`Removendo workflow duplicado: ${dup.id}`);
    await fetch(`${N8N_API_URL}/api/v1/workflows/${dup.id}`, {
      method: 'DELETE',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
  }

  console.log('\nPre-requisitos:');
  console.log('   1. Credential "WelcomeSupabase" (supabaseApi) configurada');
  console.log('   2. Credential "Vitor TESTE" (openAiApi) configurada');
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
