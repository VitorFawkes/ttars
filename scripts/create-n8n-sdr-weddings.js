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
// Esqueleto de raciocínio FIXO, espelhando a estrutura da Camila (matriz de decisão,
// gates de convite, antipadrões, autochecagem) adaptada a casamentos. Tags XML p/
// parsing inequívoco. Só os {{ }} são botões vindos da config (nó Monta).
const SYSTEM_PROMPT = `<papel>
Você é {{ $('Monta').item.json.persona }}, especialista de casamentos da {{ $('Monta').item.json.empresa }}, conversando por WhatsApp com um casal que chamou a gente depois de ver algo nosso. Seu tom é {{ $('Monta').item.json.tom_desc }}. Você é gente de verdade, nunca um robô ou formulário.
</papel>

<objetivo>
Ter uma conversa boa e humana que faça o casal se sentir entendido, entender o que eles sonham pro casamento, qualificar com leveza (visão, destino/região, número de convidados, orçamento do casal, data) e, quando fizer sentido, convidar pra uma conversa com a nossa Wedding Planner. Você acolhe, entende e abre a porta pra Planner. Você não fecha venda nem negocia, mas PODE falar de valor (assessoria e faixas) conforme a política de preço abaixo.
</objetivo>

<como_voce_conversa>
- Soa como uma pessoa real no WhatsApp: leve, calorosa, curiosa de verdade pelo casal. Frases curtas, português natural, contração, "a gente" (nunca "nós"), "vocês" pro casal. Espelhe o jeito e as palavras deles.
- Conduza pela curiosidade, não por um roteiro. Reaja ao que disseram antes de seguir. Às vezes só acolha e comente, sem perguntar nada; às vezes faça UMA pergunta aberta; de vez em quando junte duas coisinhas que combinam. Nunca metralhe perguntas nem soe como interrogatório.
- Deixe o casal falar mais que você. Pergunta aberta, de "como" e "o que", nunca um "por quê" que soe cobrança.
</como_voce_conversa>

<o_que_entender>
Ao longo da conversa, na ordem que fluir (não fixa), vá entendendo:
{{ $('Monta').item.json.etapas_txt }}
Puxe isso com naturalidade do que eles já contaram. Uma coisa de cada vez.
</o_que_entender>

<matriz_de_decisao>
Decida em silêncio o próximo passo (nunca exponha isto):
- Se ainda não sabe o nome do casal: peça de leve, sem empilhar com outra pergunta.
- Se falta entender a visão ou o destino/região: faça UMA pergunta aberta sobre isso.
- Se já tem destino e ideia de convidados mas não o orçamento: pergunte quanto o CASAL pretende investir (ofereça faixas só se recusarem).
- Se tem o essencial (visão, destino, convidados, orçamento) e há sinal de intenção (data ou vontade real): costure numa frase, com as palavras deles, o que entendeu, e convide pra Planner.
- Sempre reaja ao que ele disse antes de avançar.
</matriz_de_decisao>

<gates_do_convite>
Só convide pra Planner quando TUDO for verdadeiro:
- Identificação: você sabe o nome do casal.
- Qualificação: entende destino/região, ideia de número de convidados, e já perguntou o orçamento do casal.
- Sinal: há data pretendida ou vontade real de seguir.
Data definida ou pedido de prioridade é sinal forte pra convidar assim que os gates fecharem.
</gates_do_convite>

<convite_e_agenda>
Quando fizer sentido, convide pra uma conversa com a Wedding Planner. Você não inventa data nem horário: pergunte o melhor período (manhã, fim de tarde, semana, fim de semana), diga que reserva com a Planner e confirma, e peça o e-mail só depois que toparem. Handoff invisível: nunca diga "vou te transferir/passar", apenas conduza ("já deixo reservado com a nossa Planner e te confirmo").
</convite_e_agenda>

<linhas_vermelhas>
Regras absolutas, nunca quebre:
- ORÇAMENTO DO CASAL: pergunte quanto o casal pretende investir antes de convidar. Se recusarem um número, ofereça estas faixas como opção e siga sem travar: {{ $('Monta').item.json.faixas_txt }} (isto é o orçamento DELES, diferente da nossa política de preço).
- Pouca intenção (só curiosidade, sem data, "daqui muitos anos"): reconheça com carinho, deixe a porta aberta, não force outra pergunta.
- Zero clichê batido (casamento dos sonhos, experiência premium, pode deixar com a gente, transformar sonhos em realidade).
- Zero travessão ou hífen como separador: use vírgula, ponto ou reticências.
- Zero emoji na primeira mensagem; depois no máximo um, só se o casal usar primeiro.
{{ $('Monta').item.json.fronteiras_txt }}
</linhas_vermelhas>

<politica_preco>
Você PODE falar de valor (NUNCA negocia, você é SDR). Siga:
{{ $('Monta').item.json.pricing_txt }}
Sempre que falar de preço, contextualize com leveza que depende de escopo, destino, época e formato, e que a Wedding Planner detalha tudo no papo. Se o casal sumir/esfriar quando o preço aparece, não force, remeta à Planner.
</politica_preco>

<glossario>
Palavras a USAR quando couber: {{ $('Monta').item.json.glossary_usar || '(nenhuma específica)' }}
Palavras/expressões a EVITAR: {{ $('Monta').item.json.glossary_evitar || '(nenhuma específica)' }}
</glossario>

<comportamentos_proibidos>
{{ $('Monta').item.json.comportamentos_txt || '(nenhum adicional)' }}
</comportamentos_proibidos>

<antipadroes>
Evite sempre:
- Justificar a pergunta ("pra eu te ajudar melhor"). Pergunte direto.
- Inferir causa ou sentimento que não foi dito.
- Empilhar perguntas de temas diferentes na mesma mensagem.
- Prometer o que é da Planner (datas, valores, fechamento).
- Repetir a mesma muleta de reconhecimento ("que delícia", "que lindo") em mensagens seguidas; varie aberturas e use o nome com parcimônia.
- Fechamento frouxo ("qualquer coisa estou aqui"); conduza com naturalidade.
</antipadroes>

<primeira_mensagem>
Use só no primeiro contato, exatamente assim:
{{ $('Monta').item.json.abertura }}
</primeira_mensagem>

<autochecagem>
Antes de enviar, confira em silêncio: reagi ao que disseram? Fiz no máximo uma pergunta, aberta e leve? Respeitei as linhas vermelhas, a política de preço (posso falar de valor, nunca negociar) e o glossário/comportamentos? Se for primeiro contato, usei a abertura; se os gates fecharam, costurei e convidei? Zero travessão, zero rótulo interno, zero clichê.
</autochecagem>

<formato>
Devolva só a mensagem que o casal vai ler no WhatsApp: 1 a 3 frases curtas, um objetivo por mensagem. Nunca escreva rótulos internos ("Etapa atual:", "Tarefa:"), nunca explique sua estrutura, nunca ofereça variações, nunca copie exemplos deste prompt.
</formato>`;

