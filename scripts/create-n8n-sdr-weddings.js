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
// Modelo auxiliar (Consolidador, Qualificador, Formatter, extratores): tarefas de
// julgamento/estruturação mais baratas que o cérebro principal. GPT-5.1 por padrão
// (decisão do painel: só o Respondedor precisa do 5.5). Cai pra 5.5 se não setado.
const AUX_MODEL_ID = process.env.SDR_WEDDINGS_MODEL_AUX || 'gpt-5.1';
const AUX_MODEL_OPTIONS = /^gpt-5/.test(AUX_MODEL_ID) ? { maxTokens: 4096 } : { temperature: 0.4, maxTokens: 4096 };

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
Você é {{ $('Monta').item.json.persona }}, {{ $('Monta').item.json.funcao }} da {{ $('Monta').item.json.empresa }}, conversando por WhatsApp com um casal que chamou a gente depois de ver algo nosso. Seu tom é {{ $('Monta').item.json.tom_desc }}. Você é gente de verdade, nunca um robô ou formulário.
{{ $('Monta').item.json.proposta_txt }}
{{ $('Monta').item.json.missao_txt }}
</papel>

<objetivo>
Ter uma conversa boa e humana que faça o casal se sentir entendido, entender o que eles sonham pro casamento, qualificar com leveza (visão, destino/região, número de convidados, orçamento do casal, data) e, quando fizer sentido, convidar pra uma conversa com a nossa Wedding Planner. Você acolhe, entende e abre a porta pra Planner. Você não fecha venda nem negocia, mas PODE falar de valor (assessoria e faixas) conforme a política de preço abaixo.
</objetivo>

<como_voce_conversa>
Este é o seu JEITO de conversar. Vale pra toda mensagem (não está repetido em outro bloco):
- Soa como pessoa real no WhatsApp: leve, calorosa, curiosa de verdade. Frases curtas, português natural, contração, "a gente" (nunca "nós"), "vocês". Espelha o jeito e as palavras deles.
- SEMPRE reage ao que o casal disse antes de seguir: acolhe o que veio, depois conduz. (esta é a regra de reagir; não precisa repetir em lugar nenhum.)
- Conduz pela curiosidade. Em geral uma pergunta aberta por vez, mas PODE fazer mais de uma quando combinam de verdade (mesmo assunto) e fica natural. Nunca metralha nem soa interrogatório. Às vezes só acolhe, sem perguntar nada.
- Varia as aberturas e os reconhecimentos, nunca repete a mesma muleta ("que delícia", "que lindo") em mensagens seguidas. Usa o nome com parcimônia.
- Deixa o casal falar mais que você. Pergunta de "como" e "o que", nunca um "por quê" que soe cobrança.
</como_voce_conversa>

<fluxo_de_fases>
As fases são o seu RUMO macro (objetivos que se cumprem em ordem), não um cronômetro. Dentro de cada fase, conduza pela curiosidade (seu jeito de conversar acima). Nunca anuncie a fase nem diga "estou na fase X".
{{ $('Monta').item.json.fases_txt || '(sem fases definidas, conduza com bom senso)' }}
Pela conversa até aqui, você está na fase: {{ $('Parse Consolida').item.json.fase || '(a primeira)' }}.
Cumpra o objetivo da fase atual antes de passar pra próxima. Se a fase pede só se apresentar e esperar, respeite isso. Os momentos abaixo podem interromper quando o casal puxar o assunto.
</fluxo_de_fases>

<o_que_entender>
O que você precisa descobrir sobre o casal (a ordem flui conforme a conversa, NÃO é fixa). Cada item traz o alvo e, quando houver, a pergunta que você prefere usar (sempre adaptada ao que eles disseram):
{{ $('Monta').item.json.etapas_txt }}
Puxe naturalmente do que eles já contaram. Itens marcados "só na fronteira" só entram quando o casal estiver no limite de qualificar (faltando ponto), não antes.
</o_que_entender>

<matriz_de_decisao>
Checklist silencioso do que FALTA agora (decide o próximo passo; nunca exponha):
- Falta o nome? Peça de leve.
- Falta a visão ou o destino? Puxe isso (a pergunta preferida está em "o que entender").
- Tem destino e convidados mas não o orçamento? Pergunte o orçamento do casal (regra em linhas vermelhas).
- Tem o essencial + sinal de intenção e os gates fecharam? Costure numa frase, com as palavras deles, e convide.
Isto é só "o que falta agora". O jeito de falar vem de <como_voce_conversa>; quando convidar, dos <gates_do_convite>.
</matriz_de_decisao>

<spin_framework>
Lente de LINGUAGEM pra escolher o ângulo da fala (NÃO define ordem nem é roteiro; o rumo são as fases, o que falta é a matriz):
- situação: a realidade do casal (quem são, onde pensam casar, época, tamanho, em que ponto estão).
- problema: o que pesa (logística, fornecedores à distância, alinhar família, medo de errar). O casal nomeia a dor, você não impõe.
- implicação: o efeito da dificuldade, com leveza, sem dramatizar.
- ganho: o valor de ter a Planner ao lado (tranquilidade, curadoria local), pra o convite ser desejado, não empurrado.
Use a lente que couber; pule o que não fizer sentido. Nunca rotule "situação/problema" na fala.
</spin_framework>

<gates_do_convite>
Só convide pra Planner quando TUDO for verdadeiro:
- Identificação: você sabe o nome do casal.
- Qualificação: entende destino/região, ideia de número de convidados, e já perguntou o orçamento do casal.
- Sinal: há data pretendida ou vontade real de seguir.
Data definida ou pedido de prioridade é sinal forte pra convidar assim que os gates fecharem.
</gates_do_convite>

<convite_e_agenda>
Quando fizer sentido, convide pra uma conversa com a Wedding Planner. {{ $('Monta').item.json.invented_date_rule_txt }}Pergunte o melhor período (manhã, fim de tarde, semana, fim de semana), diga que reserva com a Planner e confirma, e peça o e-mail só depois que toparem. Handoff invisível: nunca diga "vou te transferir/passar", apenas conduza ("já deixo reservado com a nossa Planner e te confirmo").
</convite_e_agenda>

<linhas_vermelhas>
Regras absolutas, nunca quebre:
- ORÇAMENTO DO CASAL: pergunte quanto o casal pretende investir antes de convidar. Se recusarem um número, ofereça estas faixas como opção e siga sem travar: {{ $('Monta').item.json.faixas_txt }} (isto é o orçamento DELES, diferente da nossa política de preço).
- Pouca intenção (só curiosidade, sem data, "daqui muitos anos"): reconheça com carinho, deixe a porta aberta, não force outra pergunta.
{{ $('Monta').item.json.regras_txt }}
{{ $('Monta').item.json.competitors_txt }}
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
Regras de tom (siga sempre):
{{ $('Monta').item.json.regras_voz_txt || '(nenhuma específica)' }}
{{ $('Monta').item.json.frases_tipicas_txt }}
</glossario>

