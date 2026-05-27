# Prompt completo da Patrícia — capturado em 27/05/2026 15:00

**Modelo:** gpt-5.5
**Tamanho:** 71KB (~71.269 chars, ~18 mil tokens de input)
**Captura:** rodei 1 mensagem ("Oi") como teste no whatsapp do Vitor (5511964293533),
ativei debug temporário no edge function que persiste o `system` literal em
`ai_conversation_turns.context_used._debug_system_prompt`. Depois copiei daqui.

**Estado da conversa quando capturado:**
- Turno: 1 (primeiro contato)
- Contato: Vitor
- Card: [TESTE] Lead WhatsApp
- Card já vinha com dados pré-populados:
  - ww_destino: Nordeste
  - ww_data_casamento: 2028-07
  - ww_num_convidados: 100
  - ww_tipo_casamento: praia
  - ww_orcamento_faixa: 200000
  - ww_sdr_ajuda_familia: true
- Score já calculado: 40 (qualificado=true)
- Slots já buscados na agenda real da Ana Carolina: 18 horários disponíveis

## Estrutura (19 blocos XML na ordem)

1. `<identity>` (linhas 1-20) — quem é a Patrícia, missão, descrição da empresa
2. `<principles>` (22-106) — 13 princípios meta-cognitivos + modelo do negócio + dados-âncora
3. `<agent_schedule>` (108-116) — janelas reais da agenda
4. `<voice>` (118-154) — tom, regras de voz, frases proibidas
5. `<boundaries>` (156-180) — regras de marca + regras técnicas de conversa
6. `<data_update_rules>` (182-234) — como gravar dados no card_patch
7. `<context_rules>` (236-258) — diff cognitivo (5 auditorias internas por turno)
8. `<playbook>` (260-498) — 10 momentos (abertura, sondagem, objeções, desfechos, handoff)
9. `<listening>` (500-506) — 4 regras de escuta humana
10. `<conversation_state>` (508-531) — estado do turno (injetado pelo engine)
11. `<qualification_result>` (533-570) — score calculado pelo router
12. `<proposed_slots>` (572-580) — 18 horários reais da Ana Carolina
13. `<silent_signals>` (582-596) — 3 sinais registrados silenciosamente
14. `<qualification>` (598-632) — 15 regras de pontuação (referência)
15. `<examples>` (634-680) — 5 few-shots curados
16. `<turn_policy>` (682-710) — momento forçado pelo router neste turno
17. `<tools_available>` (712-726) — 6 ferramentas que a Patrícia pode chamar
18. `<self_analysis_protocol>` (728-761) — passo a passo de auto-auditoria
19. `<output_format>` (763-784) — schema JSON do output

---

## PROMPT LITERAL COMPLETO

O texto bruto está em [prompt-completo-2026-05-27.txt](./prompt-completo-2026-05-27.txt) (71KB, 784 linhas).

Para abrir num editor: `open docs/patricia-export/prompt-completo-2026-05-27.txt`

Ou cole o conteúdo de [prompt-completo-2026-05-27.txt](./prompt-completo-2026-05-27.txt) num ChatGPT/Claude pra inspecionar com lupa.