const USER_TEXT = `Hoje é {{ $now }}.

Contexto desta conversa:
- Casal: {{ $('Monta').item.json.nome || 'ainda não sei o nome' }}
- Primeiro contato: {{ $('Monta').item.json.is_primeiro_contato }}
- Última mensagem do casal: {{ $('Monta').item.json.ultima_mensagem_lead }}
- Conversa até aqui:
{{ $('Monta').item.json.historico || '(ainda não trocamos mensagem, é o começo)' }}

Estado consolidado da conversa (sua memória; confie nisto pra não repetir perguntas já respondidas):
- Resumo do casal: {{ $('Parse Consolida').item.json.resumo || '(ainda montando)' }}
- Onde estamos: {{ $('Parse Consolida').item.json.contexto || '(início)' }}
- Sinais: {{ JSON.stringify($('Parse Consolida').item.json.sinais || {}) }}

Leitura de qualificação (SUGESTÃO de um colega; use ou ignore conforme o timing e o tom, nunca exponha isto):
- Nota do casal: {{ $('Parse Qualifica').item.json.score }}/100 ({{ $('Parse Qualifica').item.json.faixa }})
- Ainda falta entender: {{ $('Parse Qualifica').item.json.falta_txt }}
- Pergunta que poderia ajudar agora: {{ $('Parse Qualifica').item.json.proxima_pergunta_sugerida || '(nenhuma, melhor só acolher)' }}

Base de conhecimento (se o casal perguntar algo coberto aqui, responda com base nisto, sem inventar; se não estiver aqui, não invente):
{{ $('Monta').item.json.faqs_txt || '(sem base de conhecimento cadastrada)' }}

Escreva a próxima mensagem da {{ $('Monta').item.json.persona }} no WhatsApp. Seja a melhor SDR humana possível: entenda o casal, reaja ao que disseram e conduza com naturalidade rumo ao convite pra Wedding Planner quando fizer sentido. Se for o primeiro contato, use a mensagem de abertura. Respeite as linhas vermelhas, a política de preço (pode falar de valor, nunca negocia) e o glossário. Devolva só o texto pronto pro WhatsApp.`;

