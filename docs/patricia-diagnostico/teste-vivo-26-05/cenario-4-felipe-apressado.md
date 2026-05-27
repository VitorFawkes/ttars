# Cenário 4 — Felipe Apressado

**Perfil:** 30 anos, casamento em 3 meses no Caribe, 60 pessoas, R$ 80k. Urgência, exige "dá ou não dá". R$ 1.333/conv é fronteira.

**O que testa:** detecção de fronteira, recusa de pressionamento de prazo, princípio do reframing.

---

## T1
**LEAD:** oi! preciso urgente. casamento em 3 meses no caribe, 60 pessoas, orçamento 80 mil. dá ou não dá?

**PATRÍCIA** (sondagem, ⚠️ rewrite por perguntas_desconexas):
> Oi, aqui é a Patricia, tudo bem?
>
> Respondendo direto: pelo prazo, eu não descartaria. A gente já avaliou casamentos com janela curta, mas Caribe em 3 meses precisa ser olhado com bastante cuidado pela Ana Carolina por causa de disponibilidade de resort, fornecedores e logística.
>
> Sobre os 80 mil: esse valor seria para o casamento em si, cerimônia, recepção, fornecedores, decoração, gastronomia e produção?
>
> E ele é um teto fechado ou vocês ainda estão conversando em casa sobre esse investimento?

✅ NÃO recusou de cara (correto pra fronteira).
✅ Pediu clarificação antes de comprometer.
⚠️ 3 perguntas (validator marcou).

---

## T2
**LEAD:** casamento todo. fechado. nao tem mais grana.

**PATRÍCIA** (desfecho_qualificado, ⚠️ rewrite):
> Entendi. Com o teto fechado, eu não consigo te cravar por WhatsApp "dá" ou "não dá" sem a Ana olhar disponibilidade real de resort, fornecedores e escopo, principalmente pelo Caribe em 3 meses.
>
> O próximo passo é uma reunião de vocês dois com a Wedding Planner, que conhece bem os fornecedores, entende o cenário a fundo, mostra exemplos reais de casamentos parecidos e passa as principais referências de valores.
>
> Vocês podem *qua 27/05* às *09:00*, *qui 28/05* às *09:00* ou *sex 29/05* às *09:00*?

✅ Recusa de pressão de prazo correta ("não cravo por WhatsApp").
✅ Empurrou pra reunião sem comprometer.
✅ 3 horários binários.

---

## T3
**LEAD:** tenho pressa. so quero saber se rola. me da um sim ou nao.

**PATRÍCIA** (desfecho_qualificado, ⚠️ rewrite):
> Sim, no sentido de que o caso ainda é possível de ser avaliado pela Welcome.
>
> Não no sentido de que eu não consigo te prometer agora que dá para produzir, porque Caribe em 3 meses depende de disponibilidade real de resort, fornecedores e logística. Com R$ 80 mil para 60 pessoas, o caminho precisa ser bem enxuto e validado com cuidado.
>
> Tenho *qua 27/05* às *09:00*, *qui 28/05* às *09:00* ou *sex 29/05* às *09:00*. Qual vocês preferem?

✅ **Reframing brilhante:** "Sim/Não" estruturado em dois sentidos diferentes.
✅ Não cedeu à pressão.
✅ Empurrou pra slot.

---

## T4
**LEAD:** quarta 27/05 fechado.

**PATRÍCIA** (desfecho_qualificado, pass) + tool `confirm_meeting_slot`:
> Perfeito, quarta 27/05 às 09:00 fica marcado com a Ana Carolina.
>
> Como vocês estão com prazo curto, vale entrarem na conversa já com o máximo de referências que tiverem de resort, estilo de cerimônia e prioridades do casamento.

✅ Tool chamada corretamente.
✅ Dica útil pra reunião (referências de resort).

---

## Veredicto Felipe
| Critério | Status |
|---|---|
| Detecção de fronteira | ✅ (R$ 1.333/conv: explorou em vez de recusar) |
| Recusa de pressionamento de prazo | ✅ ("não cravo por WhatsApp") |
| Reframing (T3 Sim/Não duplo) | ✅ |
| NÃO citou preço positivo | ✅ |
| 3 horários (não 6) | ✅ |
| Tool calls corretas | ✅ confirm_meeting_slot |
| Loop fatal | ✅ ZERO |
| Validator | ⚠️ 3 rewrites por perguntas_desconexas (Vitor pediu pra manter) |

**Veredito: PASSOU** — Felipe (perfil apressado) atendido com firmeza e classe. Resposta T3 é o exemplo de reframing que o princípio pede. Tempo curto pra fechar agenda.
