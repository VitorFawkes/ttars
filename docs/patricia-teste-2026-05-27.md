# Patricia — Teste end-to-end 2026-05-27

7 cenários reais executados via API direta no router-v2 (`ai-agent-router-v2` v131), simulando conversas WhatsApp pelo número 5511964293533 (whitelist). Patricia foi ativada temporariamente (`ativa=true`) e desativada ao fim. Cada cenário rodou 4-10 turns com mensagens orgânicas, não scripts repetitivos.

---

## ✅ O QUE FUNCIONOU PERFEITAMENTE

### Cenário 1 — Abertura → Sondagem → Slots (Marina, Trancoso, R$ 400k/50conv)
- Abertura literal nos 2 blocos (bloco 1: "Oi, aqui é a Patricia" + bloco 2: pitch curto)
- Validator pegou eco faltando ("tudo bem?") e RESCREVEU adicionando — ✓
- Princípio 9: contexto antes de pedir orçamento (explicou "investimento é casamento em si, hospedagem é separado")
- Eco-vocabular sutil ("pé na areia", "intimista") apareceu naturalmente
- Card `produto_data` gravou TODOS os 5 campos normalizados: `ww_destino: Nordeste`, `ww_data_casamento: 2027-07`, `ww_num_convidados: 50` (não 80 — entendeu que 50 vão de fato), `ww_orcamento_faixa: 400000`, `ww_sdr_visao_casamento`
- Detectou `desfecho_qualificado` automaticamente após 4 críticos + opcionais coletados
- Apresentou ranges contínuos de horário formato WhatsApp bold (`*qui 28/05* das *09:00* às *12:00*`)

### Cenário 2 — Lead pergunta preço direto (Camila)
- Abertura + responde a pergunta (Princípio 10) + faixa de honorário R$ 4-18k (Princípio 12) + separação honorário vs custo + pergunta clarificadora (Princípio 11)
- Validator REwriteou emoji inicial — ✓
- **Bloco `<custo_referencia_destino>` USADO corretamente** depois da fix da validator rule: Patricia citou ranges por região com disclaimer ("a partir de", "não inclui hospedagem", etc.)

### Cenário 3 — Lead inviável < R$ 800/conv (Júlia, 20k/30conv)
- 20k ÷ 30 = R$ 666/conv → abaixo do mínimo
- Detectou `desfecho_nao_qualificado` automaticamente
- Aplicou o **few-shot novo seedado**: "Prefiro te falar isso com transparência agora" + posicionamento como diferença de range + "quando o escopo evoluir, a gente volta a conversar"
- Sem brecha "talvez", sem promessa de material

### Cenário 4 — Lead premium qualificada com sinais silenciosos (Bia, Caribe, R$ 450k/100conv)
- Eco-vocabular forte: "voltar pro Caribe com todo mundo junto" (Princípio 8 nuance)
- **Silent signals AMBOS detectados e gravados no card sem comentar na conversa:**
  - `ww_sdr_perfil_viagem_internacional: true` (mencionou viagem Caribe ano passado)
  - `ww_sdr_ajuda_familia: true` (mencionou mãe ajudando)
- Aplicou **few-shot novo seedado de família**: "Que presente lindo. Isso abre bastante possibilidade" (frase EXATA do exemplo)
- Tratou lua de mel com a **frase obrigatória** do bloco lua_de_mel: "Da lua de mel cuida nosso time de Travel Planner da Welcome Trips" + voltou pro tópico de reunião (padrão PLAY: interrompe FLOW, volta)

### Cenário 5 — "Preciso pensar" (Larissa, Mendoza/Portugal)
- Detectou `objecao_preciso_pensar`
- Aplicou **few-shot novo seedado**: "Claro, conversem com calma" + pergunta investigativa de 3 eixos ("destino, tamanho ou investimento?")
- Sem terapeutar, sem insistir

### Cenário 6 — Destino fora catálogo (Helena, Vietnã fechado)
- Detectou `destino_fora_catalogo`
- Ecoou pergunta social ("tudo bem sim, e com você?") após validator REwrite
- Recusa honesta com **frase do exemplo curado**: "Vocês conhecem esse lugar melhor que a gente nesse caso"
- Sem promessa de material, sem inventar capacidade

