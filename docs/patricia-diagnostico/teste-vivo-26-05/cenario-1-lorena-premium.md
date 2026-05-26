# Cenário 1 — Lorena Premium AB

**Perfil:** SP, classe AB. Casamento intimista na Europa, 80 convidados, R$ 250k, maio/junho 2027. Tom elegante.

**O que testa:** tom de par, espelhamento, ancoragem, qualificação positiva, fechamento de agenda.

---

## T1
**LEAD:** Oi! Vim pelo Instagram de vocês. Estou pesquisando produtoras para o meu casamento — pensando em algo na Europa, intimista.

**PATRÍCIA** (sondagem, validator=pass, 17.3s, 18024→779):
> Oi, Felipe, aqui é a Patricia, tudo bem?
>
> Intimista na Europa já me dá uma boa imagem do que vocês estão buscando.
>
> Vocês já têm uma ideia de quando? Pode ser um mês, vários meses, um semestre, o que vier à cabeça.

⚠️ Chamou "Felipe" (contato do teste anterior — ruído de estado, não da Patrícia).
✅ Mirroring: "intimista" / Sem institucionalismo / Contexto antes da pergunta.

---

## T2
**LEAD:** Pensei em maio de 2027. Talvez junho. Por aí.

**PATRÍCIA** (sondagem, pass, 16.5s, 18105→580):
> Maio ou junho de 2027 dá um bom respiro pra desenhar tudo com calma.
>
> E nesse formato intimista, quantos convidados vocês imaginam que realmente iriam?

✅ Confirmou data (espelhamento), ancorou ("respiro"), pergunta solta com "intimista" repetido.

---

## T3
**LEAD:** 80 pessoas. Família e amigos próximos. Queremos algo elegante, mas não formal demais.

**PATRÍCIA** (sondagem, pass, ~16s, 18186→704):
> Elegante, sem ficar formal demais, combina bem com esse formato mais próximo de família e amigos.
>
> Na Europa, a gente desenha cada projeto do zero, sem pacote fechado, e o destino específico muda bastante fornecedores, logística e produção.
>
> Quanto vocês imaginam investir no casamento em si, considerando cerimônia, recepção, fornecedores, decoração, gastronomia e produção? Hospedagem e transporte dos convidados ficam separados dessa conta.

✅ Espelhou "elegante / sem formal demais / família e amigos".
✅ Ancorou ("sem pacote fechado", "destino muda fornecedores") ANTES de perguntar orçamento.
✅ Separou hospedagem do orçamento — esperado.

---

## T4
**LEAD:** Estamos pensando em torno de 250 mil reais.

**PATRÍCIA** (sondagem, pass, ~16s, 18297→839):
> Perfeito, Felipe. Com 80 convidados, esse norte já coloca a conversa em um caminho bem possível para um projeto desenhado do zero na Europa.
>
> Vocês já têm algum país ou cidade que puxa mais, ou ainda estão abertos dentro da Europa?

✅ Qualificação positiva sem citar número.
✅ Pergunta natural ("puxa mais"), 2 opções binárias.

---

## T5
**LEAD:** Estamos pensando em Itália. Talvez Toscana. Mas estamos abertos a sugestões.

**PATRÍCIA** (desfecho_qualificado, ⚠️ validator=rewrite, 19641→601):
> Boa, Felipe, deu pra entender bem o cenário: Itália, talvez Toscana, com esse clima intimista, elegante e sem formalidade excessiva.
>
> O próximo passo é uma reunião de vocês dois com a Ana Carolina, nossa Wedding Planner. Ela conhece os fornecedores, vai entender o projeto de vocês a fundo, mostrar exemplos reais de casamentos parecidos e passar as principais referências de valores.
>
> Vocês podem na quarta-feira, dia 27 de maio, às 09h00, na quinta-feira, dia 28 de maio, às 09h00, ou na sexta-feira, dia 29 de maio, às 09h00?

⚠️ **Validator marcou rewrite** com 2 violações:
- `zero_travessoes`: falso positivo (mensagem não tem traços, só "às" e vírgulas)
- `slots_3_distintos`: formato verboso de horários, diferente do template `<proposed_slots>` esperado

A `corrected_messages` retornou conteúdo igual — o validator pediu rewrite mas não conseguiu corrigir. O lead recebeu a versão original.

✅ 3 horários (não 6) — scheduling_config funcionando.
✅ Espelhamento triplo: "Itália, talvez Toscana, clima intimista, elegante e sem formalidade excessiva".
✅ Próximo passo claro + valor da reunião (vai mostrar exemplos reais e referências).

**TODO pós-teste:** investigar regra `zero_travessoes` (falsos positivos) e padronizar formato de slots.

---

## T6
**LEAD:** Quinta funciona perfeitamente.

**PATRÍCIA** (desfecho_qualificado, pass, 19773→772) + tool `confirm_meeting_slot`:
> Perfeito, Felipe. Quinta, 28/05, às 09:00 funciona.
>
> Qual e-mail vocês preferem usar para o convite da reunião?

✅ Confirmou slot via tool.
✅ Próxima ação clara (email).

---

## T7
**LEAD:** lorena.alves@gmail.com

**PATRÍCIA** (desfecho_qualificado, pass) + tool `confirm_meeting_slot`:
> Perfeito, Felipe. Reunião confirmada para *qui 28/05* às *09:00*, no e-mail lorena.alves@gmail.com.
>
> A Ana Carolina encontra vocês por vídeo nesse horário.

✅ Confirmação final + tom de par (Ana Carolina como ela, não acima).

---

## Veredicto Lorena
| Critério | Status |
|---|---|
| Tom de par / não gatekeeper | ✅ |
| Espelhamento vocabular | ✅ (intimista, elegante, sem formal demais, Toscana) |
| Ancoragem antes de pergunta crítica | ✅ |
| 3 horários (não 6) | ✅ |
| Qualificação positiva sem preço | ✅ |
| Tool calls corretas | ✅ confirm_meeting_slot ×2 |
| Latência média | 17s (média) — acima do alvo 8s |
| Loop fatal | ✅ ZERO |
| Validator falso positivo | ⚠️ T5 (zero_travessoes, slots_3_distintos) |
| Nome do lead | ❌ usou "Felipe" do estado anterior — corrigido daqui pra frente |

**Veredito: PASSOU COM RESSALVA** — qualidade conversacional está em ~9/10 para perfil premium. Único ponto real: validator marcou rewrite por falso positivo no T5 (não impactou o lead — mensagem foi enviada igual).
