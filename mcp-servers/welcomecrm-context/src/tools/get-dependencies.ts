/**
 * get_dependencies - Retorna mapa de dependências de uma entidade
 *
 * Usa o grafo de imports real gerado por generate_dep_graph.py
 * Fallback: busca por nome no CODEBASE.md parseado
 *
 * IMPORTANTE: NÃO reverter para KNOWN_DEPENDENCIES hardcoded.
 * O grafo real (.agent/dependency-graph.json) tem 2.669 relações vs 22 hardcoded.
 * Validado em 2026-04-01 com testes ao vivo.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { DependencyResult, ParsedProjectData } from '../types.js'

interface DepGraph {
  imported_by: Record<string, string[]>
  imports: Record<string, string[]>
  categories: Record<string, string>
}

/**
 * Carrega o grafo de dependências gerado pelo Python script
 */
function loadDepGraph(projectRoot: string): DepGraph | null {
  const graphPath = join(projectRoot, '.agent', 'dependency-graph.json')
  if (!existsSync(graphPath)) {
    console.error('dependency-graph.json não encontrado. Rode: python3 .agent/scripts/generate_dep_graph.py')
    return null
  }

  try {
    return JSON.parse(readFileSync(graphPath, 'utf-8'))
  } catch (e) {
    console.error('Erro ao ler dependency-graph.json:', e)
    return null
  }
}

/**
 * Encontra o arquivo no grafo que corresponde à entidade buscada
 */
function findEntityInGraph(entity: string, entityType: string, graph: DepGraph): string | null {
  const entityLower = entity.toLowerCase()

  // Mapeamento de tipo para diretório
  const typeToDir: Record<string, string> = {
    hook: 'hooks/',
    component: 'components/',
    page: 'pages/',
    util: 'lib/',
  }

  const dirHint = typeToDir[entityType] || ''

  // Busca exata pelo nome do arquivo (sem extensão)
  for (const filePath of Object.keys(graph.imported_by)) {
    const fileName = filePath.split('/').pop()?.replace(/\.(ts|tsx)$/, '') || ''
    if (fileName.toLowerCase() === entityLower) {
      // Se tem hint de diretório, priorizar match nesse diretório
      if (dirHint && filePath.includes(dirHint)) {
        return filePath
      }
      // Se não tem hint ou não achou no dir, usar qualquer match
      if (!dirHint) return filePath
    }
  }

  // Busca parcial (fallback)
  for (const filePath of Object.keys(graph.imported_by)) {
    const fileName = filePath.split('/').pop()?.replace(/\.(ts|tsx)$/, '') || ''
    if (fileName.toLowerCase() === entityLower) {
      return filePath
    }
  }

  // Busca em imports (pode ser o path exato)
  const possiblePaths = [
    `src/hooks/${entity}.ts`,
    `src/hooks/${entity}.tsx`,
    `src/components/${entity}.tsx`,
    `src/pages/${entity}.tsx`,
    `src/lib/${entity}.ts`,
  ]
  for (const p of possiblePaths) {
    if (graph.imported_by[p]) return p
  }

  return null
}

/**
 * Categoriza importers por tipo (hook, page, component)
 */
function categorizeImporters(importers: string[]): {
  hooks: string[]
  pages: string[]
  components: string[]
} {
  const hooks: string[] = []
  const pages: string[] = []
  const components: string[] = []

  for (const imp of importers) {
    const name = imp.split('/').pop()?.replace(/\.(ts|tsx)$/, '') || imp
    if (imp.includes('/hooks/')) {
      hooks.push(name)
    } else if (imp.includes('/pages/')) {
      pages.push(name)
    } else if (imp.includes('/components/')) {
      components.push(name)
    }
  }

  return { hooks, pages, components }
}

/**
 * Determina o nível de risco baseado na quantidade de consumidores
 */
function determineRiskLevel(
  entity: string,
  totalUsage: number
): 'low' | 'medium' | 'high' | 'critical' {
  // Entidades core sempre críticas
  const coreEntities = ['cards', 'contatos', 'profiles', 'pipeline_stages', 'supabase', 'utils']
  if (coreEntities.some(c => entity.toLowerCase().includes(c))) {
    return 'critical'
  }

  if (totalUsage >= 10) return 'critical'
  if (totalUsage >= 6) return 'high'
  if (totalUsage >= 3) return 'medium'
  return 'low'
}

/**
 * Função principal: get_dependencies
 */
export async function getDependencies(
  input: { entity: string; entityType: string },
  projectData: ParsedProjectData
): Promise<DependencyResult> {
  const { entity, entityType } = input

  // Encontrar raiz do projeto
  let projectRoot = process.cwd()
  if (!existsSync(join(projectRoot, 'CLAUDE.md'))) {
    // Navegar para cima até encontrar
    let current = projectRoot
    for (let i = 0; i < 5; i++) {
      current = join(current, '..')
      if (existsSync(join(current, 'CLAUDE.md'))) {
        projectRoot = current
        break
      }
    }
  }

  // Tentar usar o grafo de imports real
  const graph = loadDepGraph(projectRoot)

  let usedByHooks: string[] = []
  let usedByPages: string[] = []
  let usedByComponents: string[] = []

  if (graph) {
    const filePath = findEntityInGraph(entity, entityType, graph)

    if (filePath) {
      const importers = graph.imported_by[filePath] || []
      const categorized = categorizeImporters(importers)
      usedByHooks = categorized.hooks
      usedByPages = categorized.pages
      usedByComponents = categorized.components
    }
  }

  // Fallback: busca por nome no CODEBASE.md parseado (se grafo não achou nada)
  if (usedByHooks.length === 0 && usedByPages.length === 0 && usedByComponents.length === 0) {
    const entityLower = entity.toLowerCase()

    for (const hook of projectData.codebase.hooks) {
      if (hook.name.toLowerCase().includes(entityLower)) {
        usedByHooks.push(hook.name)
      }
    }
    for (const page of projectData.codebase.pages) {
      if (page.name.toLowerCase().includes(entityLower)) {
        usedByPages.push(page.name)
      }
    }
  }

  const totalUsage = usedByHooks.length + usedByPages.length + usedByComponents.length
  const cascadeRisk = determineRiskLevel(entity, totalUsage)

  const parts: string[] = []
  if (cascadeRisk === 'critical') parts.push(`${entity} é uma entidade CRÍTICA.`)
  if (totalUsage > 0) parts.push(`${totalUsage} arquivos dependem desta entidade.`)
  if (usedByHooks.length > 0) parts.push(`Hooks: ${usedByHooks.join(', ')}.`)
  if (usedByPages.length > 0) parts.push(`Páginas: ${usedByPages.join(', ')}.`)
  if (usedByComponents.length > 0) parts.push(`Componentes: ${usedByComponents.slice(0, 10).join(', ')}${usedByComponents.length > 10 ? ` (+${usedByComponents.length - 10} mais)` : ''}.`)
  if (totalUsage === 0) parts.push(`Nenhuma dependência encontrada. Verifique se o nome está correto ou rode: python3 .agent/scripts/generate_dep_graph.py`)

  return {
    entity,
    entityType: entityType as 'table' | 'hook' | 'component' | 'page',
    usedByHooks,
    usedByPages,
    usedByComponents,
    cascadeRisk,
    riskExplanation: parts.join(' ')
  }
}
