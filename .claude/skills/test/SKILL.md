---
name: test
description: Teste exaustivo de código — build, tipos, lógica, estados, imports, edge cases
disable-model-invocation: true
---

Teste INCANSAVELMENTE todo o código da task atual. Você NÃO consegue abrir browser — foque no que PODE fazer:

## Fase 1 — Build e tipos (bloqueante)

1. `npm run lint` — zero erros
2. `npx tsc --noEmit` — zero erros de tipo
3. `npm run build` — build compila sem falhas

Se qualquer etapa falhar, CORRIJA e rode novamente até passar.

## Fase 2 — Análise de código (ler CADA arquivo modificado)

Identifique os arquivos da task via `git diff --name-only` e `git ls-files --others --exclude-standard`.

Para CADA arquivo modificado/criado, LEIA o código completo e verifique:

### Imports e dependências
- Imports não utilizados (ESLint pega, mas confira)
- Imports de arquivos que não existem
- Exports que mudaram de nome/assinatura e podem quebrar consumidores
- Grep por usages: quem importa o que foi modificado? Vai quebrar?

### Lógica e edge cases
- Variáveis que podem ser `null`/`undefined` sem tratamento
- Arrays que podem estar vazios — `.map()`, `.filter()`, `[0]` sem guard
- Async sem `try/catch` ou sem tratamento de erro
- Condicionais que não cobrem todos os casos
- Comparações com `==` em vez de `===`
- Estados de loading/error/empty tratados no componente

### React específico
- Hooks chamados condicionalmente (violação de regras de hooks)
- useEffect com dependências faltando ou sobrando
- Re-renders desnecessários (objetos/arrays criados inline como props)
- Keys de `.map()` usando index em vez de ID estável
- Event handlers que não previnem comportamento padrão quando devem

### Dados e Supabase
- Queries sem filtro de produto (isolamento TRIPS/WEDDING/CORP)
- `.single()` em query que pode retornar 0 ou N resultados
- Campos que existem no código mas podem não existir na tabela
- RLS: query usa `anon` key onde deveria usar `service_role`?

### Segurança
- Secrets hardcoded
- Inputs de usuário sem sanitização
- SQL injection em queries dinâmicas
- XSS em `dangerouslySetInnerHTML` ou interpolação de HTML

## Fase 3 — Verificação cruzada

1. Grep por TODOS os consumidores de funções/hooks/componentes que foram alterados
2. Verificar que a assinatura (props, params, return) continua compatível
3. Se uma migration SQL foi criada, verificar que o frontend usa os nomes de coluna corretos

## Fase 4 — Relatório

Apresente:
- ✅ Verificações que passaram
- ❌ Problemas encontrados (com arquivo:linha e descrição)
- ⚠️ Pontos de atenção que merecem teste manual no browser

Para cada ❌, CORRIJA o problema e verifique novamente.

**Seja honesto:** liste no final o que você NÃO CONSEGUE testar e que o usuário deve verificar manualmente (layout visual, responsividade, interações de drag/click, etc).
