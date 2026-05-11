/**
 * get_context - Ferramenta principal do MCP Server
 *
 * Retorna contexto estruturado baseado na tarefa, incluindo:
 * - Agent especialista correto
 * - Seções relevantes do CODEBASE.md
 * - Arquivos a ler
 * - Hooks e tabelas relacionados
 */

import type {
  ContextResult,
  ParsedProjectData,
  DomainCategory,
  AgentInfo,
  DocumentedHook,
  DocumentedTable,
} from '../types.js'

// Mapeamento de keywords para domínios
const DOMAIN_KEYWORDS: Record<DomainCategory, string[]> = {
  frontend: [
    'react', 'componente', 'component', 'página', 'page', 'ui', 'ux',
    'hook', 'useState', 'useEffect', 'tailwind', 'css', 'estilo',
    'modal', 'button', 'form', 'input', 'layout', 'sidebar', 'header',
    'kanban', 'card', 'seção', 'section', 'tab', 'accordion'
  ],
  backend: [
    'edge function', 'api', 'endpoint', 'rpc', 'function', 'supabase',
    'webhook', 'integração', 'integration', 'sync', 'queue', 'worker'
  ],
  database: [
    'sql', 'tabela', 'table', 'coluna', 'column', 'view', 'trigger',
    'migration', 'rls', 'policy', 'index', 'foreign key', 'fk',
    'query', 'select', 'insert', 'update', 'delete'
  ],
  pipeline: [
    'pipeline', 'stage', 'etapa', 'fase', 'phase', 'funil', 'funnel',
    'kanban', 'board', 'card', 'deal', 'oportunidade', 'quality gate'
  ],
  proposals: [
    'proposta', 'proposal', 'orçamento', 'versão', 'version', 'pdf',
    'template', 'builder', 'section', 'item', 'flight', 'voo'
  ],
  integrations: [
    'integração', 'integration', 'webhook', 'n8n', 'activecampaign',
    'whatsapp', 'sync', 'outbound', 'inbound', 'field map'
  ],
  general: []
}

// Mapeamento de domínios para agents
const DOMAIN_TO_AGENT: Record<DomainCategory, string> = {
  frontend: 'frontend-specialist',
  backend: 'backend-specialist',
  database: 'database-architect',
  pipeline: 'frontend-specialist', // Pipeline é principalmente UI
  proposals: 'frontend-specialist', // Proposals é principalmente UI
  integrations: 'backend-specialist',
  general: 'frontend-specialist' // Default
}

// Mapeamento de domínios para seções do CODEBASE.md
const DOMAIN_TO_SECTIONS: Record<DomainCategory, string[]> = {
  frontend: ['2. Modular Section System', '3. Layout System', '4. UI Component Library', '9. Componentes Críticos'],
  backend: ['6. Integration System', '8. Quick Reference Commands'],
  database: ['1. Core Entities', '7. File Dependencies'],
  pipeline: ['5. Pipeline System', '9. Componentes Críticos', '11. Mapa de Dependencias'],
  proposals: ['2. Modular Section System', '3.3 All Pages'],
  integrations: ['6. Integration System', '1. Core Entities'],
  general: ['1. Core Entities', '2. Modular Section System', '3. Layout System']
}

/**
 * Detecta o domínio da tarefa baseado em keywords
 */
function detectDomain(task: string, additionalKeywords: string[] = []): DomainCategory {
  const normalizedTask = task.toLowerCase()
  const allText = normalizedTask + ' ' + additionalKeywords.join(' ').toLowerCase()

  const scores: Record<DomainCategory, number> = {
    frontend: 0,
    backend: 0,
    database: 0,
    pipeline: 0,
    proposals: 0,
    integrations: 0,
    general: 0
  }

  // Calcula score para cada domínio
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const keyword of keywords) {
      if (allText.includes(keyword)) {
        scores[domain as DomainCategory] += 1
      }
    }
  }

  // Encontra o domínio com maior score
  let maxDomain: DomainCategory = 'general'
  let maxScore = 0

  for (const [domain, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score
      maxDomain = domain as DomainCategory
    }
  }

  return maxDomain
}

/**
 * Extrai arquivos relevantes baseado na tarefa e domínio
 */
function extractRelevantFiles(
  task: string,
  domain: DomainCategory,
  projectData: ParsedProjectData
): string[] {
  const files: string[] = []
  const normalizedTask = task.toLowerCase()

  // Busca hooks relevantes
  for (const hook of projectData.codebase.hooks) {
    const hookLower = hook.name.toLowerCase()
    const purposeLower = hook.purpose.toLowerCase()

    if (normalizedTask.includes(hookLower) ||
        normalizedTask.includes(hook.purpose.toLowerCase().split(' ')[0])) {
      files.push(`src/hooks/${hook.file}`)
    }
  }

  // Busca páginas relevantes
  for (const page of projectData.codebase.pages) {
    const pageLower = page.name.toLowerCase()

    if (normalizedTask.includes(pageLower) ||
        normalizedTask.includes(page.route.replace('/', ''))) {
      files.push(page.path)
    }
  }

  // Busca componentes relevantes
  for (const component of projectData.codebase.components) {
    const compLower = component.name.toLowerCase()

    if (normalizedTask.includes(compLower)) {
      files.push(component.path)
    }
  }

  // Adiciona arquivos padrão por domínio
  switch (domain) {
    case 'pipeline':
      if (!files.some(f => f.includes('KanbanBoard'))) {
        files.push('src/components/pipeline/KanbanBoard.tsx')
      }
      if (!files.some(f => f.includes('CardHeader'))) {
        files.push('src/components/card/CardHeader.tsx')
      }
      break
    case 'proposals':
      if (!files.some(f => f.includes('ProposalBuilder'))) {
        files.push('src/pages/ProposalBuilderV4.tsx')
      }
      break
    case 'database':
      files.push('src/database.types.ts')
      break
  }

  return [...new Set(files)].slice(0, 10) // Max 10 arquivos
}

