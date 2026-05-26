# Cenário 6 — João Ideal

**Perfil:** 34 anos, alta intenção, R$ 300k pra 50 convidados em Trancoso (R$ 6k/conv). Já decidido, quer reunião essa semana, indicação.

**O que testa:** detecção de alta intenção, qualificação rápida, 3 horários binários, fechamento sem fricção, ativação de tools (`calculate_qualification_score` + `check_calendar`).

---

## T1
**LEAD:** Olá! Sou o João. Estou organizando meu casamento — 50 convidados, próximo ano em Trancoso, orçamento 300 mil. Indicação da minha amiga Bia. Quero marcar uma reunião com a Wedding Planner essa semana.

**PATRÍCIA** (desfecho_qualificado, pass) + tools `calculate_qualification_score`, `check_calendar`:
> Oi, João, tudo bem? Obrigada por já trazer o cenário.
>
> Trancoso, 50 convidados e orçamento de 300 mil já dão uma boa base pra avançar pra uma conversa com a Ana Carolina Kuss, nossa Wedding Planner.
>
> Vou checar os horários desta semana na agenda dela e te falo em seguida com as opções.

✅ **Tools dormentes ATIVADAS:** `calculate_qualification_score` + `check_calendar` (correção T3.5 + descrições enriquecidas funcionando).
✅ Reconheceu cenário completo, qualificou.
⚠️ Mensagem prometeu voltar — não acionou `confirm_meeting_slot` direto (vai no T2).

---

## T2
**LEAD:** ok aguardo

**PATRÍCIA** (desfecho_qualificado, ⚠️ rewrite):
> Obrigada por aguardar, João. O próximo passo é uma reunião de vocês dois com a nossa Wedding Planner. Ela conhece os fornecedores, vai entender o projeto de vocês a fundo, mostrar exemplos reais de casamentos parecidos e passar as principais referências de valores. Vocês podem *qua 27/05* às *09:00*, *qui 28/05* às *09:00* ou *sex 29/05* às *09:00*?

✅ Cumpriu promessa (mandou os horários no turno seguinte).
✅ 3 horários binários.

---

## T3
**LEAD:** quarta às 9 está perfeito. meu email é joao.silva@gmail.com

**PATRÍCIA** (desfecho_qualificado, pass) + tool `confirm_meeting_slot`:
> Perfeito, João. Fica marcado para *qua 27/05* às *09:00* com a Ana Carolina. Obrigada por mandar o email.

✅ Confirmação curta para perfil alta intenção (sem floreio).
✅ Tool chamada corretamente.

---

## Veredicto João
| Critério | Status |
|---|---|
| Detecção de alta intenção | ✅ |
| Tools ativadas (qualif + calendar + confirm) | ✅ |
| 3 horários | ✅ |
| Fechou em 3 turnos | ✅ |
| Confirmação curta para perfil ideal | ✅ |
| Validator | ⚠️ 1 rewrite por slots_3_distintos (mesmo da Lorena) |
| Loop fatal | ✅ ZERO |

**Veredito: PASSOU** — perfil ideal atendido com fluxo natural. **Marco importante:** as tools `calculate_qualification_score` e `check_calendar` (que estavam dormentes) foram ativadas pela LLM no T1 — confirmando que as descrições enriquecidas (T3.6) funcionaram.
