---
name: welcomecrm-entities
description: Conhecimento sobre as entidades core do WelcomeCRM (cards, contatos, profiles, pipeline)
---

# Entidades WelcomeCRM

Ler @.agent/CODEBASE.md para inventário completo de tabelas, hooks, páginas e componentes.

## 3 Suns (Entidades Centrais)
- `cards` — Representam oportunidades/deals no pipeline
- `contatos` — Pessoas vinculadas aos cards
- `profiles` — Usuários do sistema (consultores)

Toda tabela nova DEVE ter FK para pelo menos uma dessas 3 entidades.

## Pipeline
- `pipeline_stages` — Estágios do funil (Kanban)
- Cards se movem entre stages via drag-and-drop
- Cada card pertence a um pipeline_stage

## Modular Section System
- Campos dos cards são definidos por `field_config` (JSON)
- Seções são modulares e reutilizáveis
- Hooks de seção: `useFieldConfig`, `useSectionData`
