#!/usr/bin/env node
/**
 * Create "Teams Notification" workflow in n8n
 *
 * Sends Adaptive Card to Microsoft Teams channel when a TRIPS card is assigned.
 * Flow: Webhook → Extract params → Busca Card → Busca Dono → Busca Etapa → Busca Contato → Format+Send
 *
 * Usage: export $(grep -v '^#' .env | xargs) && node scripts/create-n8n-teams-notification.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';

const TARGET_WORKFLOW_ID = 'YnjVcJVdj653vpEn';
const SUPABASE_CREDENTIAL = { id: 'SXzk2uSaw8b7BcaN', name: 'WelcomeSupabase' };

if (!API_KEY) {
  console.error('N8N_API_KEY is required.');
  process.exit(1);
}

// ============================================================================
// CODE NODE: Format Adaptive Card + POST to Teams
// ============================================================================

const CODE_FORMAT_AND_SEND = `
const params = $('1. Extrai Params').first().json;
const teamsUrl = params.teams_webhook_url;

// Cada HTTP Request node retorna o primeiro item do array PostgREST
const card = $('2. Busca Card').first().json;
const dono = $('3. Busca Dono').first().json;
const etapa = $('4. Busca Etapa').first().json;
const contato = $('5. Busca Contato').first().json;

if (!card || !card.id) {
  return [{ json: { status: 'error', message: 'Card nao encontrado' } }];
}

const contatoNome = contato && contato.nome
  ? [contato.nome, contato.sobrenome].filter(Boolean).join(' ')
  : 'Sem contato';

const donoNome = dono && dono.nome ? dono.nome : 'Nao atribuido';
const donoEmail = dono ? dono.email : null;
const etapaNome = etapa && etapa.nome ? etapa.nome : 'Sem etapa';

const valor = card.valor_final || card.valor_estimado || 0;
const valorFormatado = 'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const crmUrl = 'https://crmtars.vercel.app/cards/' + card.id;

// Adaptive Card com info do lead
const mentionText = donoEmail ? '<at>' + donoNome + '</at>' : donoNome;
const mentionEntities = donoEmail ? [{
  type: 'mention',
  text: '<at>' + donoNome + '</at>',
  mentioned: { id: donoEmail, name: donoNome }
}] : [];

const payload = {
  type: 'message',
  attachments: [{
    contentType: 'application/vnd.microsoft.card.adaptive',
    contentUrl: null,
    content: {
      type: 'AdaptiveCard',
      '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4',
      msteams: { entities: mentionEntities },
      body: [
        {
          type: 'TextBlock',
          size: 'Medium',
          weight: 'Bolder',
          text: 'Novo Lead Atribuido - TRIPS'
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Card', value: card.titulo || 'Sem titulo' },
            { title: 'Contato', value: contatoNome },
            { title: 'Atribuido a', value: mentionText },
            { title: 'Etapa', value: etapaNome },
            { title: 'Valor', value: valorFormatado }
          ]
        },
        {
          type: 'ActionSet',
          actions: [{
            type: 'Action.OpenUrl',
            title: 'Abrir no CRM',
            url: crmUrl
          }]
        }
      ]
    }
  }]
};

try {
  const teamsRes = await this.helpers.httpRequest({
    method: 'POST',
    url: teamsUrl,
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    returnFullResponse: true
  });
  return [{ json: { status: 'sent', card_id: card.id, dono: donoNome, contato: contatoNome, teams_status: teamsRes.statusCode } }];
} catch(e) {
  return [{ json: { status: 'teams_error', card_id: card.id, error: e.message } }];
}
`;

// ============================================================================
// WORKFLOW DEFINITION — sequential chain, no parallel branches
// ============================================================================

function buildWorkflow() {
  const nodes = [
    {
      parameters: { httpMethod: 'POST', path: 'teams-notify', responseMode: 'lastNode', options: {} },
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300],
      webhookId: 'teams-notify'
    },

    // 1. Extract params
    {
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments: [
            { id: 'card_id', name: 'card_id', value: '={{ $json.body.card_id }}', type: 'string' },
            { id: 'dono_id', name: 'dono_id', value: '={{ $json.body.dono_id }}', type: 'string' },
            { id: 'titulo', name: 'titulo', value: '={{ $json.body.titulo }}', type: 'string' },
            { id: 'teams_webhook_url', name: 'teams_webhook_url', value: '={{ $json.body.teams_webhook_url }}', type: 'string' }
          ]
        },
        options: {}
      },
      name: '1. Extrai Params',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [260, 300]
    },

    // 2. Busca Card (simple, no JOINs)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards?id=eq.{{ $json.card_id }}&select=id,titulo,valor_estimado,valor_final,produto,pessoa_principal_id,pipeline_stage_id`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: { response: { response: { fullResponse: false } } }
      },
      name: '2. Busca Card',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [520, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      onError: 'continueRegularOutput',
      alwaysOutputData: true
    },

    // 3. Busca Dono (profile)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/profiles?id=eq.{{ $('1. Extrai Params').first().json.dono_id }}&select=nome,email`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: { response: { response: { fullResponse: false } } }
      },
      name: '3. Busca Dono',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [780, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      onError: 'continueRegularOutput',
      alwaysOutputData: true
    },

    // 4. Busca Etapa (pipeline_stages.nome, not .name!)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/pipeline_stages?id=eq.{{ $('2. Busca Card').first().json.pipeline_stage_id }}&select=nome`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: { response: { response: { fullResponse: false } } }
      },
      name: '4. Busca Etapa',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1040, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      onError: 'continueRegularOutput',
      alwaysOutputData: true
    },

    // 5. Busca Contato
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/contatos?id=eq.{{ $('2. Busca Card').first().json.pessoa_principal_id }}&select=nome,sobrenome,email`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: { response: { response: { fullResponse: false } } }
      },
      name: '5. Busca Contato',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1300, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      onError: 'continueRegularOutput',
      alwaysOutputData: true
    },

    // 6. Format + Send to Teams
    {
      parameters: { jsCode: CODE_FORMAT_AND_SEND, options: {} },
      name: '6. Formata e Envia',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1560, 300]
    }
  ];

  // Simple linear chain
  const connections = {
    'Webhook':          { main: [[{ node: '1. Extrai Params', type: 'main', index: 0 }]] },
    '1. Extrai Params': { main: [[{ node: '2. Busca Card',    type: 'main', index: 0 }]] },
    '2. Busca Card':    { main: [[{ node: '3. Busca Dono',    type: 'main', index: 0 }]] },
    '3. Busca Dono':    { main: [[{ node: '4. Busca Etapa',   type: 'main', index: 0 }]] },
    '4. Busca Etapa':   { main: [[{ node: '5. Busca Contato', type: 'main', index: 0 }]] },
    '5. Busca Contato': { main: [[{ node: '6. Formata e Envia', type: 'main', index: 0 }]] }
  };

  return {
    name: 'WelcomeCRM - Teams Notification',
    nodes,
    connections,
    settings: { executionOrder: 'v1' }
  };
}

// ============================================================================
// DEPLOY
// ============================================================================

async function main() {
  const workflow = buildWorkflow();
  console.log(`Atualizando workflow "${workflow.name}" (ID: ${TARGET_WORKFLOW_ID})...`);

  const updateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${TARGET_WORKFLOW_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: workflow.name, nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings })
  });

  if (!updateRes.ok) {
    console.error('Erro:', await updateRes.text());
    process.exit(1);
  }

  const result = await updateRes.json();
  console.log(`Workflow atualizado: ${result.id}`);

  await fetch(`${N8N_API_URL}/api/v1/workflows/${result.id}/activate`, {
    method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY }
  });
  console.log(`Webhook: ${N8N_API_URL}/webhook/teams-notify`);
  console.log(`Editor: ${N8N_API_URL}/workflow/${result.id}`);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