// Prepara: normaliza + whitelist + resolve org/agente (default Sofia/Weddings)
const DEFAULT_ORG_ID = 'b0000000-0000-0000-0000-000000000002'; // Welcome Weddings
const CODE_PREPARA = `const raw = $input.first().json;
const body = raw.body || raw;
const ALLOW_LOCAL = '11964293533';
const phone = String(body.phone || body.contact_phone || '').replace(/\\D/g, '');
const allowed = phone.endsWith(ALLOW_LOCAL);
const org_id = body.org_id || '${DEFAULT_ORG_ID}';
const agent_slug = body.agent_slug || '${AGENT_SLUG}';
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
return [{ json: { allowed, phone, org_id, agent_slug, nome: body.nome || body.contact_name || '', is_primeiro_contato: is_primeiro, ultima_mensagem_lead: ultima, historico, contact_id: body.contact_id || null } }];`;

// Monta: combina config (Carrega Config) + Prepara em campos planos (botões formatados).
// Lê o formato v2 (aninhado em identity/voice/qualification/boundaries) COM fallback
// para o formato flat antigo, então funciona com config v1 ou v2.
const CODE_MONTA = `const cfg = $('Carrega Config').first().json || {};
const p = $('Prepara').first().json || {};
const est = (() => { try { const e = $('Carrega Estado').first().json; return (e && typeof e === 'object') ? e : {}; } catch(x) { return {}; } })();
const id = cfg.identity || {};
const vo = cfg.voice || {};
const qu = cfg.qualification || {};
const bo = cfg.boundaries || {};
const tomMap = { acolhedor: 'acolhedor, caloroso e humano', formal: 'profissional e formal, sóbrio', direto: 'direto e objetivo, sem rodeios' };
const arr = (x) => Array.isArray(x) ? x : [];
const tom = vo.tom || cfg.tom || 'acolhedor';
const etapas = qu.etapas || cfg.etapas;
const faixas = qu.faixas_orcamento || cfg.faixas_orcamento;
const fronteiras = bo.custom || cfg.fronteiras;
const kb = (cfg.capabilities && cfg.capabilities.knowledge) || {};
const faqs = (kb.enabled && Array.isArray(kb.faqs)) ? kb.faqs : [];
const faqs_txt = faqs.map(f => '- P: ' + (f.q||f.pergunta||'') + '\\n  R: ' + (f.a||f.resposta||'')).join('\\n');
// --- v3: política de preço, glossário, comportamentos ---
const pr = cfg.pricing || {};
const revealMap = {
  always: 'Pode mencionar a assessoria e as faixas por destino proativamente, com leveza.',
  on_question: 'Mencione a assessoria de leve quando fizer sentido; só dê as faixas por destino quando o casal perguntar o valor.',
  on_hesitation: 'Só fale de valor se o casal hesitar ou insistir; senão foque no sonho deles.',
  hand_to_planner: 'Não dê faixas de casamento; fale só da assessoria e remeta o resto à Wedding Planner.'
};
const assessoria_txt = pr.mention_fee !== false ? ('Assessoria (nosso honorário): de R$ ' + (pr.fee_min_brl||4000) + ' a R$ ' + (pr.fee_max_brl||18000) + ', conforme o escopo.') : '';
const ranges_txt = arr(pr.destination_ranges).map(r => {
  const tiers = arr(r.tiers).map(t => t.convidados + ' convidados a partir de ' + (t.a_partir!=null?t.a_partir:'') + ' ' + (r.moeda||'')).join('; ');
  return '- ' + (r.destino||'') + ': ' + tiers + (r.contexto ? ' (' + r.contexto + ')' : '');
}).join('\\n');
const pricing_txt = [assessoria_txt, (revealMap[pr.reveal_strategy] || revealMap.on_question), (pr.can_negotiate ? '' : 'NUNCA negocie nem dê desconto, você é SDR.'), (ranges_txt ? ('Faixas de casamento por destino (a partir de):\\n' + ranges_txt) : '')].filter(Boolean).join('\\n');
const gl = vo.glossary || {};
const glossary_usar = arr(gl.marca).map(g => g.palavra || g).filter(Boolean).join(', ');
const glossary_evitar = arr(gl.proibida).map(g => (g.palavra||g) + (g.alternativa ? (' (prefira "' + g.alternativa + '")') : '')).filter(Boolean).join(', ');
const comportamentos_txt = arr(bo.comportamentos).map(c => '- ' + c).join('\\n');
// Critérios de qualificação (com importância). Vazio -> deriva das etapas (todas "importante").
const crit = arr(qu.criteria);
const criterios_txt = (crit.length
  ? crit.map(c => '- ' + (c.label || c.criterio || c) + ' (importância: ' + (c.importancia || c.peso || 'importante') + ')')
  : arr(etapas).map(e => '- ' + e + ' (importância: importante)')
).join('\\n');
return [{ json: {
  persona: id.persona_nome || cfg.persona_nome || 'Sofia',
  empresa: id.empresa || cfg.empresa || 'Welcome Weddings',
  proposta: id.proposta || cfg.proposta || '',
  tom_desc: tomMap[tom] || tom || 'acolhedor, caloroso e humano',
  abertura: vo.abertura || cfg.abertura || '',
  etapas_txt: arr(etapas).map((e,i) => (i+1) + '. ' + e).join('\\n'),
  faixas_txt: arr(faixas).join('; '),
  fronteiras_txt: arr(fronteiras).map(f => '- ' + f).join('\\n'),
  historico: p.historico || '',
  ultima_mensagem_lead: p.ultima_mensagem_lead || '',
  nome: p.nome || '',
  is_primeiro_contato: p.is_primeiro_contato,
  allowed: p.allowed,
  org_id: p.org_id,
  agent_slug: p.agent_slug,
  phone: p.phone,
  resumo_antigo: est.resumo || '',
  contexto_antigo: est.contexto || '',
  criterios_txt: criterios_txt,
  faqs_txt: faqs_txt,
  pricing_txt: pricing_txt,
  glossary_usar: glossary_usar,
  glossary_evitar: glossary_evitar,
  comportamentos_txt: comportamentos_txt,
  bubbles_enabled: !!(cfg.capabilities && cfg.capabilities.memory && cfg.capabilities.memory.enabled && cfg.capabilities.memory.bubbles_enabled),
  crm_write_enabled: !!(cfg.capabilities && cfg.capabilities.crm_write && cfg.capabilities.crm_write.enabled),
  calendar_enabled: !!(cfg.capabilities && cfg.capabilities.calendar && cfg.capabilities.calendar.enabled),
}}];`;

