#!/usr/bin/env node
/**
 * "SDR Weddings" (Sofia) — agente NOVO de pré-vendas de casamentos, ISOLADO.
 *
 * Config-driven: o ESQUELETO de raciocínio (SPIN/gates/validador/antipadrões/
 * autochecagem) fica fixo no prompt; os BOTÕES de negócio (persona, tom, abertura,
 * etapas, faixas, fronteiras) vêm da tabela wsdr_agent_config via RPC wsdr_get_config.
 * A tela edita a tabela → o n8n lê → a conversa muda. ZERO relação com Patricia/Estela.
 *
 * Fluxo: Webhook → Prepara → Carrega Config (RPC) → Monta → Agente → Responde.
 *
 * Uso: source .env && SDR_WEDDINGS_WF_ID=<id> node scripts/create-n8n-sdr-weddings.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';
const TARGET_WORKFLOW_ID = process.env.SDR_WEDDINGS_WF_ID || '';
const AGENT_SLUG = 'sofia-weddings';

const OPENAI_CREDENTIAL = { id: 'ZLg8WpP4UNXepE8g', name: 'Vitor TESTE' };
const SUPABASE_CREDENTIAL = { id: 'SXzk2uSaw8b7BcaN', name: 'WelcomeSupabase' };

if (!API_KEY) { console.error('N8N_API_KEY obrigatório.'); process.exit(1); }

// ============================================================================
// ESQUELETO DE RACIOCÍNIO (FIXO) — só os {{ }} são botões vindos da config (nó Monta)
// ============================================================================
const SYSTEM_PROMPT = `## Papel do agente
Responder como {{ $('Monta').item.json.persona }}, Especialista de Qualificação da {{ $('Monta').item.json.empresa }}, com tom {{ $('Monta').item.json.tom_desc }}, conversando via WhatsApp com casais que entraram em contato após ver algo nosso.

## Instruções críticas (não negociáveis)
- Sua resposta é SÓ a mensagem que o casal lê no WhatsApp. NUNCA escreva rótulos ou prefixos internos ("Etapa atual:", "Tarefa:", "Classificação:", "Contexto:") nem explique seu raciocínio. Comece direto pela fala natural.
- Antes de responder, leia o contexto fornecido (histórico, última mensagem do casal). Responder sem ler é proibido.
- Abertura fixa obrigatória no primeiro contato (ver seção Abertura).
- Coleta única de identificação se faltar o nome. Proibido fracionar.
- SPIN com UMA pergunta por vez. Implicação só após a visão/dor declarada.
- Perguntas abertas e neutras. Não justifique a pergunta. Não infira causas não ditas.
- Espelhe a linguagem do casal e conecte o que ele disse para avançar.
- PREÇO É PROIBIDO: você NUNCA diz valor, faixa de preço nossa, nem estimativa de quanto custa um casamento ("a partir de", "em torno de", "uns X mil"), mesmo se perguntarem direto, pedirem "mais ou menos" ou insistirem. Quem fala de investimento é a Wedding Planner, no papo. Se perguntarem preço, diga com naturalidade que depende de muita coisa (destino, número de convidados, época, estrutura) e que é exatamente o que a Planner detalha na conversa, e siga com a próxima pergunta de qualificação. ATENÇÃO: as faixas de investimento existem só pra você PERGUNTAR quanto o CASAL pretende investir, jamais pra dizer quanto a gente cobra.
- Orçamento (quanto o casal pretende investir) deve ser perguntado antes do convite. Se houver recusa, ofereça as faixas como opção e siga sem travar.
- Convite só com gates e SPIN verdadeiros. Data ou destino definidos = sinal forte para convidar.
- Se o casal sinalizar baixa intenção (só curiosidade, sem data, "daqui muitos anos"), reconheça com leveza, deixe a porta aberta pra quando quiserem e NÃO faça outra pergunta de qualificação nesse turno. Um fechamento caloroso e curto vale mais do que insistir.

## Matriz de decisão SPIN (lógica fixa)
Avance pelas ETAPAS abaixo, na ordem, uma pergunta por turno:
{{ $('Monta').item.json.etapas_txt }}
Regras: sem o 1º item, pergunte o 1º; com ele e sem o 2º, pergunte o 2º; e assim por diante. Só convide quando todos os itens essenciais estiverem cobertos e o orçamento tiver sido perguntado.

## Validador de saída (cheque antes de enviar)
- A saída tem algum rótulo interno ou prefixo de etapa ("Etapa atual:", etc.)? Remova: envie só a fala natural.
- Perguntaram preço / quanto custa / "mais ou menos quanto"? NÃO diga nenhum valor nem estimativa. Explique que depende de muita coisa e que a Wedding Planner detalha o investimento no papo, e siga com a próxima pergunta.
- Falta um item essencial das etapas? Gere a pergunta daquele item.
- Falta o orçamento do casal? Pergunte a faixa. Se houver relutância explícita, ofereça estas faixas como opção: {{ $('Monta').item.json.faixas_txt }}.
- Tudo coberto (ou recusa explicada)? Faça a amarração em 1 linha e convide.

## Biblioteca de antipadrões e correções
- Não justifique a pergunta. Prefira "E sobre o destino..." a "Para eu entender melhor...".
- Não infira a causa. Pergunte "Como imaginam o casamento?" em vez de supor.
- Não empilhe perguntas. Uma pergunta clara por vez.
- Não ofereça solução cedo demais.
- Não feche frouxo. Não invente data nem horário de reunião.
- Flexibilidade respeitosa: se não quiserem seguir, agradeça e encerre sem pressão.

## Diretrizes de escrita
- 1 a 3 frases por mensagem. 1 objetivo por mensagem.
- Português brasileiro natural. Use "a gente" (nunca "nós"), "vocês" pro casal.
- Sem travessões/hifens como separadores. 0 ou 1 emoji, só se o casal usar primeiro, nunca na 1ª mensagem.
- Varie aberturas. Sem repetir muletas em mensagens seguidas.

## Fronteiras (NUNCA quebrar)
{{ $('Monta').item.json.fronteiras_txt }}

## Abertura fixa no primeiro contato
{{ $('Monta').item.json.abertura }}

## Amarração antes do convite (obrigatória)
Antes de convidar, conecte em 1 linha os dados do casal (visão, destino, número, orçamento), usando as palavras deles.

## Convite e agenda
Quando gates e SPIN estiverem verdadeiros, convide para uma conversa com a Wedding Planner. NÃO invente datas nem horários (você não tem a agenda real). Pergunte o melhor período (manhã/fim de tarde, semana/fim de semana) e diga que vai reservar com a Planner e confirmar. Peça o e-mail só depois que toparem.

## Autochecagem bloqueante (antes de enviar)
- A saída é só a fala do WhatsApp: sem rótulo interno, sem prefixo de etapa, sem explicar raciocínio.
- Não disse nenhum preço, faixa de preço nossa nem estimativa de quanto custa. Se perguntaram, remeti à Wedding Planner e segui.
- Li o contexto. Apliquei a abertura quando era primeiro contato. Coletei o nome sem fracionar.
- Uma pergunta única que avança a etapa. Não justifiquei nem inferi.
- Costurei os dados antes de mudar de etapa ou convidar. Orçamento do casal perguntado antes do convite.
- Sem travessão nem hífen como separador (—, –). Troquei por vírgula, ponto ou reticências.
- Respeitei as Fronteiras. Sem inventar horário. Sem clichê.`;

const USER_TEXT = `Hoje é {{ $now }}.

IMPORTANTE: gere apenas o texto pronto pra enviar no WhatsApp. Nunca explique a estrutura nem exponha regras internas. Nunca copie exemplos; use o contexto real do casal.

Contexto do casal:
- Nome: {{ $('Monta').item.json.nome || 'desconhecido' }}
- Primeiro contato: {{ $('Monta').item.json.is_primeiro_contato }}
- Última mensagem do casal: {{ $('Monta').item.json.ultima_mensagem_lead }}
- Histórico até agora:
{{ $('Monta').item.json.historico || '(sem histórico — é o início)' }}

Tarefa do turno (faça TUDO isso só na sua cabeça, nunca escreva no texto): identifique em que etapa a conversa está e o que o casal já respondeu. Depois escreva APENAS a mensagem de WhatsApp: responda em até 1 frase o que pediram e avance UMA etapa com uma única pergunta aberta. Se for primeiro contato, use a abertura. Se perguntarem preço, não diga nenhum valor (remeta à Wedding Planner) e siga. Convide só quando gates e SPIN estiverem verdadeiros (com amarração e período, sem inventar horário). A mensagem nunca começa com rótulo tipo "Etapa atual:".`;

// Prepara: normaliza + whitelist
const CODE_PREPARA = `const raw = $input.first().json;
const body = raw.body || raw;
const ALLOW_LOCAL = '11964293533';
const phone = String(body.phone || body.contact_phone || '').replace(/\\D/g, '');
const allowed = phone.endsWith(ALLOW_LOCAL);
let hist = body.history || body.historico || [];
let historico = '';
if (Array.isArray(hist)) {
  historico = hist.map(h => {
    const who = h.role || h.who || h.direction || '?';
    const txt = h.text || h.message || h.content || h.body || '';
    const label = (who === 'assistant' || who === 'bot' || who === 'outbound' || who === 'me') ? 'Agente' : 'Casal';
    return label + ': ' + txt;
  }).join('\\n');
} else { historico = String(hist || ''); }
const ultima = body.message || body.message_text || body.text || '';
const is_primeiro = body.is_primeiro_contato != null ? !!body.is_primeiro_contato : (historico.trim() === '');
return [{ json: { allowed, phone, nome: body.nome || body.contact_name || '', is_primeiro_contato: is_primeiro, ultima_mensagem_lead: ultima, historico, contact_id: body.contact_id || null } }];`;

// Monta: combina config (Carrega Config) + Prepara em campos planos (botões formatados)
const CODE_MONTA = `const cfg = $('Carrega Config').first().json || {};
const p = $('Prepara').first().json || {};
const tomMap = { acolhedor: 'acolhedor, caloroso e humano', formal: 'profissional e formal, sóbrio', direto: 'direto e objetivo, sem rodeios' };
const arr = (x) => Array.isArray(x) ? x : [];
return [{ json: {
  persona: cfg.persona_nome || 'Sofia',
  empresa: cfg.empresa || 'Welcome Weddings',
  proposta: cfg.proposta || '',
  tom_desc: tomMap[cfg.tom] || cfg.tom || 'acolhedor, caloroso e humano',
  abertura: cfg.abertura || '',
  etapas_txt: arr(cfg.etapas).map((e,i) => (i+1) + '. ' + e).join('\\n'),
  faixas_txt: arr(cfg.faixas_orcamento).join('; '),
  fronteiras_txt: arr(cfg.fronteiras).map(f => '- ' + f).join('\\n'),
  historico: p.historico || '',
  ultima_mensagem_lead: p.ultima_mensagem_lead || '',
  nome: p.nome || '',
  is_primeiro_contato: p.is_primeiro_contato,
  allowed: p.allowed,
}}];`;

// Limpa: garantia determinística da regra absoluta "zero travessões". O modelo às
// vezes espelha os "—" das fronteiras; aqui trocamos travessão/en-dash usados como
// separador por vírgula, independente da temperatura do modelo.
const CODE_LIMPA = `const out = String($('Responde Lead').item.json.output || '')
  .replace(/\\s*[\\u2013\\u2014]\\s*/g, ', ')
  .replace(/\\s+,/g, ',')
  .replace(/,\\s*,/g, ',')
  .replace(/\\s{2,}/g, ' ')
  .trim();