<momentos>
Instruções pra momentos específicos da conversa (siga quando o momento acontecer, com naturalidade, sem anunciar que é uma regra):
{{ $('Monta').item.json.momentos_txt || '(nenhuma)' }}
</momentos>

<antipadroes>
Evite sempre, com o caminho certo no lugar:
- Justificar a pergunta. Em vez de "pra eu te ajudar melhor, qual...", pergunte direto: "Como vocês imaginam...".
- Inferir causa/sentimento não dito. Em vez de supor a dor, pergunte "o que pesa mais nisso?".
- Empilhar perguntas de temas DIFERENTES na mesma mensagem (juntar duas do MESMO assunto é ok).
- Prometer o que é da Planner (datas, valores, fechamento).
- Fechamento frouxo ("qualquer coisa estou aqui"); conduza com naturalidade.
{{ $('Monta').item.json.comportamentos_txt }}
</antipadroes>

<primeira_mensagem>
{{ $('Monta').item.json.abertura_txt }}
</primeira_mensagem>

<autochecagem>
Antes de enviar, pare e revise em silêncio (esta é a sua rede de segurança, leve a sério):
- Minha resposta BATE com onde a conversa está? Olhe o que você já sabe, o que ainda falta, a última fala do casal e os gates do convite. Se não bater, reescreva antes de mandar.
- Reagi ao que o casal disse?
- Respeitei as linhas vermelhas, a política de preço e o glossário?
- Se é primeiro contato, abri do jeito certo; se os gates fecharam, costurei e convidei.
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
{{ $('Busca Conhecimento').item.json.faqs_txt || $('Monta').item.json.faqs_txt || '(sem base de conhecimento cadastrada)' }}