/**
 * Extrai hooks relacionados à tarefa
 */
function extractRelatedHooks(
  task: string,
  domain: DomainCategory,
  projectData: ParsedProjectData
): DocumentedHook[] {
  const normalizedTask = task.toLowerCase()
  const related: DocumentedHook[] = []

  for (const hook of projectData.codebase.hooks) {
    const hookLower = hook.name.toLowerCase()
    const purposeLower = hook.purpose.toLowerCase()

    // Match direto no nome ou purpose
    if (normalizedTask.includes(hookLower.replace('use', '').toLowerCase()) ||
        purposeLower.split(' ').some(word => normalizedTask.includes(word))) {
      related.push(hook)
    }

    // Match por categoria
    if (hook.category === domain) {
      related.push(hook)
    }
  }

  return [...new Set(related)].slice(0, 8) // Max 8 hooks
}

/**
 * Extrai tabelas relacionadas à tarefa
 */
function extractRelatedTables(
  task: string,
  domain: DomainCategory,
  projectData: ParsedProjectData
): DocumentedTable[] {
  const normalizedTask = task.toLowerCase()
  const related: DocumentedTable[] = []

  for (const table of projectData.codebase.tables) {
    const tableLower = table.name.toLowerCase()

    if (normalizedTask.includes(tableLower) ||
        normalizedTask.includes(tableLower.replace('_', ' '))) {
      related.push(table)
    }

    // Match por categoria
    if (table.category === domain) {
      related.push(table)
    }
  }

  return [...new Set(related)].slice(0, 6) // Max 6 tabelas
}

/**
 * Gera template de declaração de contexto
 */
function generateDeclareContextTemplate(
  agent: AgentInfo,
  sections: string[],
  tables: DocumentedTable[],
  hooks: DocumentedHook[]
): string {
  return `🤖 **Contexto Carregado:**
- Agent: \`${agent.name}\`
- CODEBASE.md seções: \`${sections.join(', ')}\`
- Entidades envolvidas: \`${tables.map(t => t.name).join(', ') || 'N/A'}\`
- Hooks relacionados: \`${hooks.map(h => h.name).join(', ') || 'N/A'}\`
- Verificação LIVE: \`{sim/não - descreva o que foi verificado}\``
}

/**
 * Função principal: get_context
 */
export async function getContext(
  input: { task: string; taskType: string; keywords?: string[] },
  projectData: ParsedProjectData
): Promise<ContextResult> {
  const { task, taskType, keywords = [] } = input

  // 1. Detecta o domínio da tarefa
  const domain = detectDomain(task, keywords)

  // 2. Identifica o agent correto
  const agentName = DOMAIN_TO_AGENT[domain]
  const agent = projectData.agents[agentName] || {
    name: agentName,
    description: 'Agent especialista',
    skills: [],
    keyRules: [],
    triggers: []
  }

  // 3. Identifica seções relevantes do CODEBASE.md
  const sectionNames = DOMAIN_TO_SECTIONS[domain]
  const relevantSections = sectionNames.map(sectionName => {
    const section = projectData.codebase.sections.find(s =>
      s.title.includes(sectionName) || s.id.includes(sectionName)
    )
    return {
      section: sectionName,
      content: section?.content || 'Seção não encontrada - verificar CODEBASE.md',
      relevanceReason: `Relevante para tarefas de ${domain}`
    }
  })

  // 4. Extrai arquivos, hooks e tabelas relevantes
  const filesToRead = extractRelevantFiles(task, domain, projectData)
  const relatedHooks = extractRelatedHooks(task, domain, projectData)
  const relatedTables = extractRelatedTables(task, domain, projectData)

  // 5. Gera o template de declaração de contexto
  const declareContextTemplate = generateDeclareContextTemplate(
    agent,
    sectionNames,
    relatedTables,
    relatedHooks
  )

  // 6. Define lembrete de protocolo baseado no tipo de tarefa
  let protocolReminder = ''
  switch (taskType) {
    case 'implementation':
      protocolReminder = `ANTES de implementar:
1. Declare o contexto usando o template acima
2. Use check_impact() para analisar blast radius
3. Verifique o mapa de dependências (seção 11)
4. APÓS implementar: atualize CODEBASE.md se criou algo novo`
      break
    case 'investigation':
      protocolReminder = `DURANTE investigação:
1. Leia os arquivos listados em filesToRead
2. Verifique os hooks relacionados
3. Responda com referências específicas (arquivo:linha)`
      break
    case 'debug':
      protocolReminder = `DURANTE debug:
1. Verifique o mapa de dependências
2. Identifique cascade de erros
3. Teste hipóteses com dados reais`
      break
    case 'design':
      protocolReminder = `ANTES de design:
1. Leia o agent frontend-specialist.md (regras de design)
2. Consulte o Design System em docs/DESIGN_SYSTEM.md
3. NÃO use shadcn/Radix sem perguntar ao usuário`
      break
  }

  return {
    agent,
    codebaseSections: { relevant: relevantSections },
    filesToRead,
    relatedHooks,
    relatedTables,
    protocolReminder,
    declareContextTemplate
  }
}