### Cenário 7 — Contradição + reformulação (Renata, frio→Bahia→reformula Mendoza)
- Turn 2: detectou contradição "frio + Bahia/Porto de Galinhas" → devolveu os dois polos com pergunta aberta (Princípio 4)
- Turn 3: lead reformulou na mesma mensagem ("esquece Bahia, queremos frio, Mendoza")
- **Patricia aplicou a nuance NOVA do princípio 4** (EXCEÇÃO): NÃO reabriu a contradição, aceitou versão final e seguiu — funcionou ✓

---

## ⚠️ BUGS ENCONTRADOS (precisam fix)

### 🔴 BUG #1 — `confirm_meeting_slot` NUNCA é chamado (CRÍTICO)

**Reproduz em:** Cenário 1, Cenário 4 (e qualquer agendamento)

**Sintoma:** Patricia diz "Combinado, sexta 29/05 às 11:00 com a Ana Carolina" mas a tool `confirm_meeting_slot` NÃO é chamada. Tabela `reunioes` fica vazia. A reunião **não entra na agenda real** da Ana Carolina.

**Evidência:** `context_used.tool_calls = None` em todos os turns onde Patricia confirma horário.

**Causa provável:** GPT-5.5 está omitindo o campo `tool_calls` do output JSON quando a regra do prompt diz "SEMPRE chame esta tool quando combinar horário". Pode ser:
- Schema do output_format não está sendo validado em runtime
- Modelo está confundindo "confirmação verbal" com "agendamento real"
- O moment `desfecho_qualificado` não tem o tool call estruturado como obrigatório

**Impacto:** ALTO. Patricia "marca reunião" mas não marca de verdade. Lead AB chega no horário e Ana Carolina não tem na agenda.

**Fix sugerido:** revisar o prompt do `desfecho_qualificado` pra deixar a tool call OBRIGATÓRIA + adicionar validação no router que rejeita "Combinado/Marcado" sem tool call associado no mesmo turn.

---

### 🔴 BUG #2 — `self_analysis` SEMPRE vazio (MÉDIO-ALTO)

**Reproduz em:** TODOS os cenários.

**Sintoma:** Schema do output_format declara `self_analysis: { contradicao_detectada, pitch_saturado_self, pitch_count_recent, inviabilidade_calc, valor_por_convidado_brl, pendencia_resolver, sinais_defensivos_lead, pergunta_lead_nao_respondida, lead_intent }`. Mas em runtime `context_used.self_analysis = None`.

**Causa provável:** GPT-5.5 está ignorando o campo do schema. Pode ser:
- O schema de tool_use no OpenAI SDK não declarou o campo formalmente (só está no prompt como texto)
- O modelo está dropando porque o JSON parser não retornou ele
- O `single_agent.ts` está fazendo `parse` e dropando campos extras

**Impacto:** MÉDIO-ALTO. O validator e o router perdem sinais importantes:
- `lead_intent: pronto_pra_fechar` é usado pelo fix 1.3 da `turn_policy` — sem ele o sistema não early-exit do bloco 2 da abertura
- `contradicao_detectada` é usado pelo fix 1.4 — sem ele a contradição não vira instrução obrigatória no turn seguinte
- `pitch_saturado_self` deveria parar pitch repetido

**Fix sugerido:** investigar `single_agent.ts` — provavelmente o JSON schema do OpenAI tool_use precisa declarar `self_analysis` como propriedade. O texto do prompt sozinho não força.

---

### 🟡 BUG #3 — `validator rule "nao_inventar_dados" bloqueia uso do <custo_referencia_destino>` (CORRIGIDO durante o teste)

**Reproduz em:** Cenário 2 turn 3 (lead pediu ordem de grandeza)

**Sintoma:** Patricia gerou resposta perfeita usando o bloco `<custo_referencia_destino>` (Caribe USD 5k, Nordeste R$ 100k, etc) com disclaimer correto. Validator bloqueou com violação `nao_inventar_dados`.

**Fix aplicado:** atualizei a `condition` da rule pra reconhecer ranges do bloco como fonte legítima:
```
- A afirmação são RANGES POR REGIÃO presentes no bloco <custo_referencia_destino> 
  do prompt (Caribe USD 5k-17k, Nordeste R$ 40k-200k, Mendoza USD 15k-52k, 
  Europa EUR 18k-120k). Patricia tem esses números na cabeça como SDR humano 
  premium da Welcome.
```
Testei novamente após fix — agora passa ✅.

---

### 🟡 BUG #4 — Validator `zero_meta_linguagem` pega o anchor literal da abertura (BAIXO)

**Reproduz em:** Toda abertura.

