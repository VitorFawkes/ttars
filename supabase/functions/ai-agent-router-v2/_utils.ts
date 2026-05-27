// Utilities da Patricia (single-agent v2).
//
// MVP scope: só processamento de mensagens TEXT. Multimodal (audio/imagem/documento)
// e outbound triggers ficam pra fase futura, se Patricia vencer cutover.
//
// Este módulo é INDEPENDENTE do `ai-agent-router/` v1 — não importa nada de lá.
// Funções aqui são essenciais pra o handler do `index.ts`.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types compartilhados (subset do v1)
// ============================================================================

export interface AgentRow {
  id: string;
  org_id: string;
  produto: string | null;
  nome: string;
  ativa: boolean;
  modelo: string | null;
  temperature: number | null;
  max_tokens: number | null;
  test_mode_phone_whitelist: string[] | null;
  validator_rules: Array<{
    id: string;
    condition: string;
    action: "block" | "correct" | "ignore";
    enabled: boolean;
  }> | null;
  pipeline_models: Record<string, unknown> | null;
  identity_config: Record<string, unknown> | null;
  voice_config: Record<string, unknown> | null;
  boundaries_config: Record<string, unknown> | null;
  listening_config: Record<string, unknown> | null;
  handoff_actions: Record<string, unknown> | null;
  // handoff_signals, intelligent_decisions, context_fields_config DEPRECATED 2026-05-20
  // — engine V2 ignora. Mantidas no banco por compat com layout antigo / router V1.
  engine: string;
  timings: { debounce_seconds?: number; typing_delay_seconds?: number; max_message_blocks?: number } | null;
  /**
   * Profile da Wedding Planner (ou T.Planner) responsável. Quando setado, o
   * router (a) filtra agenda apenas pelas reuniões desse profile e (b) usa
   * esse profile como `responsavel_id` ao criar reunião via tool
   * confirm_meeting_slot. NULL = comportamento legado.
   */
  wedding_planner_profile_id: string | null;
  /**
   * Config de oferta de horários no desfecho_qualificado (editável via Studio).
   * NULL = defaults seguros (3 dias × 1 horário, formato curto).
   *
   * Modelos de horários (em ordem de prioridade):
   *   1. `available_windows` + `slot_duration_minutes` (janelas com step) —
   *      modelo padrão de calendário. Ex: "atende manhã 9-12 e tarde 14-18
   *      a cada 1h" → gera 09:00, 10:00, 11:00, 14:00, 15:00, 16:00, 17:00.
   *   2. `available_hours` (lista discreta) — fallback legado.
   *   3. Default seguro [10:00, 14:00, 16:00] quando nenhum dos dois.
   */
  scheduling_config: {
    available_hours?: string[];                                     // ex: ["10:00", "14:00", "16:00"]
    available_windows?: Array<{ from: string; to: string }>;        // ex: [{from:"09:00", to:"12:00"}, {from:"14:00", to:"18:00"}]
    slot_duration_minutes?: number;                                  // step em minutos (default 60)
    max_slots_per_day?: number;                                      // quantos horários por dia
    max_days?: number;                                               // quantos dias distintos cobrir
    total_slots?: number;                                            // cap total de slots a oferecer
    skip_weekends?: boolean;
    search_window_days?: number;                                     // janela de busca
    date_format?: "short" | "full";                                 // "14/05" vs "14/05/2026"
  } | null;
}

/**
 * Expande a configuração de horários disponíveis em uma lista discreta de
 * "HH:MM". Prioriza `available_windows` + `slot_duration_minutes` (modelo
 * Prioridade: `available_hours` (lista explícita do admin) > `available_windows`
 * (janelas amplas, expandidas pelo slot_duration_minutes). Quando admin lista
 * horários específicos, é decisão intencional (ex: "só 10/14/16, não 9 nem 11"),
 * então ganha sobre a janela.
 */
export function expandAvailableHours(sc: AgentRow["scheduling_config"]): string[] {
  // 1. Lista explícita ganha — é a escolha mais específica do admin
  if (sc?.available_hours && sc.available_hours.length > 0) {
    return sc.available_hours;
  }
  // 2. Janelas amplas — expande pelo slot_duration_minutes
  if (sc?.available_windows && sc.available_windows.length > 0) {
    const stepRaw = Number(sc.slot_duration_minutes ?? 60);
    const step = Math.max(15, stepRaw); // mínimo 15min pra evitar listas absurdas
    const hours: string[] = [];
    const seen = new Set<string>();
    for (const w of sc.available_windows) {
      const [fH, fM] = (w.from || "00:00").split(":").map((s: string) => Number(s) || 0);
      const [tH, tM] = (w.to || "00:00").split(":").map((s: string) => Number(s) || 0);
      const fromMin = fH * 60 + fM;
      const toMin = tH * 60 + tM;
      if (toMin <= fromMin) continue; // janela inválida (to <= from)
      for (let m = fromMin; m < toMin; m += step) {
        const h = Math.floor(m / 60);
        const mm = m % 60;
        const key = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
        if (!seen.has(key)) {
          seen.add(key);
          hours.push(key);
        }
      }
    }
    if (hours.length > 0) return hours;
  }
  return ["10:00", "14:00", "16:00"];
}

/**
 * Converte "HH:MM" pra minutos desde 00:00. "09:30" → 570.
 */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => Number(x) || 0);
  return h * 60 + m;
}

/**
 * Converte minutos desde 00:00 pra "HH:MM". 570 → "09:30".
 */
export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Range contínuo de horário livre num dia. start/end em minutos desde 00:00.
 */
export interface FreeRange {
  startMin: number;
  endMin: number;
}

/**
 * Dia útil com ranges livres.
 */
export interface DayWithRanges {
  /** "DD/MM" ou "DD/MM/YYYY" conforme dateFormat */
  date: string;
  /** "qui", "sex", etc */
  weekday: string;
  /** YYYY-MM-DD pra debug */
  iso_date: string;
  /** Ranges contínuos livres no dia. Cada range tem tamanho >= minDurationMin. */
  ranges: FreeRange[];
}

/**
 * Calcula ranges contínuos livres na agenda da Wedding Planner pros próximos
 * `maxDays` dias úteis. Subtrai reuniões já agendadas (com duração) das janelas
 * configuradas. Retorna só ranges com tamanho >= minDurationMin (default 60min).
 *
 * Lead pode escolher qualquer múltiplo de 15min dentro de cada range — desde
 * que a reunião proposta (início + duração) caiba inteira no range.
 */
