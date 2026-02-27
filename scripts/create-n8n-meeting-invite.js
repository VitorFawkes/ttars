#!/usr/bin/env node
/**
 * Create "Meeting Invite" workflow in n8n
 *
 * Sends email with .ics calendar invite when a meeting is created or rescheduled.
 * Uses SMTP (smtp.office365.com) via contato@welcometrips.com.br
 *
 * Prerequisites:
 *   - SMTP credential "WelcomeCRM SMTP" must exist in n8n
 *   - Supabase credential "WelcomeSupabase" must exist in n8n
 *
 * Usage: source .env && node scripts/create-n8n-meeting-invite.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';

// Credential IDs from existing workflows + newly created SMTP
const SUPABASE_CREDENTIAL = { id: 'SXzk2uSaw8b7BcaN', name: 'WelcomeSupabase' };
const SMTP_CREDENTIAL = { id: 'ZIqaH9kmOtsFI4p7', name: 'WelcomeCRM SMTP' };

if (!API_KEY) {
  console.error('❌ N8N_API_KEY is required.');
  console.error('Usage: source .env && node scripts/create-n8n-meeting-invite.js');
  process.exit(1);
}

// ============================================================================
// CODE NODE SCRIPTS
// ============================================================================

const CODE_RESOLVE_EMAILS_AND_ICS = `
// Resolve destinatários, gera .ics (RFC 5545) e HTML do email
const meetingRaw = $('2. Busca Reunião').first().json;
const profileRaw = $('3. Busca Responsável').first().json;
const webhookData = $('1. Extrai Params').first().json;

// meetingRaw vem como array do PostgREST
const meeting = Array.isArray(meetingRaw) ? meetingRaw[0] : meetingRaw;
const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;

if (!meeting || !meeting.id) {
  return [{ json: { status: 'error', message: 'Reunião não encontrada' } }];
}

const action = webhookData.action || 'created';
const card = meeting.card;
const contato = card?.contato;
const duration = (meeting.metadata && meeting.metadata.duration_minutes) || 30;
const meetingLink = (meeting.metadata && meeting.metadata.meeting_link) || '';

// --- Resolve emails ---
const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const emails = new Set();

// 1. participantes_externos (direto na tarefa)
if (meeting.participantes_externos && Array.isArray(meeting.participantes_externos)) {
  for (const p of meeting.participantes_externos) {
    if (p && emailRegex.test(p.trim())) {
      emails.add(p.trim().toLowerCase());
    }
  }
}

// 2. Contato principal do card
if (contato && contato.email && emailRegex.test(contato.email.trim())) {
  emails.add(contato.email.trim().toLowerCase());
}

const recipients = [...emails];
if (recipients.length === 0) {
  return [{ json: { status: 'no_email', message: 'Nenhum email de destinatário encontrado' } }];
}

// --- Datas ---
const startDate = new Date(meeting.data_vencimento);
const endDate = new Date(startDate.getTime() + duration * 60000);

function toICSDate(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}/, '');
}

const now = new Date();
const dtstamp = toICSDate(now);
const dtstart = toICSDate(startDate);
const dtend = toICSDate(endDate);

// Formatação para display no email (pt-BR)
const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const diaSemana = diasSemana[startDate.getDay()];
const dia = startDate.getDate();
const mes = meses[startDate.getMonth()];
const ano = startDate.getFullYear();
const horas = String(startDate.getHours()).padStart(2, '0');
const minutos = String(startDate.getMinutes()).padStart(2, '0');
const horasFim = String(endDate.getHours()).padStart(2, '0');
const minutosFim = String(endDate.getMinutes()).padStart(2, '0');
const dataFormatada = diaSemana + ', ' + dia + ' de ' + mes + ' de ' + ano;
const horarioFormatado = horas + ':' + minutos + ' – ' + horasFim + ':' + minutosFim;

const responsavelNome = profile?.nome || 'Welcome Trips';
const titulo = meeting.titulo || 'Reunião';
const descricao = meeting.descricao || '';
const cardTitulo = card?.titulo || '';
const sequence = action === 'rescheduled' ? 1 : 0;

// Nome do contato para ATTENDEE
const contatoNome = contato ? [contato.nome, contato.sobrenome].filter(Boolean).join(' ') : '';

// --- Gera .ics (RFC 5545) ---
const attendeeLines = recipients.map(email => {
  const cn = email === contato?.email?.trim()?.toLowerCase() && contatoNome
    ? 'ATTENDEE;RSVP=TRUE;CN=' + contatoNome + ':mailto:' + email
    : 'ATTENDEE;RSVP=TRUE:mailto:' + email;
  return cn;
}).join('\\r\\n');

const icsLines = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//WelcomeCRM//MeetingInvite//PT',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:meeting-' + meeting.id + '@welcomecrm',
  'DTSTAMP:' + dtstamp,
  'DTSTART:' + dtstart,
  'DTEND:' + dtend,
  'SUMMARY:' + titulo,
  'DESCRIPTION:' + (descricao || titulo + (cardTitulo ? ' - ' + cardTitulo : '')).replace(/\\n/g, '\\\\n'),
  'ORGANIZER;CN=' + responsavelNome + ':mailto:contato@welcometrips.com.br',
  attendeeLines,
];
if (meetingLink) {
  icsLines.push('LOCATION:' + meetingLink);
  icsLines.push('URL:' + meetingLink);
}
icsLines.push('STATUS:CONFIRMED');
icsLines.push('SEQUENCE:' + sequence);
icsLines.push('END:VEVENT');
icsLines.push('END:VCALENDAR');
const icsContent = icsLines.join('\\r\\n');

// --- Gera HTML ---
const actionLabel = action === 'rescheduled' ? 'Reagendada' : 'Agendada';
const actionColor = action === 'rescheduled' ? '#ea580c' : '#7c3aed';

const meetingLinkButton = meetingLink
  ? '<div style="text-align:center;margin:0 0 16px;">'
    + '<a href="' + meetingLink + '" style="display:inline-block;background:#7c3aed;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;" target="_blank">▶ Entrar na Reunião</a>'
    + '<p style="margin:6px 0 0;font-size:12px;color:#94a3b8;">ou copie: <a href="' + meetingLink + '" style="color:#7c3aed;word-break:break-all;">' + meetingLink + '</a></p>'
    + '</div>'
  : '';

const htmlBody = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">'
  + '<div style="background:' + actionColor + ';color:white;padding:20px 24px;border-radius:8px 8px 0 0;">'
  + '<h2 style="margin:0;font-size:20px;">Reunião ' + actionLabel + '</h2>'
  + '<p style="margin:4px 0 0;opacity:0.9;font-size:14px;">Welcome Trips</p>'
  + '</div>'
  + '<div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;background:#ffffff;">'
  + '<p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1e293b;">' + titulo + '</p>'
  + meetingLinkButton
  + '<table style="font-size:14px;color:#475569;border-collapse:collapse;">'
  + '<tr><td style="padding:4px 12px 4px 0;vertical-align:top;">📅</td><td style="padding:4px 0;">' + dataFormatada + '</td></tr>'
  + '<tr><td style="padding:4px 12px 4px 0;vertical-align:top;">🕐</td><td style="padding:4px 0;">' + horarioFormatado + ' (' + duration + ' min)</td></tr>'
  + '<tr><td style="padding:4px 12px 4px 0;vertical-align:top;">👤</td><td style="padding:4px 0;">Consultor: ' + responsavelNome + '</td></tr>'
  + (cardTitulo ? '<tr><td style="padding:4px 12px 4px 0;vertical-align:top;">📋</td><td style="padding:4px 0;">' + cardTitulo + '</td></tr>' : '')
  + (descricao ? '<tr><td style="padding:4px 12px 4px 0;vertical-align:top;">📝</td><td style="padding:4px 0;">' + descricao + '</td></tr>' : '')
  + '</table>'
  + '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" />'
  + '<p style="color:#94a3b8;font-size:12px;margin:0;">Este convite foi enviado pelo sistema WelcomeCRM. Aceite o anexo .ics para adicionar ao seu calendário.</p>'
  + '</div>'
  + '</div>';

const subject = action === 'rescheduled'
  ? 'Reunião reagendada: ' + titulo + ' — ' + dia + '/' + (startDate.getMonth()+1) + ' às ' + horas + ':' + minutos
  : 'Reunião agendada: ' + titulo + ' — ' + dia + '/' + (startDate.getMonth()+1) + ' às ' + horas + ':' + minutos;

// Converte .ics para binary attachment
const icsBase64 = Buffer.from(icsContent, 'utf-8').toString('base64');

return [{
  json: {
    status: 'ready',
    recipients,
    subject,
    htmlBody,
    recipientString: recipients.join(','),
    action,
    meeting_id: meeting.id,
    card_id: meeting.card_id
  },
  binary: {
    ics: {
      data: icsBase64,
      mimeType: 'text/calendar; method=REQUEST',
      fileName: 'convite.ics'
    }
  }
}];
`;

// ============================================================================
// WORKFLOW DEFINITION
// ============================================================================

function buildWorkflow() {
  const nodes = [
    // 0. Webhook
    {
      parameters: {
        httpMethod: 'POST',
        path: 'meeting-invite',
        responseMode: 'lastNode',
        options: {}
      },
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300],
      webhookId: 'meeting-invite'
    },

    // 1. Set: Extract params
    {
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments: [
            { id: 'meeting_id', name: 'meeting_id', value: '={{ $json.body.meeting_id }}', type: 'string' },
            { id: 'card_id', name: 'card_id', value: '={{ $json.body.card_id }}', type: 'string' },
            { id: 'action', name: 'action', value: '={{ $json.body.action || "created" }}', type: 'string' },
            { id: 'user_id', name: 'user_id', value: '={{ $json.body.user_id }}', type: 'string' }
          ]
        },
        options: {}
      },
      name: '1. Extrai Params',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [260, 300]
    },

    // 2. HTTP Request: Busca Reunião + Card + Contato
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/tarefas?id=eq.{{ $json.meeting_id }}&select=*,card:cards!tarefas_card_id_fkey(id,titulo,contato:contatos!cards_pessoa_principal_id_fkey(nome,sobrenome,email))`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '2. Busca Reunião',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [520, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 3. HTTP Request: Busca Responsável (uses responsavel_id from Node 2 output — direct flow)
    // alwaysOutputData ensures downstream nodes run even if responsavel_id is null (empty PostgREST result)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/profiles?id=eq.{{ $json.responsavel_id }}&select=nome,email`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '3. Busca Responsável',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [780, 500],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      onError: 'continueRegularOutput',
      alwaysOutputData: true
    },

    // 4. Code: Resolve Emails + Gera .ics + HTML
    {
      parameters: {
        jsCode: CODE_RESOLVE_EMAILS_AND_ICS,
        options: {}
      },
      name: '4. Resolve & Gera',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [780, 300]
    },

    // 5. If: Tem destinatários?
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          conditions: [
            {
              id: 'has_recipients',
              leftValue: '={{ $json.status }}',
              rightValue: 'ready',
              operator: { type: 'string', operation: 'equals' }
            }
          ],
          combinator: 'and'
        }
      },
      name: '5. Tem Emails?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [1040, 300]
    },

    // 6. Send Email (true branch)
    {
      parameters: {
        fromEmail: 'contato@welcometrips.com.br',
        toEmail: '={{ $json.recipientString }}',
        subject: '={{ $json.subject }}',
        emailFormat: 'html',
        html: '={{ $json.htmlBody }}',
        options: {
          attachments: 'ics',
          replyTo: 'contato@welcometrips.com.br'
        }
      },
      name: '6. Send Email',
      type: 'n8n-nodes-base.emailSend',
      typeVersion: 2.1,
      position: [1300, 200],
      credentials: { smtp: SMTP_CREDENTIAL }
    },

    // 7. Code: Resposta Sucesso
    {
      parameters: {
        jsCode: `const codeData = $('4. Resolve & Gera').first().json;
return [{ json: {
  status: 'sent',
  recipients: codeData.recipients,
  meeting_id: codeData.meeting_id,
  action: codeData.action,
  timestamp: new Date().toISOString()
}}];`,
        options: {}
      },
      name: '7. Resposta Sucesso',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1560, 200]
    },

    // 8. Code: Resposta No Email
    {
      parameters: {
        jsCode: `const codeData = $('4. Resolve & Gera').first().json;
return [{ json: {
  status: codeData.status || 'no_email',
  message: codeData.message || 'Nenhum destinatário',
  timestamp: new Date().toISOString()
}}];`,
        options: {}
      },
      name: '8. Resposta No Email',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1300, 480]
    },

    // 9. HTTP Request: Log Activity (registra envio de email no feed do card)
    {
      parameters: {
        method: 'POST',
        url: `=${SUPABASE_URL}/rest/v1/activities`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({
  card_id: $('4. Resolve & Gera').first().json.card_id,
  tipo: 'email_sent',
  descricao: 'Convite de reunião enviado para ' + ($('4. Resolve & Gera').first().json.recipients || []).join(', '),
  created_by: $('1. Extrai Params').first().json.user_id || null,
  metadata: {
    source: 'meeting_invite',
    meeting_id: $('4. Resolve & Gera').first().json.meeting_id,
    action: $('4. Resolve & Gera').first().json.action,
    recipients: $('4. Resolve & Gera').first().json.recipients,
    subject: $('4. Resolve & Gera').first().json.subject
  }
}) }}`,
        options: {}
      },
      name: '9. Log Activity',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1560, 100],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      onError: 'continueRegularOutput',
      alwaysOutputData: true
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
        { node: '2. Busca Reunião', type: 'main', index: 0 }
      ]]
    },
    '2. Busca Reunião': {
      main: [[
        { node: '3. Busca Responsável', type: 'main', index: 0 }
      ]]
    },
    '3. Busca Responsável': {
      main: [[
        { node: '4. Resolve & Gera', type: 'main', index: 0 }
      ]]
    },
    '4. Resolve & Gera': {
      main: [[
        { node: '5. Tem Emails?', type: 'main', index: 0 }
      ]]
    },
    '5. Tem Emails?': {
      main: [
        // true branch
        [{ node: '6. Send Email', type: 'main', index: 0 }],
        // false branch
        [{ node: '8. Resposta No Email', type: 'main', index: 0 }]
      ]
    },
    '6. Send Email': {
      main: [[
        { node: '9. Log Activity', type: 'main', index: 0 }
      ]]
    },
    '9. Log Activity': {
      main: [[
        { node: '7. Resposta Sucesso', type: 'main', index: 0 }
      ]]
    }
  };

  return {
    name: 'WelcomeCRM - Meeting Invite',
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

  console.log(`🔍 Verificando se workflow "${workflow.name}" já existe...`);

  // List existing workflows
  const listRes = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
    headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
  });
  const listData = await listRes.json();
  const existing = listData.data?.find(w => w.name === workflow.name);

  let result;

  if (existing) {
    console.log(`📝 Workflow encontrado (ID: ${existing.id}). Deletando para recriar...`);
    const delRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${existing.id}`, {
      method: 'DELETE',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    if (!delRes.ok) {
      console.error(`❌ Erro ao deletar workflow: ${delRes.status}`);
      process.exit(1);
    }
    console.log(`🗑️  Workflow antigo deletado. Recriando...`);
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflow)
    });
    result = await res.json();
    if (result.id) {
      console.log(`✅ Workflow recriado: ${result.id}`);
    } else {
      console.error('❌ Erro ao recriar:', JSON.stringify(result, null, 2));
      process.exit(1);
    }
  } else {
    console.log('🆕 Criando novo workflow...');
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflow)
    });
    result = await res.json();
    if (result.id) {
      console.log(`✅ Workflow criado: ${result.id}`);
    } else {
      console.error('❌ Erro ao criar:', JSON.stringify(result, null, 2));
      process.exit(1);
    }
  }

  // Activate
  const workflowId = result.id || existing?.id;
  if (workflowId) {
    const activateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const activateData = await activateRes.json();
    console.log(`⚡ Workflow ${activateData.active ? 'ativado' : 'inativo'}`);
    console.log(`\n🔗 Webhook URL: ${N8N_API_URL}/webhook/meeting-invite`);
    console.log(`📋 Editor: ${N8N_API_URL}/workflow/${workflowId}`);
  }

  console.log('\n📌 Pré-requisitos:');
  console.log('   1. Credential "WelcomeSupabase" (supabaseApi) configurada');
  console.log('   2. Credential "WelcomeCRM SMTP" (smtp) configurada');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
