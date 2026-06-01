# Sofia × Camila — os trilhos (o que é editável vs. o que é a inteligência fixa)

> Documento de referência pra alinhar, antes de qualquer mudança, **o que pode virar editável** na tela da Sofia e **o que é a inteligência da Camila e fica intacta**. Fonte: `scripts/create-n8n-sdr-weddings.js` (o cérebro da Sofia).

## A ideia em uma frase

O cérebro da Sofia é o **molde de raciocínio da Camila** escrito em blocos (tags XML). Alguns blocos são **o que ela diz/sabe** (conteúdo — vem da config que você edita). Outros são **como ela pensa** (raciocínio — a inteligência da Camila, fica fixa). O projeto inteiro mexe só nos primeiros.

---

## Bloco A — CONTEÚDO (o QUE ela diz/sabe) → editável, seguro

Estes blocos já são preenchidos pela tela (tabela `wsdr_agent_config`, via o nó `Monta`). Editar = trocar texto/listas. **Zero risco pra inteligência.**

| Bloco no cérebro | O que controla | Onde edita hoje |
|---|---|---|
| `<papel>` | persona, empresa, proposta, tom | aba "Quem é a Sofia" |
| `<fluxo_de_fases>` | as fases da conversa (a ordem) | aba "Como ela conversa" → Fases |
| `<o_que_entender>` | o que descobrir do casal | critérios de qualificação |
| `<politica_preco>` | falar de valor, assessoria, faixas por destino | aba "Preço e valores" |
| `<glossario>` | palavras a usar / evitar | aba "Quem é a Sofia" → Glossário |
| `<comportamentos_proibidos>` | "o que ela nunca faz" (lista livre) | aba "Regras e limites" |
| `<momentos>` | reações a situações (preço, família…) | aba "Como ela conversa" → Momentos |
| `<primeira_mensagem>` | a abertura | aba "Como ela conversa" → Abertura |

**Tudo no Bloco A pode crescer e virar totalmente editável** (é o que o redesenho faz).

---

## Bloco B — RACIOCÍNIO (COMO ela pensa) → a inteligência da Camila, FIXA

Estes blocos **não viram editáveis**. São o "molde de raciocínio" que faz a Sofia soar como a Camila. É exatamente o que você pediu pra não tocar.

| Bloco no cérebro | O que é | Por que fica fixo |
|---|---|---|
| `<matriz_de_decisao>` | o próximo passo silencioso (o que perguntar agora) | é o coração do raciocínio |
| `<spin_framework>` | SPIN como **lente**, não roteiro | jeito de conduzir, não conteúdo |
| `<gates_do_convite>` | quando convidar a Planner | lógica de decisão |
| `<convite_e_agenda>` | handoff invisível, não inventar horário | método, não texto |
| `<antipadroes>` | o que evitar sempre (empilhar perguntas, etc.) | qualidade do raciocínio |
| `<autochecagem>` | a conferência antes de enviar | controle de qualidade |
| `<formato>` | devolver só a fala do WhatsApp | proteção de saída |

---

## A zona cinzenta (e como tratamos pra "controle total")

Algumas **regras** hoje estão hardcoded no texto fixo ou dentro de blocos de raciocínio. Pra você ter "controle total" de verdade, elas saem do texto fixo e viram **toggles** que reescrevem **só o trecho de conteúdo** — sem tocar na lógica de decisão:

- **"Zero travessão"** — tem até um passo automático (`Limpa Travessao`) que troca traço por vírgula sempre. Vira toggle real (desligar = o passo automático para também).
- **"Nunca dar preço fechado"** — vira toggle (você manda; já existe a aba Preço pra falar de valor).
- **"Nunca inventar data"** — vira toggle (mexe só no trecho do convite, não na lógica).
- **"Orçamento antes de convidar"** — vira toggle (mexe só no texto dos gates, não na matriz de decisão).
- **"Zero clichê"** — vira toggle.

Cada um, ao ser desligado, mostra um **aviso** ("desligar reduz a qualidade") — mas a decisão é sua.

---

## Pontuação — o ponto mais delicado

A Sofia **não soma pontos como planilha**. O passo "Qualificador" é um **julgamento de IA**: ela lê os critérios e dá uma nota 0–100 + faixa (quente/morno/frio), usada como **sugestão**. (No cérebro: *"score é JULGAMENTO, não soma mecânica de pesos".*)

Por isso, dar a você "pontuação de cada coisa + nota geral" = **adicionar os controles** (pontos por item, nota mínima, faixas, desqualificadores, bônus) e **alimentar esse julgamento** + aplicar a nota mínima de forma determinística. **Não** vira calculadora — isso mudaria a inteligência. Fica de fora (mudaria o cérebro): grupos "é-um-ou-outro", condições por campo do CRM, ramificações — são especificidades da Patricia.

---

## Regra de ouro do projeto

> Controle total sobre **o que ela faz e diz** (Bloco A + regras). A forma de **pensar** (Bloco B) é a inteligência da Camila e fica intacta.
