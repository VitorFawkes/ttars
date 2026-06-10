---
name: Tema Weddings workspace-wide
description: Tema champagne/dourado aplicado ao workspace Weddings inteiro via CSS vars (.theme-ww). Plano em docs/plano-tema-weddings.md. F1 feita, F2-F4 pendentes.
type: project
---
**Status (2026-06-10):** F1 implementada na branch `feat/analytics-trips-faxina` (não commitada): tailwind `primary/secondary` viraram `rgb(var(--brand-*))`; `.theme-ww` em `<html>` (via `useOrgBranding`, gatilho `org.slug === 'welcome-weddings'`) remapeia marca p/ ww-gold/rosewood + `--background` champagne + ring/border dourados. Sidebar/OrgSwitcher com variante clara champagne (prop `tone`).

**Plano master:** `docs/plano-tema-weddings.md` — norte visual extraído de CasaisAdminBoard + wsdr/primitives + DESIGN_SYSTEM §ww. Regra de contenção: dourado é ACENTO, base é champagne+branco+neutros quentes (n400-n700).

**Design-review F1:** tela 6/10 (sidebar ok, conteúdo genérico). F2 P0: header Pipeline serifada itálica + remover/tematizar barras de fase azul/roxa do kanban. P1: cards `border-ww-sand shadow-ww-lift`, chips Grupo/Sub-cards/Avulsas na paleta ww, botão flutuante concierge indigo→gold. Prints: `docs/design-references/internal/ww-theme-f1-*.png`.

**Gotchas:** test@welcomecrm.test tem membership em Weddings (dá pra screenshotar trocando org); páginas com `bg-slate-50` hardcoded não pegam o champanhe da var `--background` (tratar em F3/F4); `text-primary` (gold) sobre branco tem contraste fraco em texto pequeno → usar gold-ink.
