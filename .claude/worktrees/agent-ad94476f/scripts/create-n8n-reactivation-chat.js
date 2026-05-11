#!/usr/bin/env node
/**
 * Create "Chat IA — Reativação" workflow in n8n
 *
 * Receives questions about reactivation patterns and client intelligence.
 * The frontend sends the context (top 30 clients data) directly in the payload,
 * so no DB queries are needed — just the AI Agent.
 *
 * Flow: Webhook → Set → Code(context) → Agent → Code(format)
 *
 * Usage: source .env && node scripts/create-n8n-reactivation-chat.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;

// Credential IDs from existing workflows
const OPENAI_CREDENTIAL = { id: 'ZLg8WpP4UNXepE8g', name: 'Vitor TESTE' };

if (!API_KEY) {
  console.error('N8N_API_KEY is required.');
  console.error('Usage: source .env && node scripts/create-n8n-reactivation-chat.js');
  process.exit(1);
}

const SYSTEM_PROMPT = `Você é o assistente de reativação de clientes da Welcome Trips, uma agência premium de viagens personalizadas.

## SEU PAPEL
Você ajuda os consultores a identificar quais clientes devem ser contatados, quando e como. Você recebe dados reais de padrões de viagem dos clientes e responde perguntas sobre eles.

## CONTEXTO DO NEGÓCIO
- Welcome Trips vende viagens personalizadas de alto valor (R$10k-200k por viagem)
- Clientes são pessoas físicas que viajam com família
- O ciclo de venda é consultivo: lead → briefing → proposta → fechamento → pós-venda
- Viagens frequentes: clientes bons viajam 1-3x por ano
- Sazonalidade: férias escolares (Jan, Jul, Dez) são picos
- Lead time: clientes começam a planejar 2-4 meses antes da viagem

## DADOS QUE VOCÊ RECEBE
Para cada contato, você recebe: score de reativação (0-100), frequência de viagem, ticket médio, última viagem (dias atrás), janela de contato (dias até o momento ideal), meses preferidos, destinos anteriores, número de acompanhantes, aniversário, indicações feitas, presentes recebidos, e se é alto valor.

## COMO RESPONDER
1. Seja DIRETO e ACIONÁVEL — o consultor quer saber "quem ligar e o que falar"
2. Quando listar clientes, ordene por prioridade
3. Sugira abordagens específicas: "Ligue oferecendo [destino] para [mês], mencione [contexto pessoal]"
4. Se o cliente faz aniversário em breve, sugira presente ou ligação de parabéns
5. Se nunca recebeu presente, sugira enviar um como primeiro touchpoint
6. Se é alto valor e está atrasado, trate como URGENTE
7. Se indicou clientes, reconheça e valorize isso na abordagem
8. Considere os acompanhantes — viagem em família tem dinâmica diferente de casal

## FORMATO
- Responda em português
- Use listas numeradas para recomendações
- Seja conciso mas completo
- Nunca invente dados — use apenas o que foi fornecido no contexto`;

const CODE_MONTA_CONTEXTO = `// Monta contexto para o AI Agent
const params = $('1. Extrai Params').first().json;

let chatHistory = [];
try {
  const raw = params.chat_history;
  if (typeof raw === 'string' && raw.startsWith('[')) {
    chatHistory = JSON.parse(raw);
  } else if (Array.isArray(raw)) {
    chatHistory = raw;
  }
} catch(e) { chatHistory = []; }

let historyText = '';
if (chatHistory.length > 0) {
  historyText = '\\n## CONVERSA ANTERIOR\\n';
  for (const msg of chatHistory.slice(-10)) {
    historyText += (msg.role === 'user' ? 'Consultor' : 'Assistente') + ': ' + msg.content + '\\n';
  }
}

return [{ json: {
  question: params.question,
  context: params.context || '(sem dados de contatos)',
  total_contacts: params.total_contacts || 0,
  chat_history_text: historyText
}}];`;

const CODE_FORMATA_RESPOSTA = `// Formata resposta final
let aiOutput = '';
try {
  aiOutput = $('3. AI Agent').first().json.output || '';
} catch(e) {
  aiOutput = 'Desculpe, não consegui processar sua pergunta. Tente novamente.';
}

return [{ json: {
  answer: aiOutput.trim() || 'Não consegui gerar uma resposta. Tente reformular.',
}}];`;

function buildWorkflow() {
  const nodes = [
    // Webhook
    {
      parameters: {
        httpMethod: 'POST',
        path: 'reactivation-chat',
        responseMode: 'lastNode',
        options: {}
      },
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300],
      webhookId: 'reactivation-chat'
    },

    // 1. Set: Extract params
    {
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments: [
            { id: 'question', name: 'question', value: '={{ $json.body.question }}', type: 'string' },
            { id: 'context', name: 'context', value: '={{ $json.body.context || "" }}', type: 'string' },
            { id: 'total_contacts', name: 'total_contacts', value: '={{ $json.body.total_contacts || 0 }}', type: 'number' },
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

    // 2. Code: Monta Contexto
    {
      parameters: {
        jsCode: CODE_MONTA_CONTEXTO,
        options: {}
      },
      name: '2. Monta Contexto',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [520, 300]
    },

    // 3. AI Agent
    {
      parameters: {
        promptType: 'define',
        text: `=## DADOS DOS CLIENTES PARA REATIVAÇÃO ({{ $json.total_contacts }} contatos analisados)

Cada linha é um contato com seus dados separados por |:
{{ $json.context }}
{{ $json.chat_history_text }}

## PERGUNTA DO CONSULTOR
{{ $json.question }}

Responda com base EXCLUSIVAMENTE nos dados fornecidos acima. Se a informação não está nos dados, diga que não tem essa informação.`,
        options: {
          systemMessage: SYSTEM_PROMPT
        }
      },
      name: '3. AI Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 2.2,
      position: [780, 300]
    },

    // LLM
    {
      parameters: {
        model: { __rl: true, value: 'gpt-4o', mode: 'list', cachedResultName: 'gpt-4o' },
        options: {
          temperature: 0.3
        }
      },
      name: 'GPT-4o',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      typeVersion: 1.2,
      position: [780, 520],
      credentials: { openAiApi: OPENAI_CREDENTIAL }
    },

    // 4. Code: Formata Resposta
    {
      parameters: {
        jsCode: CODE_FORMATA_RESPOSTA,
        options: {}
      },
      name: '4. Formata Resposta',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1040, 300]
    }
  ];

  const connections = {
    'Webhook': {
      main: [[{ node: '1. Extrai Params', type: 'main', index: 0 }]]
    },
    '1. Extrai Params': {
      main: [[{ node: '2. Monta Contexto', type: 'main', index: 0 }]]
    },
    '2. Monta Contexto': {
      main: [[{ node: '3. AI Agent', type: 'main', index: 0 }]]
    },
    '3. AI Agent': {
      main: [[{ node: '4. Formata Resposta', type: 'main', index: 0 }]]
    },
    'GPT-4o': {
      ai_languageModel: [[{ node: '3. AI Agent', type: 'ai_languageModel', index: 0 }]]
    }
  };

  return {
    name: 'Welcome CRM - Chat IA Reativação',
    nodes,
    connections,
    settings: { executionOrder: 'v1' }
  };
}

async function main() {
  const workflow = buildWorkflow();

  console.log(`Criando workflow "${workflow.name}"...`);

  const res = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(workflow)
  });
  const result = await res.json();

  if (result.id) {
    console.log(`Workflow criado: ${result.id}`);

    // Ativar
    const activateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${result.id}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const activateData = await activateRes.json();
    console.log(`Workflow ${activateData.active ? 'ATIVADO' : 'inativo'}`);
    console.log(`\nWebhook URL: ${N8N_API_URL}/webhook/reactivation-chat`);
    console.log(`Editor: ${N8N_API_URL}/workflow/${result.id}`);
  } else {
    console.error('Erro ao criar:', JSON.stringify(result, null, 2));
  }
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