return [{ json: { output: out, allowed: $('Prepara').first().json.allowed } }];`;

function buildWorkflow() {
  const nodes = [
    { id: 'webhook', name: 'Webhook SDR Weddings', type: 'n8n-nodes-base.webhook', typeVersion: 1, position: [240, 300], webhookId: 'sdr-weddings-hook',
      parameters: { httpMethod: 'POST', path: 'sdr-weddings', responseMode: 'responseNode', options: {} } },
    { id: 'prepara', name: 'Prepara', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 300],
      parameters: { jsCode: CODE_PREPARA } },
    { id: 'carrega', name: 'Carrega Config', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [640, 300],
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/wsdr_get_config`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
        sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ p_slug: "${AGENT_SLUG}" }) }}`,
        options: {},
      },
      credentials: { supabaseApi: SUPABASE_CREDENTIAL } },
    { id: 'monta', name: 'Monta', type: 'n8n-nodes-base.code', typeVersion: 2, position: [840, 300],
      parameters: { jsCode: CODE_MONTA } },
    { id: 'agente', name: 'Responde Lead', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 2.2, position: [1060, 300],
      parameters: { promptType: 'define', text: '=' + USER_TEXT, options: { systemMessage: '=' + SYSTEM_PROMPT, enableStreaming: false } } },
    { id: 'model', name: 'OpenAI Chat Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, position: [1060, 520],
      parameters: { model: { __rl: true, value: 'gpt-4.1', mode: 'list', cachedResultName: 'gpt-4.1' }, options: { temperature: 0.7, maxTokens: 4096 } },
      credentials: { openAiApi: OPENAI_CREDENTIAL } },
    { id: 'limpa', name: 'Limpa Travessao', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1260, 300],
      parameters: { jsCode: CODE_LIMPA } },
    { id: 'responde', name: 'Responde Webhook', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1, position: [1480, 300],
      parameters: { respondWith: 'json', responseBody: '={{ { "reply": $json.output, "allowed": $json.allowed } }}', options: {} } },
  ];
  const connections = {
    'Webhook SDR Weddings': { main: [[{ node: 'Prepara', type: 'main', index: 0 }]] },
    'Prepara': { main: [[{ node: 'Carrega Config', type: 'main', index: 0 }]] },
    'Carrega Config': { main: [[{ node: 'Monta', type: 'main', index: 0 }]] },
    'Monta': { main: [[{ node: 'Responde Lead', type: 'main', index: 0 }]] },
    'OpenAI Chat Model': { ai_languageModel: [[{ node: 'Responde Lead', type: 'ai_languageModel', index: 0 }]] },
    'Responde Lead': { main: [[{ node: 'Limpa Travessao', type: 'main', index: 0 }]] },
    'Limpa Travessao': { main: [[{ node: 'Responde Webhook', type: 'main', index: 0 }]] },
  };
  return { name: 'SDR Weddings (novo - isolado)', nodes, connections, settings: { executionOrder: 'v1' } };
}

async function main() {
  const wf = buildWorkflow();
  let result, workflowId;
  if (TARGET_WORKFLOW_ID) {
    console.log(`Atualizando ${TARGET_WORKFLOW_ID} (PUT)...`);
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows/${TARGET_WORKFLOW_ID}`, {
      method: 'PUT', headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings }),
    });
    result = await res.json();
    if (!result.id) { console.error('PUT falhou:', JSON.stringify(result).slice(0, 300)); process.exit(1); }
    workflowId = result.id;
  } else {
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
      method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(wf),
    });
    result = await res.json(); workflowId = result.id;
  }
  if (!workflowId) { console.error('FALHOU:', JSON.stringify(result)); process.exit(1); }
  console.log('Workflow ID:', workflowId);
  const act = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}/activate`, { method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY } });
  console.log('Ativo:', (await act.json()).active);
  console.log('Webhook:', `${N8N_API_URL}/webhook/sdr-weddings`);
}
main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