export function calculateFreeRanges(
  windows: Array<{ from: string; to: string }>,
  busyByDay: Map<string, Array<{ startMin: number; endMin: number }>>,
  daysList: Array<{ date: string; weekday: string; iso_date: string }>,
  minDurationMin: number,
): DayWithRanges[] {
  const result: DayWithRanges[] = [];
  // Normaliza janelas em minutos, ordena por início, mescla sobrepostas
  const baseWindows = windows
    .map((w) => ({ startMin: timeToMinutes(w.from), endMin: timeToMinutes(w.to) }))
    .filter((w) => w.endMin > w.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  for (const day of daysList) {
    const busy = (busyByDay.get(day.iso_date) || []).sort((a, b) => a.startMin - b.startMin);
    const freeRanges: FreeRange[] = [];

    for (const win of baseWindows) {
      let cursor = win.startMin;
      // Subtrai cada reunião que cai dentro da janela
      for (const b of busy) {
        if (b.endMin <= cursor) continue; // já passou
        if (b.startMin >= win.endMin) break; // depois da janela
        const overlapStart = Math.max(cursor, b.startMin);
        const overlapEnd = Math.min(win.endMin, b.endMin);
        // Range livre antes do bloqueio
        if (cursor < overlapStart && overlapStart - cursor >= minDurationMin) {
          freeRanges.push({ startMin: cursor, endMin: overlapStart });
        }
        cursor = Math.max(cursor, overlapEnd);
      }
      // Sobrou range livre até o final da janela
      if (cursor < win.endMin && win.endMin - cursor >= minDurationMin) {
        freeRanges.push({ startMin: cursor, endMin: win.endMin });
      }
    }

    if (freeRanges.length > 0) {
      result.push({
        date: day.date,
        weekday: day.weekday,
        iso_date: day.iso_date,
        ranges: freeRanges,
      });
    }
  }

  return result;
}

/**
 * Valida se um horário escolhido pelo lead cabe em algum range livre + duração.
 *
 * Retorna null se válido, ou string de erro descritiva.
 *
 * Regras:
 * - Múltiplo de `granularityMin` (default 15min)
 * - Início + duração cabem inteiros em algum range livre
 */
export function validateChosenTime(
  isoDate: string, // YYYY-MM-DD
  timeStr: string, // HH:MM
  durationMin: number,
  granularityMin: number,
  availableRanges: DayWithRanges[],
): string | null {
  const tm = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return "horário inválido — formato esperado HH:MM";

  const h = Number(tm[1]);
  const m = Number(tm[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return "horário inválido — fora de 00:00 a 23:59";

  const startMin = h * 60 + m;
  if (startMin % granularityMin !== 0) {
    return `horário deve ser múltiplo de ${granularityMin} minutos (ex: ${minutesToTime(Math.floor(startMin / granularityMin) * granularityMin)} ou ${minutesToTime(Math.ceil(startMin / granularityMin) * granularityMin)})`;
  }
  const endMin = startMin + durationMin;

  const dayMatch = availableRanges.find((d) => d.iso_date === isoDate);
  if (!dayMatch) return `não atendemos no dia ${isoDate} (fora dos próximos dias úteis ou agenda lotada)`;

  const fits = dayMatch.ranges.some((r) => startMin >= r.startMin && endMin <= r.endMin);
  if (!fits) {
    const rangesText = dayMatch.ranges
      .map((r) => `das ${minutesToTime(r.startMin)} às ${minutesToTime(r.endMin)}`)
      .join(", ");
    return `horário escolhido (${timeStr}, com reunião de ${durationMin}min) não cabe nos ranges livres do dia. Disponível: ${rangesText}.`;
  }
  return null;
}

export interface BusinessConfigRow {
  agent_id: string;
  company_name: string | null;
  company_description: string | null;
  methodology_text: string | null;
  process_steps: unknown[] | null;
  protected_fields: string[] | null;
  auto_update_fields: string[] | null;
  contact_update_fields: string[] | null;
  secondary_contact_role_name: string | null;
  custom_blocks: unknown;
  // Campos editáveis pelo admin que substituem trechos antes hardcoded no
  // texto canônico da Patricia. Adicionados em migration 20260521b.
  empresa_stats_text: string | null;
  network_regions_text: string | null;
  destination_categories_text: string | null;
  brochure_policy_text: string | null;
  honorario_faixa_text: string | null;
}

export interface IncomingMessageInput {
  contact_phone: string;
  message_text: string;
  message_type?: string;
  phone_number_id: string;
  phone_number_label?: string;
  echo_conversation_id?: string;
}

// ============================================================================
// Phone helpers
// ============================================================================

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/**
 * Gera o conjunto de variantes equivalentes de um telefone brasileiro.
 * Cobre as 4 dimensões em que admin e provedor podem divergir:
 *   - Com/sem DDI 55
 *   - Celular com/sem o 9 obrigatório (vigente desde 2012; números
 *     antigos/VoIP podem chegar sem)
 *   - Formatação livre (parênteses, traços, espaços, +) — ignorada
 *
 * Ex: "554198839193" gera { "554198839193", "4198839193",
 *                          "5541998839193", "41998839193" }
 *
 * Isso permite que admin cadastre o telefone em qualquer um dos formatos
 * e o match funcione contra qualquer outro formato equivalente.
 */
export function phoneVariants(phone: string): Set<string> {
  const digits = (phone || "").replace(/\D/g, "");
  const out = new Set<string>();
  if (!digits) return out;
  out.add(digits);

  // Versão sem DDI 55 (Brasil)
  let stripped = digits;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    stripped = digits.substring(2);
    out.add(stripped);
  }

  // Variantes com/sem o "9" obrigatório do celular brasileiro
  if (stripped.length === 11) {
    // Formato com 9 (DDD + 9 + 8 dígitos): gera variante sem o 9
    const ddd = stripped.substring(0, 2);
    const rest = stripped.substring(2);
    if (rest.startsWith("9")) {
      out.add(ddd + rest.substring(1)); // 10 dígitos
    }
  } else if (stripped.length === 10) {
    // Formato sem 9 (DDD + 8 dígitos): gera variante com o 9 obrigatório
    // (só faz sentido pra celulares antigos; pra fixo é falso positivo
    // inofensivo porque admin controla a whitelist)
    const ddd = stripped.substring(0, 2);
    const rest = stripped.substring(2);
    out.add(ddd + "9" + rest); // 11 dígitos
  }

  // Adiciona versão COM DDI 55 pra cada variante BR
  for (const v of Array.from(out)) {
    if (v.length === 10 || v.length === 11) {
      out.add("55" + v);
    }
  }

  return out;
}

export function isPhoneInWhitelist(
  phone: string,
  whitelist: string[] | null,
): boolean {
  if (!whitelist || whitelist.length === 0) return true; // sem whitelist = todos permitidos
  const phoneSet = phoneVariants(phone);
  for (const w of whitelist) {
    const wSet = phoneVariants(w);
    for (const v of phoneSet) {
      if (wSet.has(v)) return true;
    }
  }
  return false;
}

// ============================================================================
// OpenAI helper (chamada simples, sem tools loop)
// ============================================================================

export interface CallLLMResult {
  response: string;
  duration_ms: number;
  model_used: string;
}

export async function callLLM(
  model: string,
  temperature: number,
  maxTokens: number,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  responseFormat?: Record<string, unknown>,
): Promise<CallLLMResult> {
  const startedAt = Date.now();

  const body: Record<string, unknown> = {
    model,
    temperature,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  if (responseFormat) body.response_format = responseFormat;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI HTTP ${response.status}: ${err.substring(0, 500)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  return {
    response: content,
    duration_ms: Date.now() - startedAt,
    model_used: model,
  };
}

// ============================================================================
// Echo (WhatsApp) sender
// ============================================================================

export interface SendEchoResult {
  ok: boolean;
  status: number;
  body?: string;
  error?: string;
}

export async function sendEchoMessage(
  echoApiUrl: string,
  echoApiKey: string,
  phoneNumberId: string,
  contactPhone: string,
  text: string,
): Promise<SendEchoResult> {
  try {
    const normalizedPhone = contactPhone.replace(/\D/g, "");
    const response = await fetch(echoApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": echoApiKey,
      },
      body: JSON.stringify({
        to: normalizedPhone,
        message: text,
        phone_number_id: phoneNumberId,
      }),
    });
    const responseText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body: responseText.substring(0, 500),
    };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

// ============================================================================
// Format pra WhatsApp (heurístico, sem LLM)
// ============================================================================

export function normalizeWhatsAppText(text: string): string {
  if (!text) return "";
  return text
    // remove separadores markdown (---, ***, ___) em linha isolada — o LLM
    // usa como divisor visual entre blocos, mas no WhatsApp vira texto literal.
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "")
    // remove travessões e hífens longos como separadores
    .replace(/\s*[—–]\s*/g, ". ")
    // colapsa espaços múltiplos
    .replace(/[ \t]{2,}/g, " ")
    // limita newlines a 2 seguidos
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatWhatsAppMessagesHeuristic(
  text: string,
  maxBlocks = 3,
  maxCharsPerBlock = 1024,
): string[] {
  const normalized = normalizeWhatsAppText(text);
  if (!normalized) return [];

  // Tenta quebrar em blocos por \n\n primeiro
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);

  if (paragraphs.length <= maxBlocks) {
    // Cada parágrafo é uma mensagem (truncar se passar de maxCharsPerBlock)
    return paragraphs.map((p) => p.length > maxCharsPerBlock ? p.substring(0, maxCharsPerBlock - 1) + "…" : p);
  }

  // Junta em maxBlocks blocos
  const result: string[] = [];
  const perBlock = Math.ceil(paragraphs.length / maxBlocks);
  for (let i = 0; i < maxBlocks; i++) {
    const chunk = paragraphs.slice(i * perBlock, (i + 1) * perBlock).join("\n\n");
    if (chunk) result.push(chunk.length > maxCharsPerBlock ? chunk.substring(0, maxCharsPerBlock - 1) + "…" : chunk);
  }
  return result;
}

// ============================================================================
// Conversation history helpers
// ============================================================================

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  // T1.2 — true quando o turno foi a fallback_message do sistema (validator
  // bloqueou e router enviou frase de emergência). Marcada no histórico
  // como [SISTEMA—FALLBACK] pra detect_pending_promises NÃO confundir com
  // promessa real do agente, causando loop fatal recursivo.
  is_system_fallback?: boolean;
}

export async function loadConversationHistory(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 20,
): Promise<ConversationTurn[]> {
  const { data, error } = await supabase
    .from("ai_conversation_turns")
    .select("id, role, content, created_at, context_used")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[loadConversationHistory] error:", error);
    return [];
  }
  const raw = (data || []).reverse();
  return raw.map((t: { id: string; role: string; content: string; created_at: string; context_used: Record<string, unknown> | null }) => {
    const cu = t.context_used || {};
    return {
      id: t.id,
      role: t.role as ConversationTurn["role"],
      content: t.content,
      created_at: t.created_at,
      is_system_fallback: cu.fallback_triggered === true,
    };
  });
}

