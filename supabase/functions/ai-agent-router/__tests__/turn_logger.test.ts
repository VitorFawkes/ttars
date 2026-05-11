// Testes do scrubPII e hashDiscoveryConfigSync.
// Run: deno test --allow-net <path>
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { scrubPII, hashDiscoveryConfigSync } from "../turn_logger.ts";

Deno.test("scrubPII: telefone brasileiro com 9 dígitos", () => {
  const text = "Manda mensagem pro 11 99876-5432 ok?";
  assertStringIncludes(scrubPII(text), "[PHONE]");
  assertEquals(scrubPII(text).includes("99876-5432"), false);
});

Deno.test("scrubPII: telefone com +55", () => {
  const text = "+55 11 98765-4321 é o número";
  assertStringIncludes(scrubPII(text), "[PHONE]");
});

Deno.test("scrubPII: telefone DDD entre parênteses", () => {
  const text = "Ligou de (11) 98765-4321 hoje";
  assertStringIncludes(scrubPII(text), "[PHONE]");
});

Deno.test("scrubPII: email", () => {
  const text = "Meu email é vitor.gambetti@example.com";
  assertEquals(scrubPII(text), "Meu email é [EMAIL]");
});

Deno.test("scrubPII: CPF formato 123.456.789-00", () => {
  const text = "CPF 123.456.789-00 confere?";
  assertEquals(scrubPII(text), "CPF [CPF] confere?");
});

Deno.test("scrubPII: CPF formato 12345678900", () => {
  const text = "CPF 12345678900";
  assertEquals(scrubPII(text), "CPF [CPF]");
});

Deno.test("scrubPII: nomes não são scrubbed (trade-off consciente)", () => {
  const text = "O Vitor e a Mariana confirmaram";
  assertEquals(scrubPII(text), "O Vitor e a Mariana confirmaram");
});

Deno.test("scrubPII: string vazia", () => {
  assertEquals(scrubPII(""), "");
});

Deno.test("scrubPII: combinação de PII", () => {
  const text = "Vitor (CPF 123.456.789-00, tel +55 11 99876-5432, email a@b.com)";
  const result = scrubPII(text);
  assertStringIncludes(result, "[CPF]");
  assertStringIncludes(result, "[PHONE]");
  assertStringIncludes(result, "[EMAIL]");
  assertStringIncludes(result, "Vitor");
});

Deno.test("hashDiscoveryConfigSync: determinístico", () => {
  const config1 = { slots: [{ key: "a", goal: "x" }, { key: "b", goal: "y" }] };
  const config2 = { slots: [{ key: "a", goal: "x" }, { key: "b", goal: "y" }] };
  assertEquals(hashDiscoveryConfigSync(config1), hashDiscoveryConfigSync(config2));
});

Deno.test("hashDiscoveryConfigSync: muda quando config muda", () => {
  const config1 = { slots: [{ key: "a", goal: "x" }] };
  const config2 = { slots: [{ key: "a", goal: "y" }] };
  const h1 = hashDiscoveryConfigSync(config1);
  const h2 = hashDiscoveryConfigSync(config2);
  assertEquals(h1 === h2, false);
});

Deno.test("hashDiscoveryConfigSync: null e undefined dão mesmo hash", () => {
  assertEquals(hashDiscoveryConfigSync(null), hashDiscoveryConfigSync(undefined));
});