**Sintoma:** Patricia copia palavra-por-palavra o bloco 2 da abertura ("A ideia aqui é uma conversa rápida para eu entender..."). Validator detecta como meta-linguagem e marca como violação. O rewrite mantém o texto mas registra violação.

**Impacto:** BAIXO (rewrite preserva o texto). Mas polui o log com violations falso-positivas e pode em algum caso o validator decidir block.

**Fix sugerido:** a regra `zero_meta_linguagem` deveria reconhecer texto literal do anchor `abertura` como exceção. Ou o anchor do bloco 2 da abertura deveria ser reescrito sem soar meta ("A gente vai conversar rápido pra...").

---

### 🟡 BUG #5 — Validator `nao_prometer_voltar_sem_handoff` falso-positivo em "vou alinhar horários" (BAIXO)

**Reproduz em:** Cenário 4 turn 4.

**Sintoma:** Patricia disse "Vou alinhar os melhores horários pra conversa com a Ana Carolina e te mando as opções na sequência". Validator bloqueou. Mas no contexto, era para Patricia disparar o desfecho_qualificado e apresentar slots (o router não disparou o forced moment).

**Causa raiz:** o router deveria ter disparado `forced_moment_key=desfecho_qualificado` quando todos os 4 críticos + sinais positivos estavam coletados. Não disparou, Patricia improvisou "vou alinhar horários" e o validator bloqueou corretamente — mas o problema é o ROUTER não disparar o trigger determinístico.

**Fix sugerido:** revisar lógica de `forced_moment_key` em `ai-agent-router-v2/index.ts` — quando ww_orcamento_faixa + ww_num_convidados + score positivo + sinais bons, force `desfecho_qualificado` no próximo turn.

---

## 📊 RESUMO QUANTITATIVO

| Cenário | Turns | Moments detectados | Validator interventions | Card form_data correto | Tool calls esperadas | Tool calls feitas |
|---|---|---|---|---|---|---|
| 1 Marina | 10 | abertura → sondagem → desfecho_qualificado | rewrite x2, block 0 | ✅ 5/5 | 1 (confirm_meeting_slot) | ❌ 0 |
| 2 Camila | 4 | abertura → objecao_preco → sondagem | rewrite x2, block 1→fix | ✅ 3/3 | 0 | 0 |
| 3 Júlia | 4 | abertura → sondagem → desfecho_nao_qualificado | rewrite x3, block 0 | ✅ 5/5 | 0 | 0 |
| 4 Bia | 7 | abertura → sondagem → lua_de_mel → desfecho_qualificado | rewrite x3, block 1 | ✅ 6/6 (silent signals incluídos) | 1 (confirm_meeting_slot) | ❌ 0 |
| 5 Larissa | 3 | abertura → sondagem → objecao_preciso_pensar | rewrite x1, block 0 | ✅ 2/2 | 0 | 0 |
| 6 Helena | 1 | destino_fora_catalogo | rewrite x1, block 0 | ✅ 2/2 | 0 | 0 |
| 7 Renata | 3 | abertura → sondagem (contradição) → sondagem (reformulação) | rewrite x1, block 0 | ✅ 2/2 | 0 | 0 |

**Latência média por turn:** ~30 segundos (16-43s range). Modelo gpt-5.5.

---

## 🎯 CONCLUSÃO

**O prompt está MUITO bom.** Os princípios 4, 8, 9, 10 funcionam organicamente, os few-shots novos foram aplicados perfeitamente nos cenários sem precisar de ajuste, o bloco `<custo_referencia_destino>` entrega exatamente o que foi projetado, o card_patch normaliza dados certo, e os silent signals são detectados sem comentário.

**Mas 2 bugs reais bloqueiam ativação em produção:**
1. **`confirm_meeting_slot` nunca chamada** → reunião não vai pra agenda real. Crítico.
2. **`self_analysis` sempre vazio** → fixes 1.3 e 1.4 do turn_policy ficam inoperantes; validator perde sinais.

Recomendo NÃO ativar Patricia em prod até esses dois bugs serem investigados e corrigidos no `single_agent.ts` ou nos schemas OpenAI tool_use.

**Patricia foi desativada ao final do teste** (`ai_agents.ativa = false` + `ai_agent_phone_line_config.ativa = false`).

---

## Logs salvos
- `/tmp/c1.log` a `/tmp/c7.log` — transcrição completa de cada cenário
- Helper script: `/tmp/patricia_test.sh`
- Validator rule atualizada em prod: `nao_inventar_dados` (campo `condition` expandido pra reconhecer `<custo_referencia_destino>`)