export function compactConversationHistory(turns: ConversationTurn[]): string {
  if (turns.length === 0) return "(sem histórico)";

  const lines: string[] = [];
  for (const turn of turns) {
    const role = turn.role === "user" ? "Lead" : turn.role === "assistant" ? "Você" : "Sistema";
    // T1.2 — frase do sistema marcada explicitamente. detect_pending_promises
    // foi instruído a IGNORAR mensagens com essa tag (texto da rotina em
    // patricia_diff_cognitivo.ts). Sem isso a frase de fallback ("deixa eu
    // confirmar com a equipe") era detectada como promessa do agente no turno
    // seguinte e causava loop fatal de bloqueio.
    if (turn.is_system_fallback) {
      lines.push(`[SISTEMA—FALLBACK] ${turn.content}`);
    } else {
      lines.push(`${role}: ${turn.content}`);
    }
  }
  return lines.join("\n");
}

// ============================================================================
// Tools execution (RPCs / Supabase calls)
// ============================================================================

export interface ToolCallInput {
  tool_name: string;
  args: Record<string, unknown>;
}

export interface ToolCallResult {
  tool_name: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  duration_ms: number;
}

export async function executePatriciaToolCall(
  supabase: SupabaseClient,
  agent: AgentRow,
  cardId: string | null,
  contactId: string | null,
  call: ToolCallInput,
): Promise<ToolCallResult> {
  const startedAt = Date.now();
  try {
    switch (call.tool_name) {
      case "calculate_qualification_score": {
        const fields = (call.args.fields as Record<string, unknown>) || call.args;
        const { data, error } = await supabase.rpc(
          "calculate_agent_qualification_score",
          { p_agent_id: agent.id, p_inputs: fields },
        );
        if (error) throw error;
        return { tool_name: call.tool_name, ok: true, result: data, duration_ms: Date.now() - startedAt };
      }

      case "search_knowledge_base": {
        // Patricia v1: KB ainda não populada (ver memory). Fallback que loga.
        console.log("[tool] search_knowledge_base (KB ainda vazia)", call.args);
        return { tool_name: call.tool_name, ok: true, result: { results: [] }, duration_ms: Date.now() - startedAt };
      }

      case "check_calendar": {
        // Verifica agenda real da Wedding Planner.
        // Args: { data_inicio?: 'DD/MM' ou 'DD/MM/YYYY' ou 'YYYY-MM-DD',
        //         data_fim?: idem, quantidade?: int (default 6, max 15) }
        // Respeita scheduling_config do agente (horários disponíveis,
        // skip_weekends, formato de data). Filtra conflitos com reuniões
        // já agendadas/confirmadas no responsável_id da WP.
        if (!agent.wedding_planner_profile_id) {
          return { tool_name: call.tool_name, ok: false, error: "Wedding Planner não configurada — configure ai_agents.wedding_planner_profile_id.", duration_ms: Date.now() - startedAt };
        }

        const sc = agent.scheduling_config ?? {};
        const availableHours = expandAvailableHours(sc);
        const skipWeekends = sc.skip_weekends !== false;
        const windowDays = Number(sc.search_window_days ?? 14);
        const dateFormat = sc.date_format === "full" ? "full" : "short";

        const parseFlexDate = (s: unknown): Date | null => {
          if (typeof s !== "string") return null;
          let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
          if (m) return new Date(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T00:00:00`);
          m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (m) return new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T00:00:00`);
          m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
          if (m) {
            const now = new Date();
            const yyyy = now.getFullYear();
            const candidate = new Date(`${yyyy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T00:00:00`);
            if (candidate.getTime() < now.getTime() - 24 * 3600 * 1000) candidate.setFullYear(yyyy + 1);
            return candidate;
          }
          return null;
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const args = call.args || {};
        let rangeStart: Date | null = parseFlexDate(args.data_inicio);
        let rangeEnd: Date | null = parseFlexDate(args.data_fim);
        const userPickedSpecificStart = !!rangeStart;
        let rolledFromWeekend: { original: string } | null = null;

        // Defaults: começa amanhã, vai até janela configurada
        if (!rangeStart) {
          rangeStart = new Date(today);
          rangeStart.setDate(today.getDate() + 1);
        }

        // Auto-roll quando o lead pede uma data que cai em fim de semana
        // E skip_weekends=true. Avança pra próxima segunda-feira e devolve
        // slots reais (em vez de retornar vazio com note pedindo "qual dia
        // alternativo?"). UX melhor: lead pede "dia 17", recebe horários
        // do dia 18 com nota explicando que 17 era domingo.
        if (userPickedSpecificStart && skipWeekends) {
          const wd = rangeStart.getDay();
          if (wd === 0 || wd === 6) {
            const originalDD = String(rangeStart.getDate()).padStart(2, "0");
            const originalMM = String(rangeStart.getMonth() + 1).padStart(2, "0");
            const originalLabel = dateFormat === "full"
              ? `${originalDD}/${originalMM}/${rangeStart.getFullYear()}`
              : `${originalDD}/${originalMM}`;
            rolledFromWeekend = { original: originalLabel };
            // Avança 1 ou 2 dias até segunda
            while (rangeStart.getDay() === 0 || rangeStart.getDay() === 6) {
              rangeStart.setDate(rangeStart.getDate() + 1);
            }
            // Se o lead não definiu data_fim, ajusta rangeEnd pra
            // janela a partir da nova data
            if (!rangeEnd) {
              rangeEnd = new Date(rangeStart);
              rangeEnd.setDate(rangeStart.getDate() + windowDays);
            }
          }
        }
        if (!rangeEnd) {
          rangeEnd = new Date(rangeStart);
          rangeEnd.setDate(rangeStart.getDate() + windowDays);
        }
        // Cap em janela máxima a partir de hoje
        const maxEnd = new Date(today);
        maxEnd.setDate(today.getDate() + Math.max(windowDays, 30));
        if (rangeEnd.getTime() > maxEnd.getTime()) rangeEnd = maxEnd;
        // Garante rangeEnd >= rangeStart
        if (rangeEnd.getTime() < rangeStart.getTime()) rangeEnd = new Date(rangeStart);

        const quantidade = Math.min(Math.max(Number(args.quantidade ?? 6), 1), 15);

        // Gera candidatos no range
        const weekdayLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
        type Slot = { date: string; time: string; weekday: string; iso: string };
        const candidates: Slot[] = [];
        const fmt = (d: Date): string => {
          const dd = String(d.getDate()).padStart(2, "0");
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          return dateFormat === "full" ? `${dd}/${mm}/${d.getFullYear()}` : `${dd}/${mm}`;
        };

        const cur = new Date(rangeStart);
        cur.setHours(0, 0, 0, 0);
        let skippedWeekendDays = 0;
        let totalDaysScanned = 0;
        while (cur.getTime() <= rangeEnd.getTime() && candidates.length < 60) {
          const wd = cur.getDay();
          totalDaysScanned++;
          if (skipWeekends && (wd === 0 || wd === 6)) {
            skippedWeekendDays++;
            cur.setDate(cur.getDate() + 1);
            continue;
          }
          const yyyy = cur.getFullYear();
          const mm = String(cur.getMonth() + 1).padStart(2, "0");
          const dd = String(cur.getDate()).padStart(2, "0");
          const dateStr = fmt(cur);
          for (const h of availableHours) {
            candidates.push({
              date: dateStr,
              time: h,
              weekday: weekdayLabels[wd],
              iso: `${yyyy}-${mm}-${dd}T${h}:00`,
            });
          }
          cur.setDate(cur.getDate() + 1);
        }

        // Busca reuniões da WP no range — tabela canônica é `tarefas` com
        // tipo='reuniao' (mesma que a página Agenda usa). Antes lia de
        // `reunioes` (legado, só 7 entries) e mostrava slots "livres" que
        // na verdade estavam ocupados. Corrigido 18/05.
        const occupied = new Set<string>();
        try {
          const endPlus = new Date(rangeEnd);
          endPlus.setDate(endPlus.getDate() + 1);
          const { data: meetings, error: meetErr } = await supabase
            .from("tarefas")
            .select("data_vencimento")
            .eq("org_id", agent.org_id)
            .eq("tipo", "reuniao")
            .eq("responsavel_id", agent.wedding_planner_profile_id)
            .is("deleted_at", null)
            .gte("data_vencimento", rangeStart.toISOString())
            .lt("data_vencimento", endPlus.toISOString())
            .in("status", ["agendada", "confirmada", "agendado", "confirmado", "pendente"]);
          if (meetErr) {
            console.warn("[tool check_calendar] erro lendo tarefas:", meetErr.message);
          } else if (Array.isArray(meetings)) {
            for (const m of meetings) {
              const di = (m as { data_vencimento: string | null }).data_vencimento;
              if (!di) continue;
              const md = new Date(di);
              const yyyy = md.getFullYear();
              const mm = String(md.getMonth() + 1).padStart(2, "0");
              const dd = String(md.getDate()).padStart(2, "0");
              const hh = String(md.getHours()).padStart(2, "0");
              const mi = String(md.getMinutes()).padStart(2, "0");
              occupied.add(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00`);
            }
          }
        } catch (e) {
          console.warn("[tool check_calendar] exception:", (e as Error).message);
        }

        const free = candidates.filter((c) => !occupied.has(c.iso));
        const finalSlots = free.slice(0, quantidade).map((s) => ({
          date: s.date,
          time: s.time,
          weekday: s.weekday,
        }));

        // Diagnóstico explícito quando a lista vem vazia OU quando rolamos
        // de fim de semana pra dia útil (lead precisa ser informado).
        let note: string | null = null;
        if (rolledFromWeekend) {
          // Sempre coloca a nota quando rolou — mesmo que tenha slots
          note = `A data solicitada (${rolledFromWeekend.original}) é final de semana e a Wedding Planner não atende sáb/dom. Slots abaixo são do PRÓXIMO dia útil. Mencione isso ao lead com naturalidade ANTES de oferecer os horários (ex: "${rolledFromWeekend.original} cai num domingo, mas no dia útil seguinte ela tem...").`;
        } else if (finalSlots.length === 0) {
          if (userPickedSpecificStart && skipWeekends && totalDaysScanned === skippedWeekendDays && skippedWeekendDays > 0) {
            note = "data solicitada cai em final de semana — Wedding Planner não atende sábado/domingo. Sugira um dia útil próximo.";
          } else if (candidates.length === 0) {
            note = "nenhum dia útil no range solicitado.";
          } else {
            note = "todos os horários disponíveis estão ocupados nesse intervalo. Tente outra data.";
          }
        }

        return {
          tool_name: call.tool_name,
          ok: true,
          result: { slots_disponiveis: finalSlots, note },
          duration_ms: Date.now() - startedAt,
        };
      }

      case "confirm_meeting_slot": {
        // Cria reunião real na agenda da Wedding Planner. Chamada quando o
        // casal escolhe um dos slots oferecidos no desfecho_qualificado.
        //
        // Args esperados: { date: "DD/MM/YYYY", time: "HH:MM" } OU
        //                 { iso: "YYYY-MM-DDTHH:MM:00" }
        //
        // Idempotência: se já existe reunião agendada/confirmada para a
        // mesma WP no horário exato, retorna sucesso sem criar duplicata.
        if (!cardId) {
          return { tool_name: call.tool_name, ok: false, error: "card_id ausente — Patricia precisa estar vinculada a um card pra agendar reunião", duration_ms: Date.now() - startedAt };
        }
        if (!agent.wedding_planner_profile_id) {
          return { tool_name: call.tool_name, ok: false, error: "Wedding Planner não configurada no agente. Configure ai_agents.wedding_planner_profile_id.", duration_ms: Date.now() - startedAt };
        }

        // Parse data/hora → ISO em BRT (UTC-3). Aceita:
        //   - iso: "YYYY-MM-DDTHH:MM:00" (passa direto, anexa -03:00 se sem TZ)
        //   - date "DD/MM/YYYY" + time "HH:MM"
        //   - date "DD/MM" + time "HH:MM" (deriva ano: corrente ou próximo se já passou)
        //
        // IMPORTANTE: BRT (-03:00) é fixo desde 2019 (Brasil sem DST). Sem timezone
        // o Postgres trata como UTC e cria reunião 3h antes do esperado.
        let isoLocal: string | null = null;
        if (typeof call.args.iso === "string") {
          isoLocal = call.args.iso;
          // Se veio sem timezone, anexa BRT
          if (!/[+-]\d{2}:?\d{2}$|Z$/.test(isoLocal)) {
            isoLocal = `${isoLocal}-03:00`;
          }
        } else if (typeof call.args.date === "string" && typeof call.args.time === "string") {
          const dateFull = call.args.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          const dateShort = call.args.date.match(/^(\d{1,2})\/(\d{1,2})$/);
          const timeMatch = call.args.time.match(/^(\d{1,2}):(\d{2})$/);
          if (timeMatch) {
            const hh = timeMatch[1].padStart(2, "0");
            const mi = timeMatch[2];
            if (dateFull) {
              const dd = dateFull[1].padStart(2, "0");
              const mm = dateFull[2].padStart(2, "0");
              isoLocal = `${dateFull[3]}-${mm}-${dd}T${hh}:${mi}:00-03:00`;
            } else if (dateShort) {
              const dd = dateShort[1].padStart(2, "0");
              const mm = dateShort[2].padStart(2, "0");
              const now = new Date();
              let yyyy = now.getFullYear();
              const candidate = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00-03:00`);
              if (Number.isNaN(candidate.getTime())) {
                isoLocal = null;
              } else {
                const diffMs = candidate.getTime() - now.getTime();
                if (diffMs < -24 * 3600 * 1000) {
                  yyyy++;
                }
                isoLocal = `${yyyy}-${mm}-${dd}T${hh}:${mi}:00-03:00`;
              }
            }
          }
        }
        if (!isoLocal) {
          return { tool_name: call.tool_name, ok: false, error: "formato inválido. Esperado { date: 'DD/MM' ou 'DD/MM/YYYY', time: 'HH:MM' } ou { iso: 'YYYY-MM-DDTHH:MM:00' }", duration_ms: Date.now() - startedAt };
        }

        // Validações de granularidade + range + conflito real (com duração).
        // Modelo de ranges contínuos: lead escolhe horário arbitrário dentro
        // de um range livre, sistema valida que:
        //   1. Horário é múltiplo de 15min
        //   2. Início + duração (60min default) cabe numa janela configurada
        //   3. Não conflita com reunião existente (considera duração)
        const sc = (agent.scheduling_config ?? {}) as { slot_duration_minutes?: number; available_windows?: Array<{ from: string; to: string }> };
        const slotDurationMin = Number(sc.slot_duration_minutes ?? 60);
        const GRANULARITY_MIN = 15;
        const windows = (sc.available_windows && sc.available_windows.length > 0)
          ? sc.available_windows
          : [{ from: "09:00", to: "12:00" }, { from: "14:00", to: "18:00" }];

        // Parse iso pra startMin do dia (em BRT, ignora o sufixo de TZ)
        const isoMatch = isoLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (!isoMatch) {
          return { tool_name: call.tool_name, ok: false, error: "formato iso inválido", duration_ms: Date.now() - startedAt };
        }
        const reqDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
        const reqHour = Number(isoMatch[4]);
        const reqMin = Number(isoMatch[5]);
        const reqStartMin = reqHour * 60 + reqMin;
        const reqEndMin = reqStartMin + slotDurationMin;

        // 1. Granularidade
        if (reqStartMin % GRANULARITY_MIN !== 0) {
          const lower = Math.floor(reqStartMin / GRANULARITY_MIN) * GRANULARITY_MIN;
          const upper = Math.ceil(reqStartMin / GRANULARITY_MIN) * GRANULARITY_MIN;
          return {
            tool_name: call.tool_name,
            ok: false,
            error: `horário ${isoMatch[4]}:${isoMatch[5]} deve ser múltiplo de ${GRANULARITY_MIN} minutos. Sugestões próximas: ${minutesToTime(lower)} ou ${minutesToTime(upper)}.`,
            duration_ms: Date.now() - startedAt,
          };
        }

        // 2. Encaixe nas janelas (com duração)
        const fitsWindow = windows.some((w) => {
          const wStart = timeToMinutes(w.from);
          const wEnd = timeToMinutes(w.to);
          return reqStartMin >= wStart && reqEndMin <= wEnd;
        });
        if (!fitsWindow) {
          const winList = windows.map((w) => `${w.from}-${w.to}`).join(", ");
          return {
            tool_name: call.tool_name,
            ok: false,
            error: `horário ${isoMatch[4]}:${isoMatch[5]} (com reunião de ${slotDurationMin}min) não cabe nas janelas de atendimento: ${winList}. Escolha outro horário.`,
            duration_ms: Date.now() - startedAt,
          };
        }

        // 3. Conflito com reuniões existentes do dia (considerando duração)
        // Busca todas as reuniões da WP nesse dia e checa se intervalo
        // [reqStartMin, reqEndMin) sobrepõe com [m.startMin, m.endMin).
        const BRT_OFFSET_MIN = -180;
        const dayStartUtc = new Date(`${reqDate}T00:00:00-03:00`);
        const dayEndUtc = new Date(`${reqDate}T23:59:59-03:00`);
        const { data: dayMeetings, error: dayErr } = await supabase
          .from("tarefas")
          .select("id,card_id,data_vencimento,metadata")
          .eq("tipo", "reuniao")
          .eq("responsavel_id", agent.wedding_planner_profile_id)
          .gte("data_vencimento", dayStartUtc.toISOString())
          .lte("data_vencimento", dayEndUtc.toISOString())
          .is("deleted_at", null)
          .in("status", ["agendada", "confirmada", "agendado", "confirmado", "pendente"]);
        if (dayErr) {
          console.warn("[tool confirm_meeting_slot] erro lendo agenda do dia:", dayErr.message);
        }
        if (Array.isArray(dayMeetings) && dayMeetings.length > 0) {
          for (const m of dayMeetings) {
            const di = (m as { data_vencimento: string | null }).data_vencimento;
            if (!di) continue;
            const md = new Date(di);
            const mdBrt = new Date(md.getTime() + BRT_OFFSET_MIN * 60 * 1000);
            const mStart = mdBrt.getUTCHours() * 60 + mdBrt.getUTCMinutes();
            const mMeta = (m as { metadata: { duration_minutes?: number } | null }).metadata;
            const mDur = Number(mMeta?.duration_minutes ?? slotDurationMin);
            const mEnd = mStart + mDur;
            // Sobreposição: [reqStartMin, reqEndMin) ∩ [mStart, mEnd) != vazio
            if (reqStartMin < mEnd && reqEndMin > mStart) {
              // Idempotência: mesmo card no horário EXATO retorna sucesso
              if (reqStartMin === mStart && (m as { card_id: string }).card_id === cardId) {
                return {
                  tool_name: call.tool_name,
                  ok: true,
                  result: { reuniao_id: (m as { id: string }).id, status: "already_scheduled", iso: isoLocal },
                  duration_ms: Date.now() - startedAt,
                };
              }
              return {
                tool_name: call.tool_name,
                ok: false,
                error: `horário escolhido (${isoMatch[4]}:${isoMatch[5]}, com reunião de ${slotDurationMin}min) conflita com outra reunião já agendada (${minutesToTime(mStart)} a ${minutesToTime(mEnd)}). Peça pro casal escolher outro horário.`,
                duration_ms: Date.now() - startedAt,
              };
            }
          }
        }

        // Pega titulo do card pra usar no titulo da reunião
        const { data: cardRow } = await supabase
          .from("cards")
          .select("titulo")
          .eq("id", cardId)
          .maybeSingle();
        const meetingTitle = cardRow?.titulo
          ? `Reunião Wedding Planner — ${cardRow.titulo}`
          : "Reunião Wedding Planner";

        const { data: inserted, error: insErr } = await supabase
          .from("tarefas")
          .insert({
            card_id: cardId,
            org_id: agent.org_id,
            tipo: "reuniao",
            titulo: meetingTitle,
            responsavel_id: agent.wedding_planner_profile_id,
            data_vencimento: isoLocal,
            status: "agendada",
            metadata: { duration_minutes: slotDurationMin, source: "ai_agent_v2" },
          })
          .select("id")
          .single();
        if (insErr) {
          return {
            tool_name: call.tool_name,
            ok: false,
            error: `falha ao criar reunião: ${insErr.message}`,
            duration_ms: Date.now() - startedAt,
          };
        }
        return {
          tool_name: call.tool_name,
          ok: true,
          result: { reuniao_id: inserted.id, status: "scheduled", iso: isoLocal },
          duration_ms: Date.now() - startedAt,
        };
      }

      case "request_handoff": {
        // Aplica handoff_actions do agente: muda stage + (opcional) pausa
        // permanentemente o agente pra esse card + notifica responsável.
        // Sem pause+notify, o agente continua respondendo e ninguém vê o pedido.
        if (!cardId) {
          return { tool_name: call.tool_name, ok: false, error: "card_id ausente", duration_ms: Date.now() - startedAt };
        }
        const ha = (agent.handoff_actions || {}) as Record<string, unknown>;
        const motivo = (call.args && typeof call.args === "object" ? (call.args as Record<string, unknown>).motivo : null) || "handoff_solicitado";

        // 1. Update do card: muda stage + (se configurado) pausa permanente
        const updates: Record<string, unknown> = {};
        if (ha.change_stage_id) updates.pipeline_stage_id = ha.change_stage_id;

        if (ha.pause_permanently === true) {
          updates.ai_pause_config = {
            permanent: true,
            reason: typeof motivo === "string" ? motivo : "handoff_solicitado",
            paused_at: new Date().toISOString(),
          };
        }

        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from("cards").update(updates).eq("id", cardId);
          if (error) throw error;
        }

        // 2. Notificar humano responsável (se configurado)
        const notifyEnabled = ha.notify_responsible === true;
        const bookMeeting = (ha.book_meeting || {}) as Record<string, unknown>;
        const responsavelId = (bookMeeting.responsavel_id as string | undefined) || (ha.responsavel_id as string | undefined) || agent.wedding_planner_profile_id;

        let notified = false;
        if (notifyEnabled && responsavelId) {
          const { error: notifyErr } = await supabase.from("notifications").insert({
            user_id: responsavelId,
            org_id: agent.org_id,
            type: "handoff_agente",
            title: `${agent.nome} pediu handoff`,
            body: typeof motivo === "string" ? motivo : "Agente travou e solicitou humano.",
            card_id: cardId,
            url: `/cards/${cardId}`,
            metadata: { agent_id: agent.id, motivo, severity: "high" },
          });
          if (notifyErr) {
            // Log mas não derruba o handoff — o stage mudou e a pausa foi setada.
            console.warn(`[request_handoff] falha ao notificar responsável: ${notifyErr.message}`);
          } else {
            notified = true;
          }
        }

        return {
          tool_name: call.tool_name,
          ok: true,
          result: { applied: updates, notified, responsavel_id: responsavelId || null },
          duration_ms: Date.now() - startedAt,
        };
      }

      case "update_contact": {
        if (!contactId) {
          return { tool_name: call.tool_name, ok: false, error: "contato_id ausente", duration_ms: Date.now() - startedAt };
        }
        const allowed = ["nome", "email", "data_nascimento"];
        const patch: Record<string, unknown> = {};
        for (const k of allowed) {
          if (call.args[k] != null) patch[k] = call.args[k];
        }
        if (Object.keys(patch).length === 0) {
          return { tool_name: call.tool_name, ok: true, result: { skipped: true }, duration_ms: Date.now() - startedAt };
        }
        const { error } = await supabase.from("contatos").update(patch).eq("id", contactId);
        if (error) throw error;
        return { tool_name: call.tool_name, ok: true, result: { applied: patch }, duration_ms: Date.now() - startedAt };
      }

      case "assign_tag": {
        if (!cardId) {
          return { tool_name: call.tool_name, ok: false, error: "card_id ausente", duration_ms: Date.now() - startedAt };
        }
        const tagName = call.args.tag_name || call.args.name;
        if (!tagName) {
          return { tool_name: call.tool_name, ok: false, error: "tag_name ausente", duration_ms: Date.now() - startedAt };
        }
        // Implementação simplificada: insert na junction table sem checar duplicate
        const { error } = await supabase.rpc("assign_card_tag_by_name", {
          p_card_id: cardId,
          p_tag_name: tagName,
          p_color: call.args.color || null,
        });
        if (error) {
          console.warn("[tool] assign_tag falhou (RPC pode não existir):", error.message);
          return { tool_name: call.tool_name, ok: false, error: error.message, duration_ms: Date.now() - startedAt };
        }
        return { tool_name: call.tool_name, ok: true, result: { tag: tagName }, duration_ms: Date.now() - startedAt };
      }

      case "create_task": {
        if (!cardId) {
          return { tool_name: call.tool_name, ok: false, error: "card_id ausente", duration_ms: Date.now() - startedAt };
        }
        // Tarefas internas vão em `tarefas` (NÃO em `activities` — essa é audit log).
        // Bug observado 2026-05-18: Patricia chamava create_task pra agendar
        // reunião com Diana e falhava com "assignee_id column not found" porque
        // o código antigo apontava pra tabela errada. Corrigido pra `tarefas`
        // com as colunas reais: titulo / data_vencimento / responsavel_id.
        const { data, error } = await supabase
          .from("tarefas")
          .insert({
            card_id: cardId,
            tipo: call.args.tipo || "tarefa",
            titulo: call.args.titulo || "Tarefa",
            descricao: call.args.descricao || null,
            data_vencimento: call.args.data_inicio || call.args.data_vencimento || null,
            responsavel_id: call.args.assignee_id || call.args.responsavel_id || null,
            status: "pendente",
            org_id: agent.org_id,
          })
          .select("id")
          .single();
        if (error) throw error;
        return { tool_name: call.tool_name, ok: true, result: data, duration_ms: Date.now() - startedAt };
      }

      default:
        return {
          tool_name: call.tool_name,
          ok: false,
          error: `Tool desconhecida: ${call.tool_name}`,
          duration_ms: Date.now() - startedAt,
        };
    }
  } catch (e) {
    return {
      tool_name: call.tool_name,
      ok: false,
      error: (e as Error).message,
      duration_ms: Date.now() - startedAt,
    };
  }
}