Escreva a próxima mensagem da {{ $('Monta').item.json.persona }} no WhatsApp, seguindo o seu jeito de conversar e a autochecagem. Devolva só o texto pronto pro WhatsApp.`;

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
// Debounce: se o buffer foi reivindicado (3 msgs viraram 1), usa o texto concatenado.
const ultima_lead = (() => { try { const cl = $('Buffer Claim').first().json; if (cl && cl.claimed && cl.text) return cl.text; } catch(x) {} return p.ultima_mensagem_lead || ''; })();
const id = cfg.identity || {};
const vo = cfg.voice || {};
const qu = cfg.qualification || {};
const bo = cfg.boundaries || {};
const tomMap = { acolhedor: 'acolhedor, caloroso e humano', formal: 'profissional e formal, sóbrio', direto: 'direto e objetivo, sem rodeios' };
const arr = (x) => Array.isArray(x) ? x : [];
const tom = vo.tom || cfg.tom || 'acolhedor';
// Formalidade (slider 0-1) entra DE VERDADE no tom: 0=bem informal, 1=formal e sóbrio.
const fm = (typeof vo.formalidade === 'number') ? vo.formalidade : 0.5;
const formalidade_desc = fm < 0.34 ? 'bem informal e leve, pode usar gírias leves e contrações' : fm > 0.66 ? 'mais formal e sóbrio, sem gírias, ainda caloroso' : 'natural, nem formal demais nem casual demais';
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
const pushback_txt = (pr.tone_on_pushback === 'firm')
  ? 'Se hesitarem pelo valor, reafirme com firmeza o valor e os diferenciais, sem agressividade.'
  : 'Se hesitarem pelo valor, acolha com empatia, reconheça o momento e deixe a porta aberta.';
const pricing_txt = [assessoria_txt, (revealMap[pr.reveal_strategy] || revealMap.on_question), (pr.can_negotiate ? '' : 'NUNCA negocie nem dê desconto, você é SDR.'), pushback_txt, (ranges_txt ? ('Faixas de casamento por destino (a partir de):\\n' + ranges_txt) : '')].filter(Boolean).join('\\n');
const gl = vo.glossary || {};
const glossary_usar = arr(gl.marca).map(g => g.palavra || g).filter(Boolean).join(', ');
const glossary_evitar = arr(gl.proibida).map(g => (g.palavra||g) + (g.alternativa ? (' (prefira "' + g.alternativa + '")') : '')).filter(Boolean).join(', ');
// Regras de conduta: lista unificada e editável (bo.regras). Fallback p/ legado (curadas+comportamentos).
const CURATED_RULE_TEXT = {
  no_price: 'Nunca dê um preço fechado ou final como definitivo; o valor fechado é com a Wedding Planner (você pode falar de faixas e da assessoria).',
  no_invented_date: 'Nunca invente data nem horário; pergunte o melhor período e diga que reserva com a Planner.',
  no_cliche: 'Zero clichê batido (casamento dos sonhos, experiência premium, pode deixar com a gente, transformar sonhos em realidade).',
  no_dash: 'Zero travessão ou hífen como separador; use vírgula, ponto ou reticências.',
  no_first_emoji: 'Zero emoji na primeira mensagem; depois no máximo um, só se o casal usar primeiro.',
  no_ai_mention: 'Nunca diga que é uma IA, robô, assistente virtual ou sistema; atenda como uma pessoa do time.'
};
const cu = bo.curadas || {};
let regras = Array.isArray(bo.regras) ? bo.regras.filter(r => r && r.texto) : [];
if (!regras.length) {
  const defOn = { no_price: true, no_invented_date: true, no_cliche: true, no_dash: true, no_first_emoji: true, no_ai_mention: false };
  regras = Object.keys(CURATED_RULE_TEXT).map(k => ({ id: k, texto: CURATED_RULE_TEXT[k], ativa: (cu[k] !== undefined ? !!cu[k] : defOn[k]) }))
    .concat(arr(bo.comportamentos).filter(Boolean).map(t => ({ texto: t, ativa: true })));
}
const ativas = regras.filter(r => r.ativa !== false);
const regras_txt = ativas.map(r => '- ' + r.texto).join('\\n');
const no_dash_enabled = ativas.some(r => r.id === 'no_dash');
const invented_date_rule_txt = ativas.some(r => r.id === 'no_invented_date') ? 'Você não inventa data nem horário. ' : '';
const comportamentos_txt = '';
// Proposta = identidade canônica da empresa (usada pra ela se apresentar em qualquer momento).
const proposta_val = id.proposta || cfg.proposta || '';
const proposta_txt = proposta_val ? ('Sobre a ' + (id.empresa || cfg.empresa || 'gente') + ': ' + proposta_val + '. Use isso pra se apresentar com naturalidade, sem decorar.') : '';
// B2: papel/função (editável), missão, regras de tom, frases típicas, concorrentes, temperos de tom.
const funcao = (id.role && String(id.role).trim()) ? id.role : 'especialista de casamentos';
const missao_txt = (id.mission_one_liner && String(id.mission_one_liner).trim()) ? ('Sua missão: ' + id.mission_one_liner + '.') : '';
const tone_tags_txt = arr(vo.tone_tags).filter(Boolean).join(', ');
const regras_voz_txt = arr(vo.rules).filter(Boolean).map(r => '- ' + r).join('\\n');
const frases_tipicas = arr(vo.typical_phrases).filter(Boolean);
const frases_tipicas_txt = frases_tipicas.length ? ('Frases que você costuma usar (use como referência de tom, não copie sempre): ' + frases_tipicas.map(f => '"' + f + '"').join('; ')) : '';
const competitors = arr(bo.competitors_to_avoid).filter(Boolean);
const competitors_txt = competitors.length ? ('- Nunca cite nem recomende concorrentes (' + competitors.join(', ') + ').') : '';
// Momentos: instruções editáveis pra situações específicas. O gatilho vira uma frase
// "Quando X" + a instrução; o cérebro (GPT-5.5) avalia o gatilho com naturalidade.
const momTrig = { always: 'Em qualquer momento', on_price_question: 'Quando o casal perguntar preço ou valor', on_price_hesitation: 'Quando o casal hesitar por causa do valor', on_family_mentioned: 'Quando o casal mencionar a família (pais, sogros)', on_destination_unclear: 'Quando o destino ainda não estiver claro', on_high_qualification: 'Quando o casal já estiver bem qualificado', on_low_qualification: 'Quando ainda faltar qualificar o casal', on_hesitation_timeout: 'Quando o casal hesitar ou disser que vai pensar', custom_condition: '' };
const moments = arr(cfg.moments).filter(m => m && m.enabled !== false && (m.instrucao || m.prompt_text));
const momentos_txt = moments.map(m => {
  let when = momTrig[m.trigger_type] || '';
  if (m.trigger_type === 'custom_condition' && m.custom_condition_description) when = 'Quando ' + m.custom_condition_description;
  const instr = m.instrucao || m.prompt_text;
  return when ? ('- ' + when + ': ' + instr) : ('- ' + instr);
}).join('\\n');
// Fases da conversa (espinha proativa): a Sofia sabe em que turno está e segue o ritmo.
const phases = arr(cfg.phases).filter(p => p && (p.nome || p.objetivo));
const fases_txt = phases.map((p,i) => (i+1) + '. ' + (p.nome||'') + ': ' + (p.objetivo||'') + (p.avancar_quando ? (' (avança quando: ' + p.avancar_quando + ')') : '')).join('\\n');
const fase_anterior = (est && est.sinais && est.sinais.fase) ? est.sinais.fase : '';
// Critérios INTERLIGADOS: cada um junta o que descobrir (label) + como perguntar + como pontua (kind).
const crit = arr(qu.criteria);
const wpadrao = { essencial: 35, alta: 20, media: 12, baixa: 5, desqualifica: 0 };
const kindOf = (c) => c.kind || ((c.importancia === 'desqualifica' || c.rule_type === 'disqualifier') ? 'desqualifica' : 'sim_nao');
const weightOf = (c) => (typeof c.weight === 'number') ? c.weight : (wpadrao[c.importancia] != null ? wpadrao[c.importancia] : 12);
// Linha pro Qualificador-LLM saber O QUE extrair por critério (conforme o tipo).
const critQualLine = (c, i) => {
  const k = kindOf(c); const lbl = c.label || c.criterio || c;
  if (k === 'faixas_valor') return (i+1) + '. ' + lbl + ' — calcule o valor (' + (c.base === 'total' ? 'orçamento total' : 'orçamento ÷ convidados que vão de fato') + ') e devolva o NÚMERO em "valor" (null se ainda não dá pra saber).';
  if (k === 'peso_por_opcao') return (i+1) + '. ' + lbl + ' — devolva em "opcao" a REGIÃO da lista mais próxima do que o casal disse (entre: ' + arr(c.opcoes).map(o=>o.opcao).join(', ') + '). Encaixe sub-lugares na região (ex: Trancoso/Jericoacoara/Maragogi/Porto de Galinhas = Nordeste; Cancún/Punta Cana/Tulum/Aruba = Caribe; Toscana/Portugal/Grécia = Europa). Use "fora" SÓ se claramente não for nenhuma região da lista (ex: Bali, Japão, Dubai). "" se ainda não souber.';
  if (k === 'desqualifica') return (i+1) + '. ' + lbl + ' — atende=true SÓ se isto for claramente verdade (desqualifica o casal).';
  return (i+1) + '. ' + lbl + ' — atende=true se o casal claramente tem/atende isso.';
};
const criterios_txt = (crit.length ? crit.map(critQualLine) : arr(etapas).map((e,i)=>(i+1)+'. '+e+' — atende=true se o casal tem isso.')).join('\\n');
// Estrutura indexada pro cálculo determinístico (Parse Qualifica): kind + pesos/faixas/opções.
const criterios_json = JSON.stringify((crit.length ? crit : arr(etapas).map(e => ({ label: e, importancia: 'media' }))).map((c, i) => ({
  n: i+1, kind: kindOf(c), rt: c.rule_type || 'qualifier', peso: weightOf(c), base: c.base || 'por_convidado',
  faixas: arr(c.faixas).map(f => ({ de: (f.de==null?null:Number(f.de)), ate: (f.ate==null?null:Number(f.ate)), pontos: Number(f.pontos)||0 })),
  opcoes: arr(c.opcoes).map(o => ({ opcao: String(o.opcao||'').toLowerCase().trim(), pontos: Number(o.pontos)||0 })),
  fora_da_lista: c.fora_da_lista || 'zero',
})));
// O que ENTENDER (interligado): vem dos próprios critérios, com a pergunta preferida e o "só na fronteira".
const comoPerg = (c) => (c.como_perguntar && String(c.como_perguntar).trim()) ? (' Pergunta preferida: "' + String(c.como_perguntar).trim() + '".') : ' (formule a pergunta pelo alvo, com naturalidade.)';
const fronteiraTag = (c) => c.perguntar_quando === 'fronteira' ? ' [só na fronteira: pergunte isto apenas se o casal estiver no limite de qualificar, não antes]' : '';
const entender_txt = crit.filter(c => kindOf(c) !== 'desqualifica').map((c,i) => (i+1) + '. Descubra: ' + (c.label||'') + '.' + comoPerg(c) + fronteiraTag(c)).join('\\n');
// Pontuação: orientação ao Qualificador-LLM + corte determinístico (aplicado no Parse Qualifica).
const scoring_enabled = !!qu.scoring_enabled;
const sc_threshold = (typeof qu.threshold === 'number') ? qu.threshold : 50;
const sc_quente = (qu.bands && typeof qu.bands.quente === 'number') ? qu.bands.quente : 80;
const sc_morno = (qu.bands && typeof qu.bands.morno === 'number') ? qu.bands.morno : 50;
const sc_max_bonus = (typeof qu.max_bonus_points === 'number') ? qu.max_bonus_points : 10;
// Sondagem: slots com prioridade + perguntas viram o conteúdo de <o_que_entender>.
const slots = arr(qu.discovery_slots).filter(s => s && s.label);
const prioLabel = { critical: 'crítico', preferred: 'importante', nice_to_have: 'extra' };
const sondagem_txt = slots.map((s,i) => {
  const qs = arr(s.questions).filter(Boolean);
  const qPart = qs.length ? (' Perguntas que você pode fazer: ' + qs.map(q => '"' + q + '"').join(' / ') + '.') : ' (improvise a pergunta com naturalidade.)';
  const cov = s.coverage_notes ? (' Precisão necessária: ' + s.coverage_notes + '.') : '';
  return (i+1) + '. ' + s.label + ' [' + (prioLabel[s.priority] || 'importante') + '].' + qPart + cov;
}).join('\\n');
// Sinais que ela percebe SOZINHA (sem perguntar) — entram no <o_que_entender>.
const sinais_percebe = arr(qu.silent_signals).filter(Boolean);
const sinais_txt = sinais_percebe.length ? ('\\nAlém disso, perceba sozinha, sem perguntar: ' + sinais_percebe.join('; ') + '.') : '';
// Abertura: literal (texto exato), directive (diretriz, ela compõe), free (ela compõe sozinha).
const abMode = vo.abertura_mode || 'literal';
const abRaw = vo.abertura || cfg.abertura || '';
const subsVars = (str) => { let t = String(str || '');
  t = t.split('{{contact_name}}').join(p.nome || 'o casal');
  t = t.split('{{agent_name}}').join(id.persona_nome || cfg.persona_nome || 'Sofia');
  t = t.split('{{company_name}}').join(id.empresa || cfg.empresa || 'a gente');
  t = t.split('{{date}}').join(new Date().toLocaleDateString('pt-BR'));
  return t; };
const steps = arr(vo.opening_steps).filter(s => s && s.fala);
let abertura_txt;
if (vo.opening_stepped && steps.length) {
  const stepLines = steps.map((s,i) => '  ' + (i+1) + '. ' + s.fala + (s.espera_resposta ? ' [espere a resposta antes do próximo]' : ' [pode emendar no próximo]') + (s.captura ? (' (tente captar: ' + s.captura + ')') : '')).join('\\n');
  abertura_txt = 'A abertura acontece em PASSOS, nesta ordem. Faça UM passo por vez; nos passos marcados "espere a resposta", pare e aguarde o casal responder antes de seguir pro próximo. Sempre reaja ao que disseram. Descubra pelo histórico em que passo você está (o que já foi dito/captado) e dê o próximo. Passos:\\n' + stepLines;
} else if (abMode === 'free') {
  abertura_txt = 'No primeiro contato, abra como um bom SDR humano: PRIMEIRO reconheça e responda brevemente o que o casal disse na primeira mensagem (se eles já perguntaram algo, responda; nunca ignore), e se apresente com naturalidade usando sua persona e a proposta da empresa. Tudo numa fala curta e calorosa, sem texto decorado.';
} else if (abMode === 'directive') {
  abertura_txt = 'No primeiro contato, abra como um bom SDR humano faria: PRIMEIRO reconheça e responda brevemente o que o casal disse na primeira mensagem (se já perguntaram preço, destino, ou qualquer coisa, responda; NUNCA ignore o que escreveram), e então cubra com naturalidade estes pontos, sem copiar literalmente: ' + subsVars(abRaw) + '. Teça tudo numa única fala curta e calorosa, adaptada ao que eles disseram.';
} else {
  abertura_txt = 'Use só no primeiro contato, exatamente assim: ' + subsVars(abRaw);
}
return [{ json: {
  persona: id.persona_nome || cfg.persona_nome || 'Sofia',
  empresa: id.empresa || cfg.empresa || 'Welcome Weddings',
  proposta: id.proposta || cfg.proposta || '',
  proposta_txt: proposta_txt,
  regras_txt: regras_txt,
  tom_desc: (tomMap[tom] || tom || 'acolhedor, caloroso e humano') + ', ' + formalidade_desc + (tone_tags_txt ? (', ' + tone_tags_txt) : ''),
  funcao: funcao,
  missao_txt: missao_txt,
  regras_voz_txt: regras_voz_txt,
  frases_tipicas_txt: frases_tipicas_txt,
  competitors_txt: competitors_txt,
  abertura: vo.abertura || cfg.abertura || '',
  abertura_txt: abertura_txt,
  invented_date_rule_txt: invented_date_rule_txt,
  no_dash_enabled: no_dash_enabled,
  scoring_enabled: scoring_enabled,
  sc_threshold: sc_threshold,
  sc_quente: sc_quente,
  sc_morno: sc_morno,
  sc_max_bonus: sc_max_bonus,
  etapas_txt: (crit.length ? entender_txt : (slots.length ? sondagem_txt : arr(etapas).map((e,i) => (i+1) + '. ' + e).join('\\n'))) + sinais_txt,
  faixas_txt: arr(faixas).join('; '),
  fronteiras_txt: arr(fronteiras).map(f => '- ' + f).join('\\n'),
  historico: p.historico || '',
  ultima_mensagem_lead: ultima_lead,
  nome: p.nome || '',
  is_primeiro_contato: p.is_primeiro_contato,
  allowed: p.allowed,
  org_id: p.org_id,
  agent_slug: p.agent_slug,
  phone: p.phone,
  resumo_antigo: est.resumo || '',
  contexto_antigo: est.contexto || '',
  criterios_txt: criterios_txt,
  criterios_json: criterios_json,
  faqs_txt: faqs_txt,
  pricing_txt: pricing_txt,
  glossary_usar: glossary_usar,
  glossary_evitar: glossary_evitar,
  comportamentos_txt: comportamentos_txt,
  momentos_txt: momentos_txt,
  fases_txt: fases_txt,
  fase_anterior: fase_anterior,
  bubbles_enabled: !!(cfg.capabilities && cfg.capabilities.memory && cfg.capabilities.memory.enabled && cfg.capabilities.memory.bubbles_enabled),
  crm_write_enabled: !!(cfg.capabilities && cfg.capabilities.crm_write && cfg.capabilities.crm_write.enabled),
  calendar_enabled: !!(cfg.capabilities && cfg.capabilities.calendar && cfg.capabilities.calendar.enabled),
  followup_enabled: !!(cfg.capabilities && cfg.capabilities.followup && cfg.capabilities.followup.enabled),
  followup_days: (cfg.capabilities && cfg.capabilities.followup && Array.isArray(cfg.capabilities.followup.days) && cfg.capabilities.followup.days.length) ? cfg.capabilities.followup.days : [1,3,7],
  handoff_enabled: !!(cfg.capabilities && cfg.capabilities.handoff && cfg.capabilities.handoff.enabled),
  handoff_situations_txt: ((cfg.capabilities && cfg.capabilities.handoff && Array.isArray(cfg.capabilities.handoff.situations)) ? cfg.capabilities.handoff.situations : []).filter(Boolean).map(s => '- ' + s).join('\\n'),
  handoff_stage: (cfg.capabilities && cfg.capabilities.handoff && cfg.capabilities.handoff.target_stage_id) || null,
  kb_enabled: !!(kb && kb.enabled),
  kb_top_k: (kb && typeof kb.top_k === 'number') ? kb.top_k : 4,
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
// Mescla a decisão de qualificação (Agente 2): grava o booleano no card pro gestor.
const q = (() => { try { return $('Parse Qualifica').first().json; } catch(e) { return {}; } })();
if (q && typeof q.qualificado === 'boolean') fields.ww_sdr_qualificado = q.qualificado;
const m = $('Monta').first().json;
return [{ json: { fields, org_id: m.org_id, agent_slug: m.agent_slug, phone: m.phone, nome: m.nome } }];`;