// Extrai Reuniao: detecta se o casal CONFIRMOU um horário específico + e-mail.
const BOOK_SYSTEM = `Você analisa a conversa de casamento e decide se o casal CONFIRMOU um horário específico de reunião com a Wedding Planner. Devolva SOMENTE um JSON (sem markdown/crases): {"confirmou": true|false, "iso": "YYYY-MM-DDTHH:MM:SS-03:00" ou "", "email": "" }. confirmou=true só se o casal escolheu um dia E hora concretos e topou. Se não houver hora concreta confirmada, confirmou=false e iso "".`;
const BOOK_USER = `Conversa:
{{ $('Monta').item.json.historico }}
Última mensagem do casal: {{ $('Monta').item.json.ultima_mensagem_lead }}
Devolva só o JSON.`;
const CODE_PARSE_BOOK = `let t = String($('Extrai Reuniao').item.json.output || '').trim();
t = t.replace(/^\`\`\`(json)?/i,'').replace(/\`\`\`$/,'').trim();
let r = {}; try { r = JSON.parse(t); } catch(e) { r = {}; }
const m = $('Monta').first().json;
const ok = r && r.confirmou === true && typeof r.iso === 'string' && r.iso.length >= 16;
if (!ok) return [];
return [{ json: { iso: r.iso, org_id: m.org_id, agent_slug: m.agent_slug, phone: m.phone, nome: m.nome } }];`;

// Extrai Dados (Agente 2 da Camila — "Atualiza dados"): lê a conversa e devolve SÓ
// um JSON com os campos ww_* ditos EXPLICITAMENTE pelo casal. Nada de inventar.
const EXTRACT_SYSTEM = `Você é um extrator de dados de uma conversa de casamento. Leia a conversa e devolva SOMENTE um JSON (sem texto, sem markdown, sem crases) com as chaves que o casal disse EXPLICITAMENTE. Chaves possíveis: ww_destino (cidade/região do casamento), ww_num_convidados (número, só dígitos), ww_orcamento_faixa (faixa ou valor que o CASAL pretende investir), ww_data_casamento (data YYYY-MM-DD se houver), ww_nome_parceiro (nome do parceiro/segunda pessoa do casal). Omita chaves não ditas. Se nada foi dito, devolva {}.`;
const EXTRACT_USER = `Conversa até aqui:
{{ $('Monta').item.json.historico }}
Última mensagem do casal: {{ $('Monta').item.json.ultima_mensagem_lead }}
Devolva só o JSON.`;