// ============================================================================
// Multimodal — áudio (Whisper) + imagem (Vision) + documento (file API)
// ============================================================================
//
// Cópia da lógica do router v1 adaptada pro contexto de casamento (não viagem).
// Engines isoladas — não importa de v1.

const WEDDING_IMAGE_PROMPT = `Descreva esta imagem enviada por um lead que está planejando o casamento.
Tipos comuns que podem aparecer:
- Inspiração visual (vestido, decoração, paleta de cores, local, buquê, mesa posta, foto Pinterest)
- Foto de local de casamento (praia, salão, vinícola, sítio)
- Captura de tela de planilha/orçamento/contrato
- Print de outro fornecedor (proposta concorrente, valor de referência)
- Documento (RG, comprovante, agenda)
- Foto do casal ou da família

Descreva objetivamente o que aparece. Se houver texto na imagem (planilha, contrato, captura), extraia o texto. Se houver valores em R$, liste. Se for inspiração visual, descreva estilo/cores/elementos.
Português, máximo 300 palavras. Direto e factual. Não invente.`;

const WEDDING_DOCUMENT_PROMPT = `Extraia texto e dados relevantes deste documento enviado por um lead de casamento.
Tipos comuns: orçamento de outro fornecedor, contrato, planilha de convidados, agenda, comprovante.
Extraia: datas, valores em R$, nomes de fornecedores, número de convidados, locais.
Português, formato estruturado, máximo 500 palavras.`;