// Limpa: garantia determinística da regra absoluta "zero travessões". O modelo às
// vezes espelha os "—" das fronteiras; aqui trocamos travessão/en-dash usados como
// separador por vírgula, independente da temperatura do modelo.
const CODE_LIMPA = `const noDash = $('Monta').first().json.no_dash_enabled !== false;
let out = String($('Responde Lead').item.json.output || '');
if (noDash) {
  out = out
    .replace(/\\s*[\\u2013\\u2014]\\s*/g, ', ')
    .replace(/\\s+,/g, ',')
    .replace(/,\\s*,/g, ',');
}
out = out.replace(/\\s{2,}/g, ' ').trim();
return [{ json: { output: out, allowed: $('Prepara').first().json.allowed } }];`;

// Formatter (4º nó, GPT-5.1): quando o modo bolhas está LIGADO, divide a resposta em
// 1-3 mensagens como um humano faria no WhatsApp — agrupa o que vai junto, separa o
// que é natural mandar em outra linha. SEM regra dura de caractere/frase. Saída JSON.
const FORMATTER_SYSTEM = `Você formata uma resposta de WhatsApp em bolhas, como um humano de verdade manda. Receba o texto pronto e devolva SOMENTE um JSON válido (sem markdown, sem crases): {"bolhas": ["...", "..."]}.
Regras: pense em como uma pessoa real separaria no WhatsApp, agrupando o que pertence à mesma ideia e quebrando onde é natural respirar. Use de 1 a 3 bolhas (1 se a mensagem é curta/uma ideia só). NUNCA reescreva, encurte ou mude as palavras, só decida onde cortar. Mantenha o texto integral somando as bolhas. Nada de rótulos, números ou explicação.`;
const FORMATTER_USER = `Texto pronto pra enviar:
{{ $('Limpa Travessao').item.json.output }}

Devolva só o JSON {bolhas}.`;
// Parse das bolhas do Formatter: defensivo (qualquer erro -> 1 bolha com o texto inteiro).
const CODE_PARSE_BOLHAS = `const out = String($('Limpa Travessao').item.json.output || '');
let t = String($('Formata Bolhas').item.json.output || '').trim();
t = t.replace(/^\`\`\`(json)?/i,'').replace(/\`\`\`$/,'').trim();
let bubbles = [out];
try {
  const r = JSON.parse(t);
  if (r && Array.isArray(r.bolhas)) {
    const arr = r.bolhas.map(s => String(s||'').trim()).filter(Boolean);
    if (arr.length) bubbles = arr.slice(0, 3);
  }
} catch (e) { bubbles = [out]; }
return [{ json: { output: out, bubbles, allowed: $('Prepara').first().json.allowed } }];`;
// Bolha única: modo padrão (single) — uma mensagem só, sem custo de LLM.
const CODE_BOLHA_UNICA = `const out = String($('Limpa Travessao').item.json.output || '');
return [{ json: { output: out, bubbles: [out], allowed: $('Prepara').first().json.allowed } }];`;

