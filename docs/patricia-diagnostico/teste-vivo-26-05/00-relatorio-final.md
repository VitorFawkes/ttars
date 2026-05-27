# Teste vivo Patrícia — 26/05/2026

Patrícia foi ativada em modo whitelist (telefone +55 11 96429-3533) e testada em 6 cenários distintos cobrindo o espectro comportamental que a operação enfrenta.

**Estado final:** Patrícia desativada (`ativa=false`), debounce restaurado para 30s, conversas de teste arquivadas.

---

## Sumário por cenário

| # | Cenário | Turnos | Resultado | Validator block | Loop fatal |
|---|---------|--------|-----------|-----------------|------------|
| 1 | Lorena Premium AB (Europa, R$ 250k) | 7 | ✅ Fechou reunião | 0 | ZERO |
| 2 | Bruno Comparador (R$ 8k inviável) | 5 | ✅ Recusa firme | 0 | ZERO |
| 3 | Marina Indecisa (chute R$ 50k) | 12 | ⚠️ Recusou→destravou | 0 | ZERO |
| 4 | Felipe Apressado (3 meses Caribe) | 4 | ✅ Reframing + reunião | 0 | ZERO |
| 5 | Carla Cética (provocação + handoff) | 6 | ✅ Handoff acionado | 1 (esperado) | ZERO |
| 6 | João Ideal (R$ 300k Trancoso) | 3 | ✅ Fechou reunião | 0 | ZERO |

**Total: 37 turnos, 4 reuniões marcadas, 1 handoff humano, 2 recusas firmes corretas, 0 loops fatais.**

---

## Critérios técnicos — passa/falha

| Critério | Resultado |
|----------|-----------|
| Zero loop fatal | ✅ 6/6 cenários |
| Zero menção de IA/robô | ✅ (Carla T1 bloqueada por validator) |
| Zero preço positivo do casamento | ✅ |
| Recusa correta em Bruno e Carla | ✅ |
| Detecção fronteira em Felipe | ✅ |
| Qualificação correta em Lorena, João | ✅ |
| Tools ativadas (`calculate_qualification_score`, `check_calendar`, `confirm_meeting_slot`, `request_handoff`) | ✅ |
| Handoff usa texto da UI (não LLM) | ✅ (Fix 1 confirmado) |
| 3 horários (não 6) | ✅ |
| Card pausado pós-handoff | ✅ |
| Tokens persistidos (input/output) | ✅ (T5.1 confirmado) |

---

## O que precisa ajustar (ordem de prioridade)

### P1 — Validator com falsos positivos
- **`zero_travessoes`** em Lorena T5: marcou hífen onde não tinha. Investigar regra.
- **`slots_3_distintos`** em Lorena T5 + João T2: formato "qua 27/05 às 09:00" diferente do esperado. Padronizar formato ou afrouxar regra.
- **`perguntas_desconexas`** em Marina T4: 1 pergunta só, marcou 2 (falso positivo). Mas Vitor pediu não mexer nessa regra.

### P2 — Respostas longas demais
Princípio "objeção de preço: máximo 3 linhas + 1 pergunta" não está sendo seguido.
- Bruno T1, T2, T3: 3-4 parágrafos cada
- Carla T4, T5: 3 parágrafos
- Marina T7: 4 parágrafos
**Ação:** reforçar princípio com exemplo + limite de tokens no schema?

### P3 — Marina T11 — viabilidade de fronteira em lead exploratório
Patrícia recusou reunião (Europa 30 pessoas R$ 50k) quando lead estava em modo "chute". Em T12 destravou quando viu sinal positivo (pai vai conversar). Discussão: para leads exploratórios, aceitar reunião mesmo com chute? Ou manter critério rígido?

### P4 — Bloco 2 da abertura (Marina T2)
Bloco 2 é literal por desenho — não espelha tom emocional. Marina disse "💕 sonhando fugir do óbvio" e recebeu resposta institucional. Vitor pediu pra não mexer no bloco 2 (mas vale registrar a tensão).

---

## Ferramentas ativadas

Antes do recovery, 6 das 8 tools estavam dormentes. No teste:
- ✅ `calculate_qualification_score` — chamada em João T1
- ✅ `check_calendar` — chamada em João T1
- ✅ `confirm_meeting_slot` — chamada em Lorena T6/T7, Felipe T4, João T3
- ✅ `request_handoff` — chamada em Carla T6
- ⚠️ `search_knowledge_base` — NÃO chamada (base ainda vazia — T3.1 pendente)
- ⚠️ `update_contact` — NÃO chamada (não houve necessidade)
- ⚠️ `assign_tag` — NÃO chamada
- ⚠️ `create_task` — NÃO chamada

---

## Performance

| Métrica | Valor médio |
|---------|-------------|
| Latência (LLM apenas) | 17s |
| Input tokens / turno | ~18.500 |
| Output tokens / turno | ~700 |
| Prompt chars (cortado) | ~63KB |

⚠️ Latência continua alta (alvo era 8s). Caminho longo: separar cérebro em 2 (Sessão 3 do plano) para baixar input em validator e voice.

---

## Veredito geral

A Patrícia está **operacional para perfil premium classe AB** com qualidade conversacional ~9/10. As correções aplicadas no plano de recuperação (T1/T2/T3/T4/T5/T6) cumpriram o objetivo:

1. **Loop fatal eliminado** — zero ocorrências em 37 turnos cobrindo provocação, handoff e block.
2. **Handoff funcionando** — texto da UI sendo respeitado, card pausado.
3. **Tools ativadas** — 4 das 8 confirmadas em uso real.
4. **Recusas firmes corretas** — Bruno e Carla recusadas sem dramaturgia.
5. **Reframing** — Felipe T3 é exemplo do princípio em ação.

**Ressalvas para ativar com leads reais:**
- Validator com falsos positivos pode bloquear ou reescrever respostas válidas (não impactou conteúdo final no teste, mas vale monitorar).
- Respostas em objeção de preço estão longas (princípio "3 linhas + 1 pergunta" não está sendo seguido).
- Base de conhecimento ainda vazia (`search_knowledge_base` nunca acionada).
- Marina T11 sugere afrouxar critério de viabilidade para leads exploratórios.

**Pronta pra ativar com leads reais? SIM, com monitoria nos primeiros dias para confirmar comportamento em cenários reais e ajustar falsos positivos do validator.**
