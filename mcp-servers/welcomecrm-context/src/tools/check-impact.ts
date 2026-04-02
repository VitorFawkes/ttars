/**
 * check_impact - Analisa o blast radius de uma modificação
 *
 * Usa o grafo de imports real (.agent/dependency-graph.json) para encontrar
 * dependências REAIS, não heurísticas por substring.
 *
 * IMPORTANTE: NÃO reverter para heurísticas de substring ("Provavelmente usa").
 * O grafo real tem 2.669 relações reais. Validado em 2026-04-01.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { ImpactResult, ParsedProjectData } from '../types.js'

interface DepGraph {
  imported_by: Record<string, string[]>
  imports: Record<string, string[]>
}

// Arquivos críticos que aumentam o risco
const CRITICAL_FILES = [
  'KanbanBoard', 'CardHeader', 'CardDetail', 'Pipeline',
  'Layout', 'database.types', 'supabaseClient', 'AuthContext',
  'CreateCardModal', 'SmartTaskModal'
]

/**
 * Carrega o grafo de dependências real
 */
function loadDepGraph(projectRoot: string): DepGraph | null {
  const graphPath = join(projectRoot, '.agent', 'dependency-graph.json')
  if (!existsSync(graphPath)) return null
  try {
    return JSON.parse(readFileSync(graphPath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Encontra o projeto root
 */
function findProjectRoot(): string {
  let current = process.cwd()
  if (existsSync(join(current, 'CLAUDE.md'))) return current
  for (let i = 0; i < 5; i++) {
    current = join(current, '..')
    if (existsSync(join(current, 'CLAUDE.md'))) return current
  }
  return process.cwd()
}

/**
 * Extrai nome base de um path
 */
function getBaseName(filePath: string): string {
  return filePath.split('/').pop()?.replace(/\.(tsx?|js)$/, '') || filePath
}

/**
 * Categoriza um arquivo pelo diretório
 */
function categorize(filePath: string): 'component' | 'hook' | 'page' | 'util' {
  if (filePath.includes('/hooks/')) return 'hook'
  if (filePath.includes('/pages/')) return 'page'
  if (filePath.includes('/lib/') || filePath.includes('/utils/')) return 'util'
  return 'component'
}

/**
 * Encontra um arquivo no grafo pelo nome
 */
function findInGraph(graph: DepGraph, fileName: string): string | null {
  const nameLower = fileName.toLowerCase().replace(/\.(tsx?|js)$/, '')
  for (const fp of Object.keys(graph.imported_by)) {
    const fn = fp.split('/').pop()?.replace(/\.(tsx?|js)$/, '') || ''
    if (fn.toLowerCase() === nameLower) return fp
  }
  // Também procurar nos imports (arquivos que importam mas não são importados)
  for (const fp of Object.keys(graph.imports)) {
    const fn = fp.split('/').pop()?.replace(/\.(tsx?|js)$/, '') || ''
    if (fn.toLowerCase() === nameLower) return fp
  }
  return null
}

/**
 * Encontra TODOS os consumidores de um arquivo usando o grafo real
 */
function findRealDependencies(
  filePath: string,
  graph: DepGraph
): Array<{ file: string; type: 'component' | 'hook' | 'page' | 'util'; reason: string }> {
  const baseName = getBaseName(filePath)
  const graphPath = findInGraph(graph, baseName)

  if (!graphPath) return []

  const importers = graph.imported_by[graphPath] || []
  return importers.map(imp => ({
    file: imp,
    type: categorize(imp),
    reason: `Importa ${baseName}`
  }))
}

/**
 * Encontra hooks afetados pela modificação (via grafo real)
 */
function findAffectedHooks(files: string[], graph: DepGraph): string[] {
  const hooks: string[] = []

  for (const file of files) {
    const baseName = getBaseName(file)
    const graphPath = findInGraph(graph, baseName)
    if (!graphPath) continue

    const importers = graph.imported_by[graphPath] || []
    for (const imp of importers) {
      if (imp.includes('/hooks/')) {
        hooks.push(getBaseName(imp))
      }
    }
  }

  return [...new Set(hooks)]
}

/**
 * Encontra tabelas envolvidas (via nome — tabelas não estão no import graph)
 */
function findInvolvedTables(
  files: string[],
  projectData: ParsedProjectData
): string[] {
  const tables: string[] = []

  for (const file of files) {
    const baseName = getBaseName(file).toLowerCase()

    // Hooks e componentes com nomes óbvios
    for (const table of projectData.codebase.tables) {
      const tName = table.name.toLowerCase()
      // Match direto: useCards → cards, usePipelineStages → pipeline_stages
      const cleanBase = baseName.replace('use', '').toLowerCase()
      const cleanTable = tName.replace(/_/g, '')
      if (cleanBase === cleanTable || cleanBase === tName) {
        tables.push(table.name)
      }
    }

    // Core tables por keyword
    if (baseName.includes('card') && !baseName.includes('kanbancard')) {
      tables.push('cards')
    }
    if (baseName.includes('pipeline') || baseName.includes('kanban')) {
      tables.push('pipeline_stages')
    }
    if (baseName.includes('contact') || baseName.includes('contato') || baseName.includes('people')) {
      tables.push('contatos')
    }
    if (baseName.includes('proposal')) {
      tables.push('proposals')
    }
    if (baseName.includes('gift') || baseName.includes('presente')) {
      tables.push('card_gift_assignments')
    }
    if (baseName.includes('integration')) {
      tables.push('integrations')
    }
  }

  return [...new Set(tables)]
}

/**
 * Calcula nível de risco baseado em dados REAIS
 */
function calculateRiskLevel(
  files: string[],
  dependencies: Array<{ file: string }>,
  tables: string[]
): 'low' | 'medium' | 'high' | 'critical' {
  let riskScore = 0

  // Arquivos críticos
  for (const file of files) {
    const baseName = getBaseName(file)
    if (CRITICAL_FILES.some(cf => baseName.includes(cf))) {
      riskScore += 3
    }
  }

  // Número REAL de dependências (não heurísticas)
  riskScore += Math.min(dependencies.length, 5)

  // Tabelas core
  const coreTables = ['cards', 'contatos', 'profiles', 'pipeline_stages']
  for (const table of tables) {
    if (coreTables.includes(table)) riskScore += 2
  }

  if (riskScore >= 8) return 'critical'
  if (riskScore >= 5) return 'high'
  if (riskScore >= 3) return 'medium'
  return 'low'
}

/**
 * Gera warnings específicos
 */
function generateWarnings(files: string[], action: string, riskLevel: string): string[] {
  const warnings: string[] = []

  if (riskLevel === 'critical' || riskLevel === 'high') {
    warnings.push('⚠️ RISCO ALTO: Crie uma feature branch antes de modificar')
  }

  for (const file of files) {
    const base = getBaseName(file)
    if (base.includes('database.types')) {
      warnings.push('⚠️ database.types.ts é gerado. Use npx supabase gen types')
    }
    if (base.includes('KanbanBoard')) {
      warnings.push('⚠️ KanbanBoard: teste drag-and-drop após modificar')
    }
    if (base.includes('CardHeader')) {
      warnings.push('⚠️ CardHeader: verifique quality gate e mudança de etapa')
    }
    if (base.includes('AuthContext')) {
      warnings.push('⚠️ AuthContext: 60+ arquivos dependem. Qualquer mudança tem blast radius crítico')
    }
  }

  if (action === 'delete') {
    warnings.push('⚠️ DELETE: Verifique imports com get_dependencies antes')
  }
  if (action === 'rename') {
    warnings.push('⚠️ RENAME: Atualize todos os imports')
  }

  return warnings
}

/**
 * Função principal: check_impact
 */
export async function checkImpact(
  input: { files: string[]; action: string; description?: string },
  projectData: ParsedProjectData
): Promise<ImpactResult> {
  const { files, action } = input
  const projectRoot = findProjectRoot()
  const graph = loadDepGraph(projectRoot)

  // 1. Encontra dependências REAIS via grafo de imports
  const allDeps: Array<{ file: string; type: 'component' | 'hook' | 'page' | 'util'; reason: string }> = []
  for (const file of files) {
    if (graph) {
      allDeps.push(...findRealDependencies(file, graph))
    }
  }
  const directDependencies = [...new Map(allDeps.map(d => [d.file, d])).values()]

  // 2. Encontra hooks afetados (via grafo real)
  const hooksAffected = graph ? findAffectedHooks(files, graph) : []

  // 3. Encontra tabelas envolvidas (por nome — tabelas não estão no import graph)
  const tablesInvolved = findInvolvedTables(files, projectData)

  // 4. Calcula risco com dados reais
  const riskLevel = calculateRiskLevel(files, directDependencies, tablesInvolved)

  // 5. Testes a rodar
  const testsToRun = ['npm run lint', 'npm run build']
  if (files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) {
    testsToRun.push('npx tsc --noEmit')
  }

  // 6. Warnings
  const warnings = generateWarnings(files, action, riskLevel)

  return {
    directDependencies,
    hooksAffected,
    tablesInvolved,
    riskLevel,
    testsToRun,
    warnings
  }
}