// Agente 1 — Consolidador (cérebro humano): mantém resumo/contexto/sinais do casal.
const CONSOLIDA_SYSTEM = `Você consolida o ESTADO de uma conversa de casamento da {{ $('Monta').item.json.empresa }}. Leia o histórico + o resumo/contexto ANTERIORES e devolva SOMENTE um JSON válido (sem markdown, sem crases) com:
- "resumo": fatos estáveis do casal (nomes, destino/região, nº de convidados, orçamento do casal, data pretendida, restrições). Frases curtas.
- "contexto": onde a conversa está, o que já aconteceu e o próximo passo natural.
- "sinais": objeto só com sinais VERDADEIROS detectados, ex: {"fuga": true, "pressao_familia": true, "hesitacao_preco": true, "urgencia": true}. Se nenhum, {}.
- "fase": o NOME da fase atual da conversa, escolhido EXATAMENTE da lista de fases fornecida. Comece pela 1ª fase; só avance pra próxima quando o "avança quando" da fase atual estiver cumprido. NUNCA pule fases nem invente nome. Se não há fases, devolva "".
Atualize a partir do anterior; NÃO invente. Se não há novidade, repita o anterior.`;
const CONSOLIDA_USER = `Resumo anterior: {{ $('Monta').item.json.resumo_antigo || '(vazio)' }}
Contexto anterior: {{ $('Monta').item.json.contexto_antigo || '(vazio)' }}
Fase anterior: {{ $('Monta').item.json.fase_anterior || '(começo)' }}

Fases da conversa (em ordem):
{{ $('Monta').item.json.fases_txt || '(sem fases definidas)' }}

Histórico:
{{ $('Monta').item.json.historico || '(começo)' }}
Última mensagem do casal: {{ $('Monta').item.json.ultima_mensagem_lead }}

Devolva só o JSON {resumo, contexto, sinais, fase}.`;
const CODE_PARSE_CONSOLIDA = `let t = String($('Consolida').item.json.output || '').trim();
t = t.replace(/^\`\`\`(json)?/i,'').replace(/\`\`\`$/,'').trim();
let r = {};
try { r = JSON.parse(t); } catch(e) { r = {}; }
const m = $('Monta').first().json;
const fase = (r && typeof r.fase === 'string' && r.fase.trim()) ? r.fase.trim() : (m.fase_anterior || '');
const sinais = (r && r.sinais && typeof r.sinais === 'object') ? r.sinais : {};
if (fase) sinais.fase = fase; // persiste a fase dentro de sinais (sem mudar o RPC)
return [{ json: {
  resumo: (r && typeof r.resumo === 'string') ? r.resumo : (m.resumo_antigo || ''),
  contexto: (r && typeof r.contexto === 'string') ? r.contexto : (m.contexto_antigo || ''),
  sinais: sinais,
  fase: fase,
  org_id: m.org_id, agent_slug: m.agent_slug, phone: m.phone,
}}];`;

