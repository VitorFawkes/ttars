/**
 * populate-luna-kb.ts — Migra JULIA_FAQ (integration_settings) para a KB própria do agente Luna
 * em ai_knowledge_bases + ai_knowledge_base_items + ai_agent_knowledge_bases.
 *
 * Divide por `## ` (seções) e insere cada seção como item (titulo = heading, conteudo = body).
 * Gera embeddings via OpenAI text-embedding-3-small.
 *
 * Uso:
 *   export $(grep -v '^#' .env | xargs)
 *   deno run --allow-net --allow-env scripts/populate-luna-kb.ts
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://szyrzxvlptqqheizyrxu.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_KEY = process.env.OPENAI_API_KEY!;
const AGENT_ID = process.env.LUNA_AGENT_ID || "90b0b80b-77a1-48f5-9bf0-b65335044dbe";

if (!SERVICE_KEY || !OPENAI_KEY) {
  console.error("ERRO: precisa SUPABASE_SERVICE_ROLE_KEY e OPENAI_API_KEY no env");
  process.exit(1);
}

async function sbFetch(path: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers || {}),
    },
  });
}

async function sbRpc(name: string, body: Record<string, unknown>) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// ── 1. Buscar agente e FAQ ──
const agentRes = await sbFetch(`ai_agents?id=eq.${AGENT_ID}&select=id,nome,produto,org_id`);
const agents = await agentRes.json();
if (!agents.length) throw new Error(`Agente ${AGENT_ID} nao encontrado`);
const agent = agents[0];
console.log(`[1] Agente: ${agent.nome} (org=${agent.org_id}, produto=${agent.produto})`);

const faqRes = await sbFetch(`integration_settings?key=eq.JULIA_FAQ&org_id=eq.${agent.org_id}&select=value`);
const faqs = await faqRes.json();
if (!faqs.length || !faqs[0].value) throw new Error("JULIA_FAQ vazio ou ausente pra esta org");
const faqText: string = faqs[0].value;
console.log(`[2] JULIA_FAQ carregado: ${faqText.length} chars`);

// ── 2. Dividir em secoes por "## " (segundo nivel) ──
const sections: Array<{ titulo: string; conteudo: string }> = [];
const lines = faqText.split("\n");
let currentTitle = "";
let currentBody: string[] = [];

for (const line of lines) {
  const h2 = line.match(/^##\s+(.+)$/);
  if (h2) {
    if (currentTitle && currentBody.join("\n").trim()) {
      sections.push({ titulo: currentTitle, conteudo: currentBody.join("\n").trim() });
    }
    currentTitle = h2[1].trim();
    currentBody = [];
  } else if (currentTitle) {
    currentBody.push(line);
  }
}
if (currentTitle && currentBody.join("\n").trim()) {
  sections.push({ titulo: currentTitle, conteudo: currentBody.join("\n").trim() });
}

console.log(`[3] Secoes detectadas: ${sections.length}`);
sections.forEach((s, i) => console.log(`    ${i + 1}. ${s.titulo} (${s.conteudo.length} chars)`));

// ── 3. Criar KB ou reutilizar existente ──
const kbNome = `KB - ${agent.nome}`;
let kbId: string;
const existingKbRes = await sbFetch(
  `ai_knowledge_bases?nome=eq.${encodeURIComponent(kbNome)}&org_id=eq.${agent.org_id}&select=id`,
);
const existingKbs = await existingKbRes.json();

if (existingKbs.length > 0) {
  kbId = existingKbs[0].id;
  console.log(`[4] KB existente reutilizada: ${kbId}`);
  // Limpar itens antigos pra evitar duplicatas
  const delRes = await sbFetch(`ai_knowledge_base_items?kb_id=eq.${kbId}`, { method: "DELETE" });
  console.log(`    itens antigos removidos: ${delRes.status}`);
} else {
  const createKbRes = await sbFetch("ai_knowledge_bases", {
    method: "POST",
    body: JSON.stringify({
      org_id: agent.org_id,
      produto: agent.produto,
      nome: kbNome,
      tipo: "faq",
      descricao: `Base migrada de integration_settings.JULIA_FAQ em ${new Date().toISOString()}`,
      ativa: true,
    }),
  });
  const created = await createKbRes.json();
  if (!Array.isArray(created) || !created[0]?.id) throw new Error(`Falha ao criar KB: ${JSON.stringify(created)}`);
  kbId = created[0].id;
  console.log(`[4] KB criada: ${kbId}`);
}

// ── 4. Gerar embeddings em batch ──
const inputs = sections.map((s) => `${s.titulo}\n${s.conteudo}`);
console.log(`[5] Gerando embeddings pra ${inputs.length} itens via OpenAI...`);
const embRes = await fetch("https://api.openai.com/v1/embeddings", {
  method: "POST",
  headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "text-embedding-3-small", input: inputs }),
});
if (!embRes.ok) throw new Error(`OpenAI embeddings error ${embRes.status}: ${await embRes.text()}`);
const embData = await embRes.json();
const vectors: number[][] = embData.data.map((d: { embedding: number[] }) => d.embedding);
console.log(`    ${vectors.length} vetores gerados, dim=${vectors[0]?.length}`);

// ── 5. Inserir itens em batch ──
const rows = sections.map((s, i) => ({
  kb_id: kbId,
  titulo: s.titulo,
  conteudo: s.conteudo,
  tags: [],
  ordem: i,
  embedding: `[${vectors[i].join(",")}]`,
  ativa: true,
}));

const insertRes = await sbFetch("ai_knowledge_base_items", {
  method: "POST",
  body: JSON.stringify(rows),
});
const inserted = await insertRes.json();
if (!Array.isArray(inserted)) throw new Error(`Falha ao inserir itens: ${JSON.stringify(inserted)}`);
console.log(`[6] ${inserted.length} itens inseridos em ai_knowledge_base_items`);

// ── 6. Vincular KB ao agente (se ainda não existe) ──
const linkRes = await sbFetch(
  `ai_agent_knowledge_bases?agent_id=eq.${agent.id}&kb_id=eq.${kbId}&select=id`,
);
const existingLink = await linkRes.json();
if (existingLink.length === 0) {
  await sbFetch("ai_agent_knowledge_bases", {
    method: "POST",
    body: JSON.stringify({
      org_id: agent.org_id,
      agent_id: agent.id,
      kb_id: kbId,
      priority: 10,
      enabled: true,
    }),
  });
  console.log(`[7] Vínculo ai_agent_knowledge_bases criado`);
} else {
  console.log(`[7] Vínculo ai_agent_knowledge_bases já existe`);
}

// ── 7. Atualizar last_synced_at da KB ──
await sbFetch(`ai_knowledge_bases?id=eq.${kbId}`, {
  method: "PATCH",
  body: JSON.stringify({ last_synced_at: new Date().toISOString() }),
});

console.log(`\n✅ KB populada com sucesso.`);
console.log(`   Agente: ${agent.nome} (${agent.id})`);
console.log(`   KB: ${kbId}`);
console.log(`   Itens: ${inserted.length}`);