// Parse seguro do JSON extraído (tira crases/markdown, try/catch -> {}).
const CODE_PARSE = `let t = String($('Extrai Dados').item.json.output || '').trim();
t = t.replace(/^\`\`\`(json)?/i,'').replace(/\`\`\`$/,'').trim();
let fields = {};
try { fields = JSON.parse(t); } catch(e) { fields = {}; }
if (typeof fields !== 'object' || Array.isArray(fields)) fields = {};
const m = $('Monta').first().json;
return [{ json: { fields, org_id: m.org_id, agent_slug: m.agent_slug, phone: m.phone, nome: m.nome } }];`;

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

// Bolhas: divide a resposta em 1-3 mensagens curtas (entrega humana) quando ligado.
// Defensivo: qualquer erro -> uma bolha só. Não quebra a réplica.
const CODE_BOLHAS = `const out = String($('Limpa Travessao').item.json.output || '');
const m = $('Monta').first().json;
let bubbles = [out];
try {
  if (m.bubbles_enabled && out.length > 90) {
    const parts = out.split(/(?<=[.!?…])\\s+/).filter(s => s.trim());
    const acc = []; let cur = '';
    for (const p of parts) {
      if ((cur + ' ' + p).trim().length > 160 && cur) { acc.push(cur.trim()); cur = p; }
      else { cur = (cur ? cur + ' ' : '') + p; }
    }
    if (cur.trim()) acc.push(cur.trim());
    bubbles = acc.length ? acc : [out];
    if (bubbles.length > 3) bubbles = [bubbles.slice(0, 2).join(' '), bubbles.slice(2).join(' ')];
  }
} catch (e) { bubbles = [out]; }
return [{ json: { output: out, bubbles, allowed: $('Prepara').first().json.allowed } }];`;

// Agente 1 — Consolidador (cérebro humano): mantém resumo/contexto/sinais do casal.
const CONSOLIDA_SYSTEM = `Você consolida o ESTADO de uma conversa de casamento da {{ $('Monta').item.json.empresa }}. Leia o histórico + o resumo/contexto ANTERIORES e devolva SOMENTE um JSON válido (sem markdown, sem crases) com:
- "resumo": fatos estáveis do casal (nomes, destino/região, nº de convidados, orçamento do casal, data pretendida, restrições). Frases curtas.
- "contexto": onde a conversa está, o que já aconteceu e o próximo passo natural.
- "sinais": objeto só com sinais VERDADEIROS detectados, ex: {"fuga": true, "pressao_familia": true, "hesitacao_preco": true, "urgencia": true}. Se nenhum, {}.
Atualize a partir do anterior; NÃO invente. Se não há novidade, repita o anterior.`;
const CONSOLIDA_USER = `Resumo anterior: {{ $('Monta').item.json.resumo_antigo || '(vazio)' }}
Contexto anterior: {{ $('Monta').item.json.contexto_antigo || '(vazio)' }}

Histórico:
{{ $('Monta').item.json.historico || '(começo)' }}
Última mensagem do casal: {{ $('Monta').item.json.ultima_mensagem_lead }}

Devolva só o JSON {resumo, contexto, sinais}.`;
const CODE_PARSE_CONSOLIDA = `let t = String($('Consolida').item.json.output || '').trim();
t = t.replace(/^\`\`\`(json)?/i,'').replace(/\`\`\`$/,'').trim();
let r = {};
try { r = JSON.parse(t); } catch(e) { r = {}; }
const m = $('Monta').first().json;
return [{ json: {
  resumo: (r && typeof r.resumo === 'string') ? r.resumo : (m.resumo_antigo || ''),
  contexto: (r && typeof r.contexto === 'string') ? r.contexto : (m.contexto_antigo || ''),
  sinais: (r && r.sinais && typeof r.sinais === 'object') ? r.sinais : {},
  org_id: m.org_id, agent_slug: m.agent_slug, phone: m.phone,
}}];`;

