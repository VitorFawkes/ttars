# WelcomeCRM Context MCP Server

MCP Server que fornece contexto estruturado do projeto WelcomeCRM para agentes de IA, **garantindo que o protocolo de desenvolvimento seja seguido**.

## Por Que Este Server Existe

O problema: Agentes de IA não seguem protocolos de documentação de forma confiável, mesmo quando instruídos.

A solução: Em vez de **pedir** ao agente para seguir o protocolo, este server **fornece** o contexto já estruturado. O agente não escolhe seguir - ele **recebe** o que precisa.

## Ferramentas Disponíveis

### 1. `get_context` (PRINCIPAL)

Retorna contexto estruturado baseado na tarefa:
- Agent especialista correto
- Seções relevantes do CODEBASE.md
- Arquivos que devem ser lidos
- Hooks e tabelas relacionados
- Template de declaração de contexto

```json
{
  "task": "qual seção abre baseado na etapa do funil",
  "taskType": "investigation"
}
```

### 2. `check_impact`

Analisa o "blast radius" antes de modificar arquivos:
- Dependências que serão afetadas
- Nível de risco
- Testes a executar

```json
{
  "files": ["src/components/card/TripInformation.tsx"],
  "action": "modify"
}
```

### 3. `verify_sync`

Verifica se CODEBASE.md está sincronizado com o código:
- Compara hooks documentados vs encontrados
- Compara páginas documentadas vs encontradas
- Lista itens faltando

```json
{
  "checkOnly": ["hooks", "pages"]
}
```

### 4. `get_dependencies`

Retorna mapa de dependências de uma entidade:
- Quem usa esta tabela/hook/componente
- Risco de cascade

```json
{
  "entity": "pipeline_stages",
  "entityType": "table"
}
```

## Instalação

### 1. Instalar dependências

```bash
cd mcp-servers/welcomecrm-context
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Configurar no Claude Code

Adicione ao seu `~/.claude.json` ou `.claude/settings.json`:

```json
{
  "mcpServers": {
    "welcomecrm-context": {
      "command": "node",
      "args": ["/caminho/para/WelcomeCRM/mcp-servers/welcomecrm-context/dist/index.js"],
      "cwd": "/caminho/para/WelcomeCRM"
    }
  }
}
```

Ou para desenvolvimento:

```json
{
  "mcpServers": {
    "welcomecrm-context": {
      "command": "npx",
      "args": ["tsx", "/caminho/para/WelcomeCRM/mcp-servers/welcomecrm-context/src/index.ts"],
      "cwd": "/caminho/para/WelcomeCRM"
    }
  }
}
```

## Como Funciona

1. **Na primeira chamada**, o server parseia:
   - `.agent/CODEBASE.md` → hooks, páginas, tabelas, componentes
   - `.agent/agents/*.md` → agents especializados
   - `.agent/rules/*.md` → regras obrigatórias

2. **Os dados são cacheados** em `src/data/project-data.json` por 1 hora

3. **Quando o agente chama `get_context`**, recebe:
   - O agent correto para a tarefa
   - Apenas as seções relevantes do CODEBASE.md
   - Lista de arquivos que deve ler
   - Template pronto para declarar contexto

## Fluxo Esperado

```
Usuário pergunta: "como a seção é determinada pela etapa?"
                            ↓
Agente chama: get_context({ task: "...", taskType: "investigation" })
                            ↓
Server retorna:
├── agent: frontend-specialist
├── codebaseSections: [seção 5, seção 9]
├── filesToRead: [TripInformation.tsx, usePipelinePhases.ts]
├── relatedHooks: [useFieldConfig, usePipelinePhases]
└── declareContextTemplate: "🤖 Contexto Carregado: ..."
                            ↓
Agente trabalha COM o contexto correto
```

## Desenvolvimento

```bash
# Rodar em modo dev
npm run dev

# Forçar reparse dos dados
rm src/data/project-data.json
npm run dev
```

## Estrutura

```
welcomecrm-context/
├── src/
│   ├── index.ts           # Entry point MCP
│   ├── types.ts           # Tipos TypeScript
│   ├── tools/
│   │   ├── get-context.ts
│   │   ├── check-impact.ts
│   │   ├── verify-sync.ts
│   │   └── get-dependencies.ts
│   ├── parsers/
│   │   ├── loader.ts
│   │   ├── parse-codebase.ts
│   │   ├── parse-agents.ts
│   │   └── parse-rules.ts
│   └── data/
│       └── project-data.json  # Cache (gerado)
├── package.json
├── tsconfig.json
└── README.md
```
