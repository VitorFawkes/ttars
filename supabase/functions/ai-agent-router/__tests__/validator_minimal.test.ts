// Testes do validator minimal. Run: deno test --allow-net <path>
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runValidatorMinimal } from "../validator_minimal.ts";

Deno.test("validator: resposta limpa publica", () => {
  const v = runValidatorMinimal({
    response: "Que legal saber que Caribe está no radar. Vocês já têm uma data em mente?",
    turn_count: 2,
  });
  assertEquals(v.decision, "PUBLICAR");
  assertEquals(v.red_lines_hit.length, 0);
});

Deno.test("validator: pega travessão", () => {
  const v = runValidatorMinimal({
    response: "Entendi — vocês querem celebrar na praia, super leve.",
    turn_count: 2,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit[0].rule, "never_dash_separator");
});

Deno.test("validator: pega emoji na primeira mensagem", () => {
  const v = runValidatorMinimal({
    response: "Olá! Tudo bem? 🙂",
    turn_count: 1,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit[0].rule, "never_emoji_first");
});

Deno.test("validator: emoji na segunda mensagem é OK", () => {
  const v = runValidatorMinimal({
    response: "Que máximo! 😊",
    turn_count: 2,
  });
  assertEquals(v.decision, "PUBLICAR");
});

Deno.test("validator: pega transfer explícito", () => {
  const v = runValidatorMinimal({
    response: "Deixa eu preparar tudo, vou passar pra nossa Wedding Planner.",
    turn_count: 3,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit[0].rule, "never_transfer_explicit");
});

Deno.test("validator: pega menção a preço com R$", () => {
  const v = runValidatorMinimal({
    response: "Pra um casamento desse porte, fica em torno de R$ 200.000.",
    turn_count: 3,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit[0].rule, "never_price");
});

Deno.test("validator: pega auto-clarificação (bug original)", () => {
  const v = runValidatorMinimal({
    response: "Só pra eu entender direitinho a sua pergunta: você quer saber se vocês precisam ter feito alguma viagem internacional?",
    turn_count: 3,
  });
  assertEquals(v.decision, "REGEN");
  // pode bater em never_self_clarify OU never_meta_question (ambos válidos)
  const rules = v.red_lines_hit.map((r) => r.rule);
  const hitAny = rules.includes("never_self_clarify") || rules.includes("never_meta_question");
  assertEquals(hitAny, true);
});

Deno.test("validator: pega meta-question 'você quer saber'", () => {
  const v = runValidatorMinimal({
    response: "Sobre o investimento, você quer saber se a gente trabalha com pacotes fechados?",
    turn_count: 3,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit[0].rule, "never_meta_question");
});

Deno.test("validator: pode ter múltiplas violações", () => {
  const v = runValidatorMinimal({
    response: "Vou passar pra Planner — ela cuida do preço de R$ 100k.",
    turn_count: 3,
  });
  assertEquals(v.decision, "REGEN");
  assertEquals(v.red_lines_hit.length >= 2, true);
});

Deno.test("validator: buildRegenHintBlock retorna XML estruturado", async () => {
  const { buildRegenHintBlock } = await import("../validator_minimal.ts");
  const v = runValidatorMinimal({
    response: "Vou passar pra Planner.",
    turn_count: 3,
  });
  const xml = buildRegenHintBlock(v);
  assertEquals(xml.includes("<previous_attempt_failed>"), true);
  assertEquals(xml.includes("<rule>never_transfer_explicit</rule>"), true);
  assertEquals(xml.includes("vou passar"), true);
});

Deno.test("validator: buildRegenHintBlock retorna vazio quando sem hits", async () => {
  const { buildRegenHintBlock } = await import("../validator_minimal.ts");
  const v = runValidatorMinimal({
    response: "Que legal!",
    turn_count: 2,
  });
  assertEquals(buildRegenHintBlock(v), "");
});