export async function downloadMedia(url: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Media download failed ${response.status}`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const mimeType = response.headers.get("content-type") || "application/octet-stream";
  return { base64, mimeType };
}

export async function transcribeAudio(base64: string, mimeType: string, apiKey: string): Promise<string> {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "ogg";
  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: mimeType }), `audio.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("language", "pt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Whisper API error ${res.status}: ${await res.text()}`);
  const result = await res.json();
  return result.text || "";
}

export async function analyzeImage(base64: string, mimeType: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.1",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: WEDDING_IMAGE_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "low" } },
        ],
      }],
      max_completion_tokens: 1000,
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`Vision API ${res.status}: ${await res.text()}`);
  const result = await res.json();
  return result.choices?.[0]?.message?.content || "";
}

export async function analyzeDocument(base64: string, mimeType: string, apiKey: string): Promise<string> {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const ext = mimeType.includes("pdf") ? "pdf" : "bin";
  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: mimeType }), `document.${ext}`);
  formData.append("purpose", "assistants");

  const uploadRes = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!uploadRes.ok) throw new Error(`File upload ${uploadRes.status}: ${await uploadRes.text()}`);
  const fileObj = await uploadRes.json();

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.1",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: WEDDING_DOCUMENT_PROMPT },
            { type: "file", file: { file_id: fileObj.id } },
          ],
        }],
        max_completion_tokens: 1500,
        temperature: 0.1,
      }),
    });
    if (!res.ok) throw new Error(`Chat API ${res.status}: ${await res.text()}`);
    const result = await res.json();
    return result.choices?.[0]?.message?.content || "";
  } finally {
    fetch(`https://api.openai.com/v1/files/${fileObj.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {});
  }
}

/**
 * Processa mídia (áudio/imagem/documento) e retorna texto que entra no fluxo
 * do single_agent como se fosse mensagem de texto. Em falha, retorna placeholder
 * sinalizando o tipo recebido pra a agente tratar com graça.
 */
export async function processMediaToText(
  messageType: string,
  mediaUrl: string | null,
  apiKey: string,
  multimodalConfig?: { audio?: boolean; image?: boolean; pdf?: boolean } | null,
): Promise<string> {
  if (!mediaUrl) return "";
  if (!apiKey) return `[${messageType} recebido — processamento indisponível]`;

  // Sticker é WebP — usa mesmo path do image (OpenAI Vision aceita WebP).
  // Mensagens de fallback são NEUTRAS (descrevem a ação do lead, não erro
  // técnico) pra Patricia responder com naturalidade quando Vision falha.
  const isSticker = messageType === "sticker";

  // Respeitar toggle do agent (se admin desligou processamento de algum tipo).
  // Sticker reusa o toggle de image — ambos são imagens.
  if (multimodalConfig) {
    if (messageType === "audio" && multimodalConfig.audio === false) return `[áudio recebido — processamento desabilitado pelo admin]`;
    if ((messageType === "image" || isSticker) && multimodalConfig.image === false) {
      return isSticker ? `[lead reagiu com um sticker]` : `[imagem recebida — processamento desabilitado pelo admin]`;
    }
    if (messageType === "document" && multimodalConfig.pdf === false) return `[documento recebido — processamento desabilitado pelo admin]`;
  }

  try {
    const { base64, mimeType } = await downloadMedia(mediaUrl);
    if (messageType === "audio") {
      const text = await transcribeAudio(base64, mimeType, apiKey);
      return text ? `[transcrição de áudio]: ${text}` : `[áudio recebido — sem fala detectada]`;
    }
    if (messageType === "image" || isSticker) {
      const text = await analyzeImage(base64, mimeType, apiKey);
      if (isSticker) {
        // Sticker → fallback NEUTRO se Vision não conseguiu descrever.
        // Patricia responde naturalmente sem soar como erro técnico.
        return text ? `[descrição do sticker]: ${text}` : `[lead reagiu com um sticker]`;
      }
      return text ? `[análise de imagem]: ${text}` : `[imagem recebida — não consegui descrever]`;
    }
    if (messageType === "document") {
      const text = await analyzeDocument(base64, mimeType, apiKey);
      return text ? `[conteúdo do documento]: ${text}` : `[documento recebido — não consegui extrair]`;
    }
    return `[${messageType} recebido — tipo não suportado]`;
  } catch (err) {
    console.error(`[processMediaToText] erro processando ${messageType}:`, err);
    // Sticker: fallback NEUTRO mesmo no catch (rede caiu, Giphy 403, etc).
    if (isSticker) return `[lead reagiu com um sticker]`;
    return `[${messageType} recebido — falha no processamento]`;
  }
}