// Agente 2 — Qualificador INTELIGENTE: nota 0-100 + o que falta + próxima pergunta.
// LLM com julgamento (não soma de pesos). Lê os critérios+importância editáveis e o
// estado consolidado, devolve uma SUGESTÃO que o Respondedor pode usar ou ignorar.
const QUALIFICA_SYSTEM = `Você é o qualificador de leads de casamento da {{ $('Monta').item.json.empresa }}. Para CADA critério numerado, extraia o que ele pede, com base SÓ no resumo/contexto (não invente). Cada critério diz o que devolver:
- critério "atende=true se..." → preencha "atende" (true/false).
- critério que pede um VALOR (ex: orçamento por convidado) → preencha "valor" com o NÚMERO (ou null se ainda não dá pra saber).
- critério que pede uma OPÇÃO (ex: destino) → preencha "opcao" com o que o casal indicou (ou "fora", ou "" se não souber).
NÃO calcule a nota final, isso é feito depois. Devolva SOMENTE um JSON válido (sem markdown, sem crases):
{"avaliacao": [{"n": 1, "atende": true|false, "valor": null, "opcao": "", "nota": "frase curta"}], "score": 0-100, "qualificado": true|false, "faixa": "quente"|"morno"|"frio", "falta": ["o que ainda precisa entender"], "proxima_pergunta_sugerida": "uma pergunta aberta e natural, ou '' se ainda não é hora de perguntar", "handoff": true|false}
Um item por critério, pelo número. score/qualificado/faixa são só estimativa de apoio (o cálculo oficial usa a sua avaliacao + os pesos). Se o casal hesita ou está emotivo, proxima_pergunta_sugerida pode ser ''.
handoff=true SOMENTE se a última mensagem do casal indicar uma das situações de passar pra um humano (listadas abaixo, se houver); senão handoff=false.`;
const QUALIFICA_USER = `Critérios de qualificação (com importância):
{{ $('Monta').item.json.criterios_txt }}

Estado consolidado:
- Resumo do casal: {{ $('Parse Consolida').item.json.resumo || '(vazio)' }}
- Onde estamos: {{ $('Parse Consolida').item.json.contexto || '(início)' }}
- Sinais: {{ JSON.stringify($('Parse Consolida').item.json.sinais || {}) }}
Última mensagem do casal: {{ $('Monta').item.json.ultima_mensagem_lead }}

Situações de passar pra um humano (handoff=true se a última mensagem encaixar em alguma; se vazio, handoff sempre false):
{{ $('Monta').item.json.handoff_situations_txt || '(nenhuma)' }}

Devolva só o JSON {avaliacao, score, qualificado, faixa, falta, proxima_pergunta_sugerida, handoff}.`;
const CODE_PARSE_QUALIFICA = `let t = String($('Qualifica').item.json.output || '').trim();
t = t.replace(/^\`\`\`(json)?/i,'').replace(/\`\`\`$/,'').trim();
let r = {};
try { r = JSON.parse(t); } catch(e) { r = {}; }
if (typeof r !== 'object' || Array.isArray(r) || !r) r = {};
const m = $('Monta').first().json;
const scoring = !!m.scoring_enabled;
const thr = (typeof m.sc_threshold === 'number') ? m.sc_threshold : 50;
const qz = (typeof m.sc_quente === 'number') ? m.sc_quente : 80;
const mz = (typeof m.sc_morno === 'number') ? m.sc_morno : 50;
const maxBonus = (typeof m.sc_max_bonus === 'number') ? m.sc_max_bonus : 10;
let crits = []; try { crits = JSON.parse(m.criterios_json || '[]'); } catch(e) { crits = []; }
const aval = Array.isArray(r.avaliacao) ? r.avaliacao : [];
let score, qualificado, faixa;
if (scoring && crits.length && aval.length) {
  // CÁLCULO DETERMINÍSTICO (lógica da Patricia, por tipo): a IA extrai atende/valor/opção por
  // critério; aqui a conta é exata. Faixas: o valor cai numa faixa = pontos. Peso por opção:
  // a opção dá os pontos (fora da lista = 0 ou desqualifica). Bônus com teto. Desqualificador zera.
  const byNAval = {}; aval.forEach(a => { if (a && a.n != null) byNAval[a.n] = a; });
  let pts = 0, bonusRaw = 0, dq = false;
  crits.forEach(c => {
    const a = byNAval[c.n]; if (!a) return;
    if (c.kind === 'desqualifica') { if (a.atende === true) dq = true; return; }
    if (c.kind === 'faixas_valor') {
      const v = Number(a.valor); if (!isFinite(v)) return;
      const fx = (c.faixas || []).find(f => (f.de == null || v >= f.de) && (f.ate == null || v < f.ate));
      if (fx) pts += Number(fx.pontos) || 0;
      return;
    }
    if (c.kind === 'peso_por_opcao') {
      const op = String(a.opcao || '').toLowerCase().trim();
      if (!op) return;
      if (op === 'fora') { if (c.fora_da_lista === 'desqualifica') dq = true; return; }
      const hit = (c.opcoes || []).find(o => o.opcao === op || op.indexOf(o.opcao) >= 0 || o.opcao.indexOf(op) >= 0);
      if (hit) pts += Number(hit.pontos) || 0;
      else if (c.fora_da_lista === 'desqualifica') dq = true;
      return;
    }
    // sim_nao
    if (a.atende === true) { if (c.rt === 'bonus') bonusRaw += Number(c.peso) || 0; else pts += Number(c.peso) || 0; }
  });
  score = dq ? 0 : Math.max(0, Math.min(100, Math.round(pts + Math.min(bonusRaw, maxBonus))));
  qualificado = !dq && score >= thr;
  faixa = score >= qz ? 'quente' : score >= mz ? 'morno' : 'frio';
} else {
  // Pontuação desligada (ou sem dados): julgamento livre da IA.
  score = Number(r.score); if (!isFinite(score)) score = 0; score = Math.max(0, Math.min(100, Math.round(score)));
  faixa = (typeof r.faixa === 'string') ? r.faixa : (score >= 70 ? 'quente' : score >= 40 ? 'morno' : 'frio');
  qualificado = r.qualificado === true;
}
const falta = Array.isArray(r.falta) ? r.falta.filter(x => typeof x === 'string') : [];
return [{ json: {
  score,
  qualificado,
  faixa,
  falta,
  falta_txt: falta.length ? falta.join('; ') : '(nada essencial faltando)',
  proxima_pergunta_sugerida: (typeof r.proxima_pergunta_sugerida === 'string') ? r.proxima_pergunta_sugerida : '',
  handoff: r.handoff === true,
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
    // Conhecimento por BUSCA (RAG): chama a edge wsdr-knowledge (embute a msg + busca os
    // trechos relevantes). neverError → se falhar, cai no fallback (faqs inline do Monta).
    { id: 'buscakb', name: 'Busca Conhecimento', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [940, 160],
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/functions/v1/wsdr-knowledge`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
        sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ action: 'search', agent_slug: $('Monta').item.json.agent_slug, org_id: $('Monta').item.json.org_id, message: ($('Monta').item.json.kb_enabled ? $('Monta').item.json.ultima_mensagem_lead : ''), top_k: $('Monta').item.json.kb_top_k }) }}`,
        options: { response: { response: { neverError: true } } },
      },
      credentials: { supabaseApi: SUPABASE_CREDENTIAL } },
    // --- Ligar/desligar a Sofia: se config.ativa === false, responde vazio (não engaja).
    //     Default (sem o campo) = ativa, então não muda o comportamento existente. ---
    { id: 'ativagate', name: 'Sofia Ativa?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [690, 200],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
        conditions: [{ id: 'a1', leftValue: "={{ $('Carrega Config').first().json.ativa === false }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } },
    // --- M5 Debounce por silêncio (gated por capabilities.memory.enabled). OFF = flui direto. ---
    { id: 'debgate', name: 'Debounce?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [740, 120],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
        conditions: [{ id: 'd1', leftValue: "={{ $('Carrega Config').first().json.capabilities && $('Carrega Config').first().json.capabilities.memory && $('Carrega Config').first().json.capabilities.memory.enabled }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } },
    { id: 'bufappend', name: 'Buffer Append', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [940, 60],
      parameters: { method: 'POST', url: `${SUPABASE_URL}/rest/v1/rpc/wsdr_buffer_append`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ p_org_id: $('Prepara').first().json.org_id, p_agent_slug: $('Prepara').first().json.agent_slug, p_contact_phone: $('Prepara').first().json.phone, p_text: $('Prepara').first().json.ultima_mensagem_lead }) }}`,
        options: { response: { response: { neverError: true } } } },
      credentials: { supabaseApi: SUPABASE_CREDENTIAL } },
    { id: 'espera', name: 'Espera', type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [1140, 60],
      parameters: { resume: 'timeInterval', amount: `={{ Math.max(1, Math.round(($('Carrega Config').first().json.capabilities.memory.debounce_ms || 8000)/1000)) }}`, unit: 'seconds' } },
    { id: 'bufclaim', name: 'Buffer Claim', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1340, 60],
      parameters: { method: 'POST', url: `${SUPABASE_URL}/rest/v1/rpc/wsdr_buffer_claim`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ p_org_id: $('Prepara').first().json.org_id, p_agent_slug: $('Prepara').first().json.agent_slug, p_contact_phone: $('Prepara').first().json.phone, p_seq: $('Buffer Append').first().json.seq }) }}`,
        options: { response: { response: { neverError: true } } } },
      credentials: { supabaseApi: SUPABASE_CREDENTIAL } },
    { id: 'claimou', name: 'Reivindicou?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [1540, 60],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
        conditions: [{ id: 'c1', leftValue: "={{ $('Buffer Claim').first().json.claimed }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } },
    { id: 'respvazio', name: 'Responde Vazio', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1, position: [1740, 140],
      parameters: { respondWith: 'json', responseBody: '={{ { "reply": "", "bubbles": [], "skipped": true } }}', options: {} } },
    { id: 'consolida', name: 'Consolida', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 2.2, position: [1020, 460],
      parameters: { promptType: 'define', text: '=' + CONSOLIDA_USER, options: { systemMessage: '=' + CONSOLIDA_SYSTEM, enableStreaming: false } } },
    { id: 'modelconsolida', name: 'Modelo Consolida', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, position: [1020, 660],
      parameters: { model: { __rl: true, value: AUX_MODEL_ID, mode: 'list', cachedResultName: AUX_MODEL_ID }, options: AUX_MODEL_OPTIONS },
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
      parameters: { model: { __rl: true, value: AUX_MODEL_ID, mode: 'list', cachedResultName: AUX_MODEL_ID }, options: AUX_MODEL_OPTIONS },
      credentials: { openAiApi: OPENAI_CREDENTIAL } },
    { id: 'parsequalifica', name: 'Parse Qualifica', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1760, 460],
      parameters: { jsCode: CODE_PARSE_QUALIFICA } },
    { id: 'agente', name: 'Responde Lead', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 2.2, position: [1940, 300],
      parameters: { promptType: 'define', text: '=' + USER_TEXT, options: { systemMessage: '=' + SYSTEM_PROMPT, enableStreaming: false } } },
    { id: 'model', name: 'OpenAI Chat Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, position: [1060, 520],
      parameters: { model: { __rl: true, value: MODEL_ID, mode: 'list', cachedResultName: MODEL_ID }, options: MODEL_OPTIONS },
      credentials: { openAiApi: OPENAI_CREDENTIAL } },
    { id: 'limpa', name: 'Limpa Travessao', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2140, 300],
      parameters: { jsCode: CODE_LIMPA } },
    { id: 'modobolhas', name: 'Modo Bolhas?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [2320, 300],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
        conditions: [{ id: 'c1', leftValue: "={{ $('Monta').first().json.bubbles_enabled }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } },
    { id: 'formatabolhas', name: 'Formata Bolhas', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 2.2, position: [2520, 420],
      parameters: { promptType: 'define', text: '=' + FORMATTER_USER, options: { systemMessage: '=' + FORMATTER_SYSTEM, enableStreaming: false } } },
    { id: 'modelbolhas', name: 'Modelo Bolhas', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, position: [2520, 620],
      parameters: { model: { __rl: true, value: AUX_MODEL_ID, mode: 'list', cachedResultName: AUX_MODEL_ID }, options: AUX_MODEL_OPTIONS },
      credentials: { openAiApi: OPENAI_CREDENTIAL } },
    { id: 'parsebolhas', name: 'Parse Bolhas', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2720, 420],
      parameters: { jsCode: CODE_PARSE_BOLHAS } },
    { id: 'bolhaunica', name: 'Bolha Unica', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2520, 200],
      parameters: { jsCode: CODE_BOLHA_UNICA } },
    { id: 'responde', name: 'Responde Webhook', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1, position: [2920, 300],
      parameters: { respondWith: 'json', responseBody: '={{ { "reply": $json.output, "bubbles": $json.bubbles, "allowed": $json.allowed } }}', options: {} } },
    // --- Ramo de gravação no CRM (Agente 2 da Camila), pós-resposta, gated por config ---
    { id: 'crmgate', name: 'CRM Gate', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1480, 520],
      parameters: { jsCode: `const m = $('Monta').first().json; return m.crm_write_enabled ? [{ json: m }] : [];` } },
    { id: 'extrai', name: 'Extrai Dados', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 2.2, position: [1680, 520],
      parameters: { promptType: 'define', text: '=' + EXTRACT_USER, options: { systemMessage: '=' + EXTRACT_SYSTEM, enableStreaming: false } } },
    { id: 'modelextrai', name: 'Modelo Extrai', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, position: [1680, 700],
      parameters: { model: { __rl: true, value: AUX_MODEL_ID, mode: 'list', cachedResultName: AUX_MODEL_ID }, options: AUX_MODEL_OPTIONS },
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
      parameters: { model: { __rl: true, value: AUX_MODEL_ID, mode: 'list', cachedResultName: AUX_MODEL_ID }, options: AUX_MODEL_OPTIONS },
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
    // --- Ramo de follow-up: cria tarefa de retomada quando há interesse mas sem reunião, gated ---
    { id: 'followupgate', name: 'Follow-up Gate', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1480, 1000],
      parameters: { jsCode: `const m = $('Monta').first().json; const q = (() => { try { return $('Parse Qualifica').first().json; } catch(e) { return {}; } })(); return (m.followup_enabled && q && q.qualificado) ? [{ json: m }] : [];` } },
    { id: 'criafollowup', name: 'Cria Follow-up', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1680, 1000],
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/wsdr_create_followup`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
        sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ p_org_id: $('Monta').first().json.org_id, p_agent_slug: $('Monta').first().json.agent_slug, p_contact_phone: $('Monta').first().json.phone, p_contact_name: $('Monta').first().json.nome, p_days: $('Monta').first().json.followup_days }) }}`,
        options: {},
      },
      credentials: { supabaseApi: SUPABASE_CREDENTIAL } },
    // --- Ramo de handoff: passa pra um humano quando trava/insatisfeito, gated ---
    { id: 'handoffgate', name: 'Handoff Gate', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1480, 1200],
      parameters: { jsCode: `const m = $('Monta').first().json; const q = (() => { try { return $('Parse Qualifica').first().json; } catch(e) { return {}; } })(); return (m.handoff_enabled && q && q.handoff === true) ? [{ json: m }] : [];` } },
    { id: 'fazhandoff', name: 'Faz Handoff', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1680, 1200],
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/wsdr_handoff`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
        sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ p_org_id: $('Monta').first().json.org_id, p_agent_slug: $('Monta').first().json.agent_slug, p_contact_phone: $('Monta').first().json.phone, p_contact_name: $('Monta').first().json.nome, p_motivo: 'A Sofia detectou que o casal precisa de um humano.', p_target_stage_id: $('Monta').first().json.handoff_stage }) }}`,
        options: {},
      },
      credentials: { supabaseApi: SUPABASE_CREDENTIAL } },
  ];
  const connections = {
    'Webhook SDR Weddings': { main: [[{ node: 'Prepara', type: 'main', index: 0 }]] },
    'Prepara': { main: [[{ node: 'Carrega Config', type: 'main', index: 0 }]] },
    'Carrega Config': { main: [[{ node: 'Sofia Ativa?', type: 'main', index: 0 }]] },
    'Sofia Ativa?': { main: [[{ node: 'Responde Vazio', type: 'main', index: 0 }], [{ node: 'Debounce?', type: 'main', index: 0 }]] },
    'Debounce?': { main: [[{ node: 'Buffer Append', type: 'main', index: 0 }], [{ node: 'Carrega Estado', type: 'main', index: 0 }]] },
    'Buffer Append': { main: [[{ node: 'Espera', type: 'main', index: 0 }]] },
    'Espera': { main: [[{ node: 'Buffer Claim', type: 'main', index: 0 }]] },
    'Buffer Claim': { main: [[{ node: 'Reivindicou?', type: 'main', index: 0 }]] },
    'Reivindicou?': { main: [[{ node: 'Carrega Estado', type: 'main', index: 0 }], [{ node: 'Responde Vazio', type: 'main', index: 0 }]] },
    'Carrega Estado': { main: [[{ node: 'Monta', type: 'main', index: 0 }]] },
    'Monta': { main: [[{ node: 'Busca Conhecimento', type: 'main', index: 0 }]] },
    'Busca Conhecimento': { main: [[{ node: 'Consolida', type: 'main', index: 0 }]] },
    'Modelo Consolida': { ai_languageModel: [[{ node: 'Consolida', type: 'ai_languageModel', index: 0 }]] },
    'Consolida': { main: [[{ node: 'Parse Consolida', type: 'main', index: 0 }]] },
    'Parse Consolida': { main: [[{ node: 'Salva Estado', type: 'main', index: 0 }]] },
    'Salva Estado': { main: [[{ node: 'Qualifica', type: 'main', index: 0 }]] },
    'Modelo Qualifica': { ai_languageModel: [[{ node: 'Qualifica', type: 'ai_languageModel', index: 0 }]] },
    'Qualifica': { main: [[{ node: 'Parse Qualifica', type: 'main', index: 0 }]] },
    'Parse Qualifica': { main: [[{ node: 'Responde Lead', type: 'main', index: 0 }]] },
    'OpenAI Chat Model': { ai_languageModel: [[{ node: 'Responde Lead', type: 'ai_languageModel', index: 0 }]] },
    'Responde Lead': { main: [[{ node: 'Limpa Travessao', type: 'main', index: 0 }]] },
    'Limpa Travessao': { main: [[{ node: 'Modo Bolhas?', type: 'main', index: 0 }]] },
    'Modo Bolhas?': { main: [[{ node: 'Formata Bolhas', type: 'main', index: 0 }], [{ node: 'Bolha Unica', type: 'main', index: 0 }]] },
    'Modelo Bolhas': { ai_languageModel: [[{ node: 'Formata Bolhas', type: 'ai_languageModel', index: 0 }]] },
    'Formata Bolhas': { main: [[{ node: 'Parse Bolhas', type: 'main', index: 0 }]] },
    'Parse Bolhas': { main: [[{ node: 'Responde Webhook', type: 'main', index: 0 }]] },
    'Bolha Unica': { main: [[{ node: 'Responde Webhook', type: 'main', index: 0 }]] },
    'Responde Webhook': { main: [[{ node: 'CRM Gate', type: 'main', index: 0 }, { node: 'Agenda Gate', type: 'main', index: 0 }, { node: 'Follow-up Gate', type: 'main', index: 0 }, { node: 'Handoff Gate', type: 'main', index: 0 }]] },
    'CRM Gate': { main: [[{ node: 'Extrai Dados', type: 'main', index: 0 }]] },
    'Modelo Extrai': { ai_languageModel: [[{ node: 'Extrai Dados', type: 'ai_languageModel', index: 0 }]] },
    'Extrai Dados': { main: [[{ node: 'Parse Dados', type: 'main', index: 0 }]] },
    'Parse Dados': { main: [[{ node: 'Grava CRM', type: 'main', index: 0 }]] },
    'Agenda Gate': { main: [[{ node: 'Extrai Reuniao', type: 'main', index: 0 }]] },
    'Modelo Reuniao': { ai_languageModel: [[{ node: 'Extrai Reuniao', type: 'ai_languageModel', index: 0 }]] },
    'Extrai Reuniao': { main: [[{ node: 'Parse Reuniao', type: 'main', index: 0 }]] },
    'Parse Reuniao': { main: [[{ node: 'Marca Reuniao', type: 'main', index: 0 }]] },
    'Follow-up Gate': { main: [[{ node: 'Cria Follow-up', type: 'main', index: 0 }]] },
    'Handoff Gate': { main: [[{ node: 'Faz Handoff', type: 'main', index: 0 }]] },
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