// Agente 2 — Qualificador INTELIGENTE: nota 0-100 + o que falta + próxima pergunta.
// LLM com julgamento (não soma de pesos). Lê os critérios+importância editáveis e o
// estado consolidado, devolve uma SUGESTÃO que o Respondedor pode usar ou ignorar.
const QUALIFICA_SYSTEM = `Você é o qualificador de leads de casamento da {{ $('Monta').item.json.empresa }}. A partir dos CRITÉRIOS (com a importância de cada um) e do estado consolidado da conversa, julgue o fit do casal e devolva SOMENTE um JSON válido (sem markdown, sem crases):
{"score": 0-100, "qualificado": true|false, "faixa": "quente"|"morno"|"frio", "breakdown": [{"criterio": "...", "atende": true|false, "nota": "frase curta"}], "falta": ["o que ainda precisa entender"], "proxima_pergunta_sugerida": "uma pergunta aberta e natural, ou '' se ainda não é hora de perguntar"}
Regras: score é JULGAMENTO (não soma mecânica de pesos). Critério com importância "desqualifica" presente derruba o score. qualificado=true só com fit real e os essenciais cobertos. faixa: quente >=70, morno 40-69, frio <40. Baseie-se SÓ no que está no resumo/contexto; não invente. Se o casal hesita ou está emotivo, a proxima_pergunta_sugerida pode ser '' (melhor acolher antes de perguntar).`;
const QUALIFICA_USER = `Critérios de qualificação (com importância):
{{ $('Monta').item.json.criterios_txt }}

Estado consolidado:
- Resumo do casal: {{ $('Parse Consolida').item.json.resumo || '(vazio)' }}
- Onde estamos: {{ $('Parse Consolida').item.json.contexto || '(início)' }}
- Sinais: {{ JSON.stringify($('Parse Consolida').item.json.sinais || {}) }}
Última mensagem do casal: {{ $('Monta').item.json.ultima_mensagem_lead }}

Devolva só o JSON {score, qualificado, faixa, breakdown, falta, proxima_pergunta_sugerida}.`;
const CODE_PARSE_QUALIFICA = `let t = String($('Qualifica').item.json.output || '').trim();
t = t.replace(/^\`\`\`(json)?/i,'').replace(/\`\`\`$/,'').trim();
let r = {};
try { r = JSON.parse(t); } catch(e) { r = {}; }
if (typeof r !== 'object' || Array.isArray(r) || !r) r = {};
let score = Number(r.score);
if (!isFinite(score)) score = 0;
score = Math.max(0, Math.min(100, Math.round(score)));
const faixa = (typeof r.faixa === 'string') ? r.faixa : (score >= 70 ? 'quente' : score >= 40 ? 'morno' : 'frio');
const falta = Array.isArray(r.falta) ? r.falta.filter(x => typeof x === 'string') : [];
return [{ json: {
  score,
  qualificado: r.qualificado === true,
  faixa,
  falta,
  falta_txt: falta.length ? falta.join('; ') : '(nada essencial faltando)',
  proxima_pergunta_sugerida: (typeof r.proxima_pergunta_sugerida === 'string') ? r.proxima_pergunta_sugerida : '',
}}];`;

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
        jsonBody: `={{ JSON.stringify({ p_slug: $('Prepara').first().json.agent_slug, p_org_id: $('Prepara').first().json.org_id }) }}`,
        options: {},
      },
      credentials: { supabaseApi: SUPABASE_CREDENTIAL } },
    { id: 'estado', name: 'Carrega Estado', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [740, 460],
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/wsdr_get_conversation_state`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
        sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ p_org_id: $('Prepara').first().json.org_id, p_agent_slug: $('Prepara').first().json.agent_slug, p_contact_phone: $('Prepara').first().json.phone }) }}`,
        options: { response: { response: { neverError: true } } },
      },
      credentials: { supabaseApi: SUPABASE_CREDENTIAL } },
    { id: 'monta', name: 'Monta', type: 'n8n-nodes-base.code', typeVersion: 2, position: [840, 300],
      parameters: { jsCode: CODE_MONTA } },
    { id: 'consolida', name: 'Consolida', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 2.2, position: [1020, 460],
      parameters: { promptType: 'define', text: '=' + CONSOLIDA_USER, options: { systemMessage: '=' + CONSOLIDA_SYSTEM, enableStreaming: false } } },
    { id: 'modelconsolida', name: 'Modelo Consolida', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, position: [1020, 660],
      parameters: { model: { __rl: true, value: MODEL_ID, mode: 'list', cachedResultName: MODEL_ID }, options: MODEL_OPTIONS },
      credentials: { openAiApi: OPENAI_CREDENTIAL } },
    { id: 'parseconsolida', name: 'Parse Consolida', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1220, 460],
      parameters: { jsCode: CODE_PARSE_CONSOLIDA } },
    { id: 'salvaestado', name: 'Salva Estado', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1420, 460],
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/wsdr_save_conversation_state`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
        sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ p_org_id: $('Parse Consolida').item.json.org_id, p_agent_slug: $('Parse Consolida').item.json.agent_slug, p_contact_phone: $('Parse Consolida').item.json.phone, p_resumo: $('Parse Consolida').item.json.resumo, p_contexto: $('Parse Consolida').item.json.contexto, p_sinais: $('Parse Consolida').item.json.sinais }) }}`,
        options: { response: { response: { neverError: true } } },
      },
      credentials: { supabaseApi: SUPABASE_CREDENTIAL } },
    { id: 'qualifica', name: 'Qualifica', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 2.2, position: [1560, 460],
      parameters: { promptType: 'define', text: '=' + QUALIFICA_USER, options: { systemMessage: '=' + QUALIFICA_SYSTEM, enableStreaming: false } } },
    { id: 'modelqualifica', name: 'Modelo Qualifica', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, position: [1560, 660],
      parameters: { model: { __rl: true, value: MODEL_ID, mode: 'list', cachedResultName: MODEL_ID }, options: MODEL_OPTIONS },
      credentials: { openAiApi: OPENAI_CREDENTIAL } },
    { id: 'parsequalifica', name: 'Parse Qualifica', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1760, 460],
      parameters: { jsCode: CODE_PARSE_QUALIFICA } },
    { id: 'agente', name: 'Responde Lead', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 2.2, position: [1940, 300],
      parameters: { promptType: 'define', text: '=' + USER_TEXT, options: { systemMessage: '=' + SYSTEM_PROMPT, enableStreaming: false } } },
    { id: 'model', name: 'OpenAI Chat Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, position: [1060, 520],
      parameters: { model: { __rl: true, value: MODEL_ID, mode: 'list', cachedResultName: MODEL_ID }, options: MODEL_OPTIONS },
      credentials: { openAiApi: OPENAI_CREDENTIAL } },
    { id: 'limpa', name: 'Limpa Travessao', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1260, 300],
      parameters: { jsCode: CODE_LIMPA } },
    { id: 'bolhas', name: 'Bolhas', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1370, 300],
      parameters: { jsCode: CODE_BOLHAS } },
    { id: 'responde', name: 'Responde Webhook', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1, position: [1480, 300],
      parameters: { respondWith: 'json', responseBody: '={{ { "reply": $json.output, "bubbles": $json.bubbles, "allowed": $json.allowed } }}', options: {} } },
    // --- Ramo de gravação no CRM (Agente 2 da Camila), pós-resposta, gated por config ---
    { id: 'crmgate', name: 'CRM Gate', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1480, 520],
      parameters: { jsCode: `const m = $('Monta').first().json; return m.crm_write_enabled ? [{ json: m }] : [];` } },
    { id: 'extrai', name: 'Extrai Dados', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 2.2, position: [1680, 520],
      parameters: { promptType: 'define', text: '=' + EXTRACT_USER, options: { systemMessage: '=' + EXTRACT_SYSTEM, enableStreaming: false } } },
    { id: 'modelextrai', name: 'Modelo Extrai', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, position: [1680, 700],
      parameters: { model: { __rl: true, value: MODEL_ID, mode: 'list', cachedResultName: MODEL_ID }, options: MODEL_OPTIONS },
      credentials: { openAiApi: OPENAI_CREDENTIAL } },
    { id: 'parse', name: 'Parse Dados', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1880, 520],
      parameters: { jsCode: CODE_PARSE } },
    { id: 'gravacrm', name: 'Grava CRM', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [2080, 520],
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/wsdr_persist_lead`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
        sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ p_org_id: $('Parse Dados').item.json.org_id, p_agent_slug: $('Parse Dados').item.json.agent_slug, p_contact_phone: $('Parse Dados').item.json.phone, p_contact_name: $('Parse Dados').item.json.nome, p_fields: $('Parse Dados').item.json.fields }) }}`,
        options: {},
      },
      credentials: { supabaseApi: SUPABASE_CREDENTIAL } },
    // --- Ramo de agenda (marca reunião se o casal confirmou horário), pós-resposta, gated ---
    { id: 'agendagate', name: 'Agenda Gate', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1480, 760],
      parameters: { jsCode: `const m = $('Monta').first().json; return m.calendar_enabled ? [{ json: m }] : [];` } },
    { id: 'extraireuniao', name: 'Extrai Reuniao', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 2.2, position: [1680, 760],
      parameters: { promptType: 'define', text: '=' + BOOK_USER, options: { systemMessage: '=' + BOOK_SYSTEM, enableStreaming: false } } },
    { id: 'modelreuniao', name: 'Modelo Reuniao', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, position: [1680, 940],
      parameters: { model: { __rl: true, value: MODEL_ID, mode: 'list', cachedResultName: MODEL_ID }, options: MODEL_OPTIONS },
      credentials: { openAiApi: OPENAI_CREDENTIAL } },
    { id: 'parsereuniao', name: 'Parse Reuniao', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1880, 760],
      parameters: { jsCode: CODE_PARSE_BOOK } },
    { id: 'marcareuniao', name: 'Marca Reuniao', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [2080, 760],
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/wsdr_book_meeting`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
        sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ p_org_id: $('Parse Reuniao').item.json.org_id, p_agent_slug: $('Parse Reuniao').item.json.agent_slug, p_contact_phone: $('Parse Reuniao').item.json.phone, p_contact_name: $('Parse Reuniao').item.json.nome, p_iso: $('Parse Reuniao').item.json.iso }) }}`,
        options: {},
      },
      credentials: { supabaseApi: SUPABASE_CREDENTIAL } },
  ];
  const connections = {
    'Webhook SDR Weddings': { main: [[{ node: 'Prepara', type: 'main', index: 0 }]] },
    'Prepara': { main: [[{ node: 'Carrega Config', type: 'main', index: 0 }]] },
    'Carrega Config': { main: [[{ node: 'Carrega Estado', type: 'main', index: 0 }]] },
    'Carrega Estado': { main: [[{ node: 'Monta', type: 'main', index: 0 }]] },
    'Monta': { main: [[{ node: 'Consolida', type: 'main', index: 0 }]] },
    'Modelo Consolida': { ai_languageModel: [[{ node: 'Consolida', type: 'ai_languageModel', index: 0 }]] },
    'Consolida': { main: [[{ node: 'Parse Consolida', type: 'main', index: 0 }]] },
    'Parse Consolida': { main: [[{ node: 'Salva Estado', type: 'main', index: 0 }]] },
    'Salva Estado': { main: [[{ node: 'Qualifica', type: 'main', index: 0 }]] },
    'Modelo Qualifica': { ai_languageModel: [[{ node: 'Qualifica', type: 'ai_languageModel', index: 0 }]] },
    'Qualifica': { main: [[{ node: 'Parse Qualifica', type: 'main', index: 0 }]] },
    'Parse Qualifica': { main: [[{ node: 'Responde Lead', type: 'main', index: 0 }]] },
    'OpenAI Chat Model': { ai_languageModel: [[{ node: 'Responde Lead', type: 'ai_languageModel', index: 0 }]] },
    'Responde Lead': { main: [[{ node: 'Limpa Travessao', type: 'main', index: 0 }]] },
    'Limpa Travessao': { main: [[{ node: 'Bolhas', type: 'main', index: 0 }]] },
    'Bolhas': { main: [[{ node: 'Responde Webhook', type: 'main', index: 0 }]] },
    'Responde Webhook': { main: [[{ node: 'CRM Gate', type: 'main', index: 0 }, { node: 'Agenda Gate', type: 'main', index: 0 }]] },
    'CRM Gate': { main: [[{ node: 'Extrai Dados', type: 'main', index: 0 }]] },
    'Modelo Extrai': { ai_languageModel: [[{ node: 'Extrai Dados', type: 'ai_languageModel', index: 0 }]] },
    'Extrai Dados': { main: [[{ node: 'Parse Dados', type: 'main', index: 0 }]] },
    'Parse Dados': { main: [[{ node: 'Grava CRM', type: 'main', index: 0 }]] },
    'Agenda Gate': { main: [[{ node: 'Extrai Reuniao', type: 'main', index: 0 }]] },
    'Modelo Reuniao': { ai_languageModel: [[{ node: 'Extrai Reuniao', type: 'ai_languageModel', index: 0 }]] },
    'Extrai Reuniao': { main: [[{ node: 'Parse Reuniao', type: 'main', index: 0 }]] },
    'Parse Reuniao': { main: [[{ node: 'Marca Reuniao', type: 'main', index: 0 }]] },
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
