# Plano — Tema Weddings no workspace inteiro

> Objetivo: quando a org ativa é **Welcome Weddings**, o CRM inteiro veste a marca
> champagne/dourada — com o mesmo nível de cuidado das telas já aprovadas
> (Casais/Convidados, editor da Sofia, Disparos). Não é "trocar cor da sidebar":
> é um tema coerente em 3 camadas.

## Norte visual (extraído das telas aprovadas)

Fonte: `CasaisAdminBoard.tsx`, `wsdr/editor/ui/primitives.tsx`, `docs/DESIGN_SYSTEM.md` §marca Weddings.

| Papel | Receita canônica |
|---|---|
| Fundo de página | `bg-ww-paper` (#FBF8F4 champagne) — nunca branco chapado nem slate-50 |
| Card/superfície | `bg-white border border-ww-sand rounded-xl/2xl shadow-ww-lift` |
| Eyebrow (kicker) | `text-[10px] font-semibold uppercase tracking-[0.22em] text-ww-gold` |
| Título de página | `font-ww-serif italic text-ww-n700` |
| Texto forte / secundário / mudo | `text-ww-n700` / `text-ww-n500` / `text-ww-n400` |
| Botão primário | `bg-ww-gold text-white hover:bg-ww-gold-ink rounded-md shadow-sm` |
| Input | `bg-white border-ww-sand-dk focus:ring-2 focus:ring-ww-gold/30 focus:border-ww-gold` |
| Chips/badges | fundos `*-soft` (gold-soft, rosewood-soft, olive-soft) + texto `*-ink` |
| Acentos secundários | rosewood (quente/alerta), olive (sucesso), blush/petal (detalhe) |
| Número/KPI | `tabular-nums text-ww-n700`, destaque em `text-ww-gold-ink` |
| Movimento | `ease-ww-soft`, transições específicas (nunca `all`), `active:scale-[0.97]` |

**Regra de contenção:** dourado é ACENTO (títulos-eyebrow, botão primário, ícones,
item ativo), não tinta de parede. A base é champagne + branco + neutros quentes (n400-n700).

## Arquitetura — 3 camadas

### Camada 1 — Fundação por CSS vars (alavanca global)
`primary`/`secondary` no `tailwind.config.js` deixam de ser hex fixos e passam a
`rgb(var(--brand-*) / <alpha-value>)`. `:root` define os valores Trips (azul atuais);
a classe **`.theme-ww`** (aplicada em `<html>` pelo `useOrgBranding` quando
`org.slug === 'welcome-weddings'`) redefine:

| Var | Trips (default) | Weddings |
|---|---|---|
| `--brand-primary` | `15 76 129` (#0f4c81) | `189 150 92` (ww-gold) |
| `--brand-primary-dark` | `10 58 95` | `163 127 71` (gold-ink) |
| `--brand-primary-light` | `224 231 255` | `234 225 211` (sand) |
| `--brand-secondary` | `0 196 204` (teal) | `135 75 82` (rosewood) |
| `--background` (shadcn) | branco | champagne `34 47% 97%` |
| `--ring` | azul escuro | dourado |

Efeito: todo `bg-primary`, `text-primary`, `hover:bg-primary`, focus rings e o fundo
base do app viram marca Weddings **sem tocar página por página**. Aplicar em `<html>`
(não num div) para alcançar modais/popovers que renderizam em portal.

### Camada 2 — Chrome global
- **Sidebar** (feita, polir): fundo `ww-cream`, borda `ww-sand`, item ativo
  `bg-ww-gold` branco; inativo `text-ww-n600` com ícone `text-ww-gold`
  (gold como acento, não como tinta de texto corrido).
- **OrgSwitcher** (feito): cartão branco com borda dourada no tom claro.
- Search modal, NotificationCenter, banners: herdam da Camada 1 (rings/botões).

### Camada 3 — Telas internas (por prioridade de uso Weddings)
Aplicar a receita canônica (fundo paper, header com eyebrow+serif, cards ww-sand):
1. **Pipeline/Kanban** — colunas, header, botão "novo card", badges de etapa
2. **CardDetail/CardHeader** — abas ativas, chips, botões de ação
3. **Dashboard/Leads** — KPI cards, tabelas
4. **Agenda, Configurações** — acentos e focus
Telas que JÁ vestem a marca (Convidados, SDR Sofia, Disparos, Pontuações): não tocar.

## Processo de qualidade (por tela da Camada 3)
1. Screenshot ANTES (desktop + 390px) via Playwright
2. Aplicar receita canônica
3. `/design-review` até nota ≥ 8 (máx 3 rodadas)
4. Print final em `docs/design-references/internal/`

## Fases de entrega
- **F1 (agora):** Camada 1 (vars) + polimento da sidebar → Vitor valida o "clima"
- **F2:** Pipeline + CardDetail com design-review
- **F3:** Dashboard, Leads, Agenda, Settings
- **F4:** varredura de resíduos (indigo/slate hardcoded em telas weddings-only)

## Riscos
- `text-primary` (gold sobre branco) tem contraste menor que o azul — usar gold-ink
  em textos pequenos quando aparecer ruim no review.
- Páginas com `bg-slate-50`/`bg-gray-50` hardcoded não pegam o champagne da
  Camada 1 — tratadas uma a uma na F3/F4.
