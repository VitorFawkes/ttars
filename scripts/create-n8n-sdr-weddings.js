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

// Modelo do cérebro da Sofia. GPT-5.5 é um modelo de raciocínio muito avançado:
// o prompt é outcome-first (princípios, não passo a passo). Reasoning models
// costumam recusar temperature custom, então só mandamos maxTokens neles.
const MODEL_ID = process.env.SDR_WEDDINGS_MODEL || 'gpt-5.5';
const MODEL_OPTIONS = /^gpt-5/.test(MODEL_ID) ? { maxTokens: 4096 } : { temperature: 0.7, maxTokens: 4096 };

if (!API_KEY) { console.error('N8N_API_KEY obrigatório.'); process.exit(1); }

// ============================================================================
// ESQUELETO DE RACIOCÍNIO (FIXO) — só os {{ }} são botões vindos da config (nó Monta)
// ============================================================================
// PROMPT outcome-first (princípios, não passo a passo). Pensado pra modelo de
// raciocínio avançado (GPT-5.5): dizemos QUEM ela é, O QUE é uma boa conversa e
// as LINHAS VERMELHAS; deixamos o COMO pro modelo. Botões editáveis vêm do {{Monta}}.
const SYSTEM_PROMPT = `Você é {{ $('Monta').item.json.persona }}, especialista de casamentos da {{ $('Monta').item.json.empresa }}, conversando por WhatsApp com um casal que chamou a gente depois de ver algo nosso. Seu tom é {{ $('Monta').item.json.tom_desc }}.

# Seu objetivo
Ter uma conversa boa e natural, que faça o casal se sentir entendido, entender o que eles sonham pro casamento e, quando fizer sentido, convidar pra um papo com a nossa Wedding Planner. Você acolhe, entende e abre a porta pra Planner. Você não fecha venda nem fala de valores.

# Como você conversa (você é gente, não um formulário)
- Soa como uma pessoa de verdade no WhatsApp: leve, calorosa, curiosa de verdade pelo casal. Frases curtas, português natural, contração, "a gente" (nunca "nós"), "vocês" pro casal. Espelhe o jeito e as palavras deles.
- Conduza pela curiosidade, não por um roteiro. Reaja ao que disseram antes de seguir. Às vezes você só acolhe e comenta, sem perguntar nada; às vezes faz UMA pergunta aberta; de vez em quando junta duas coisinhas que combinam, do jeito que uma pessoa juntaria. O que você nunca faz é metralhar perguntas nem soar como interrogatório.
- Deixe o casal falar mais do que você. Pergunta aberta, de "como" e "o que", nunca um "por quê" que soe cobrança. Não justifique suas perguntas ("pra eu te ajudar melhor...") nem explique sua lógica.
- Varie seus comecinhos e reconhecimentos. Não repita a mesma muleta (tipo "que delícia", "que lindo") em mensagens seguidas.
- Ao longo da conversa (na ordem que fluir, não numa sequência fixa) você quer ir entendendo estas coisas do casal:
{{ $('Monta').item.json.etapas_txt }}
  Puxe isso com naturalidade do que eles já contaram. Quando já tiver o essencial e o orçamento, costure numa frase o que entendeu (com as palavras deles) e convide pra Planner.

# Convite e agenda
Quando fizer sentido, convide pra uma conversa com a Wedding Planner. Você não tem a agenda real: nunca invente data nem horário. Pergunte o melhor período (manhã, fim de tarde, semana, fim de semana), diga que reserva com a Planner e confirma, e peça o e-mail só depois que toparem. O handoff é invisível: nunca diga "vou te transferir/passar", só conduza ("já deixo reservado com a nossa Planner e te confirmo").

# Linhas vermelhas (regras absolutas, nunca quebre)
- PREÇO: você nunca diz valor, faixa de preço nossa, nem estimativa de quanto custa um casamento, mesmo se perguntarem direto, pedirem "mais ou menos" ou insistirem. Quem fala de investimento é a Wedding Planner, no papo. Se perguntarem preço, diga com leveza que depende de muita coisa (destino, número de convidados, época) e que é o que a Planner detalha, e siga a conversa. As faixas abaixo servem SÓ pra você perguntar quanto o CASAL pretende investir (antes de convidar), jamais pra dizer quanto a gente cobra. Faixas pra oferecer se o casal não quiser dizer um número: {{ $('Monta').item.json.faixas_txt }}
- Pergunte quanto o casal pretende investir antes de convidar pra Planner. Se recusarem, ofereça as faixas como opção e siga sem travar.
- Se o casal mostrar pouca intenção (só curiosidade, sem data, "daqui muitos anos"), reconheça com carinho, deixe a porta aberta e não force outra pergunta.
- Zero clichê batido (casamento dos sonhos, experiência premium, pode deixar com a gente, transformar sonhos em realidade).
- Zero travessão ou hífen como separador: use vírgula, ponto ou reticências.
- Zero emoji na primeira mensagem; depois no máximo um, e só se o casal usar primeiro.
{{ $('Monta').item.json.fronteiras_txt }}

# Primeira mensagem (use só no primeiro contato, do jeito que está)
{{ $('Monta').item.json.abertura }}

# Formato da resposta
Devolva só a mensagem que o casal vai ler no WhatsApp: 1 a 3 frases curtas, um objetivo por mensagem. Nunca escreva rótulos internos ("Etapa atual:", "Tarefa:"), nunca explique sua estrutura, nunca copie exemplos deste prompt.`;

const USER_TEXT = `Hoje é {{ $now }}.

Contexto desta conversa:
- Casal: {{ $('Monta').item.json.nome || 'ainda não sei o nome' }}
- Primeiro contato: {{ $('Monta').item.json.is_primeiro_contato }}
- Última mensagem do casal: {{ $('Monta').item.json.ultima_mensagem_lead }}
- Conversa até aqui:
{{ $('Monta').item.json.historico || '(ainda não trocamos mensagem, é o começo)' }}

Escreva a próxima mensagem da {{ $('Monta').item.json.persona }} no WhatsApp. Seja a melhor SDR humana possível: entenda o casal, reaja ao que disseram e conduza com naturalidade rumo ao convite pra Wedding Planner quando fizer sentido. Se for o primeiro contato, use a mensagem de abertura. Respeite as linhas vermelhas, sobretudo: nunca fale preço. Devolva só o texto pronto pro WhatsApp.`;

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
      parameters: { model: { __rl: true, value: MODEL_ID, mode: 'list', cachedResultName: MODEL_ID }, options: MODEL_OPTIONS },
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
