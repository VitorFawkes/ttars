// Testes da função pura renderSlotForPrompt.
// Run: deno test --allow-net supabase/functions/ai-agent-router/__tests__/slot_renderer.test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderSlotForPrompt, type SlotV2 } from "../slot_renderer.ts";

function baseSlot(overrides: Partial<SlotV2> = {}): SlotV2 {
  return {
    key: "x",
    label: "X",
    goal: null,
    must_include: [],
    example_questions: [],
    literal_question: null,
    crm_field_key: null,
    ...overrides,
  };
}

Deno.test("renderSlotForPrompt: só goal preenchido", () => {
  const slot = baseSlot({
    key: "destino",
    label: "Destino",
    goal: "Saber a região ou país do casamento",
    crm_field_key: "ww_destino",
  });
  const rendered = renderSlotForPrompt(slot);
  assertStringIncludes(rendered ?? "", "Saber a região ou país do casamento");
  assertStringIncludes(rendered ?? "", "Formule a pergunta natural");
  assertEquals((rendered ?? "").includes("DEVE coletar EXATAMENTE"), false);
  assertEquals((rendered ?? "").includes("Referência de tom"), false);
});

Deno.test("renderSlotForPrompt: goal + must_include", () => {
  const slot = baseSlot({
    key: "data",
    label: "Data do casamento",
    goal: "Saber o mês e o ano do casamento",
    must_include: ["mês", "ano"],
    crm_field_key: "ww_data_casamento",
  });
  const rendered = renderSlotForPrompt(slot);
  assertStringIncludes(rendered ?? "", "Saber o mês e o ano do casamento");
  assertStringIncludes(rendered ?? "", "DEVE coletar EXATAMENTE: mês, ano");
  assertEquals((rendered ?? "").includes("Referência de tom"), false);
});

Deno.test("renderSlotForPrompt: goal + example_questions", () => {
  const slot = baseSlot({
    key: "info_3d8u",
    label: "Viagens Internacionais",
    goal: "Descobrir se viajou internacionalmente fora da América do Sul no último ano",
    example_questions: ["E só uma curiosidade, vocês viajaram esse último ano?"],
    crm_field_key: "ww_sdr_perfil_viagem_internacional",
  });
  const rendered = renderSlotForPrompt(slot);
  assertStringIncludes(rendered ?? "", "Descobrir se viajou internacionalmente");
  assertStringIncludes(rendered ?? "", "Referência de tom (não copiar literal)");
  assertStringIncludes(rendered ?? "", "E só uma curiosidade");
  assertEquals((rendered ?? "").includes("DEVE coletar EXATAMENTE"), false);
});

Deno.test("renderSlotForPrompt: goal + must_include + example_questions (ambos)", () => {
  const slot = baseSlot({
    key: "data",
    label: "Data",
    goal: "Saber mês e ano",
    must_include: ["mês", "ano"],
    example_questions: ["Quando vocês pensam em casar?"],
    crm_field_key: "ww_data",
  });
  const rendered = renderSlotForPrompt(slot);
  assertStringIncludes(rendered ?? "", "DEVE coletar EXATAMENTE: mês, ano");
  assertStringIncludes(rendered ?? "", "Referência de tom (não copiar literal)");
  assertStringIncludes(rendered ?? "", "Quando vocês pensam em casar");
});

Deno.test("renderSlotForPrompt: literal_question domina tudo", () => {
  const slot = baseSlot({
    key: "confirm",
    label: "Confirmação",
    goal: "Confirmar agendamento",
    must_include: ["destino", "data"],
    example_questions: ["Confirma?", "Tá bom?"],
    literal_question: "Te mandei o link da reunião. Combinado pra quinta às 14h?",
  });
  const rendered = renderSlotForPrompt(slot);
  assertStringIncludes(rendered ?? "", "Use exatamente esta pergunta");
  assertStringIncludes(rendered ?? "", "Te mandei o link da reunião. Combinado pra quinta às 14h?");
  assertEquals((rendered ?? "").includes("DEVE coletar EXATAMENTE"), false);
  assertEquals((rendered ?? "").includes("Referência de tom"), false);
});

Deno.test("renderSlotForPrompt: goal vazio retorna null (fallback legacy)", () => {
  const slot = baseSlot({ goal: "" });
  assertEquals(renderSlotForPrompt(slot), null);
});

Deno.test("renderSlotForPrompt: goal null retorna null (fallback legacy)", () => {
  const slot = baseSlot({ goal: null });
  assertEquals(renderSlotForPrompt(slot), null);
});

Deno.test("renderSlotForPrompt: reject_if é incluído", () => {
  const slot = baseSlot({
    key: "data",
    label: "Data",
    goal: "Saber mês e ano",
    must_include: ["mês", "ano"],
    crm_field_key: "ww_data",
    reject_if: [{ pattern: "ano que vem", hint: "peça mês específico" }],
  });
  const rendered = renderSlotForPrompt(slot);
  assertStringIncludes(rendered ?? "", "Se lead responder vagamente");
  assertStringIncludes(rendered ?? "", "ano que vem");
  assertStringIncludes(rendered ?? "", "peça mês específico");
});
