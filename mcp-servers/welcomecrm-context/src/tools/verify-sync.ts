/**
 * verify_sync - Verifica se CODEBASE.md está sincronizado com o código
 *
 * Compara documentação com arquivos reais no projeto
 */

import { glob } from 'glob'
import type { SyncResult, ParsedProjectData } from '../types.js'

// Caminhos para buscar arquivos reais
const HOOKS_GLOB = 'src/hooks/**/*.ts'
const PAGES_GLOB = 'src/pages/**/*.tsx'
const COMPONENTS_GLOB = 'src/components/**/*.tsx'

/**
 * Conta arquivos que matcham um padrão glob
 */
async function countFiles(pattern: string, cwd: string): Promise<string[]> {
  try {
    const files = await glob(pattern, { cwd, ignore: ['**/*.test.*', '**/*.spec.*'] })
    return files
  } catch {
    return []
  }
}

/**
 * Extrai nomes de hooks dos arquivos encontrados
 */
function extractHookNames(files: string[]): string[] {
  return files
    .map(f => {
      const match = f.match(/\/([^/]+)\.ts$/)
      return match ? match[1] : null
    })
    .filter((name): name is string => name !== null && name.startsWith('use'))
}

/**
 * Extrai nomes de páginas dos arquivos encontrados
 */
function extractPageNames(files: string[]): string[] {
  return files
    .map(f => {
      const match = f.match(/\/([^/]+)\.tsx$/)
      return match ? match[1] : null
    })
    .filter((name): name is string => name !== null)
}

/**
 * Extrai nomes de componentes dos arquivos encontrados
 */
function extractComponentNames(files: string[]): string[] {
  return files
    .map(f => {
      const match = f.match(/\/([^/]+)\.tsx$/)
      return match ? match[1] : null
    })
    .filter((name): name is string => name !== null)
}

/**
 * Encontra itens faltando na documentação
 */
function findMissingItems(
  documented: string[],
  found: string[],
  type: 'hook' | 'page' | 'component',
  files: string[]
): Array<{ type: 'hook' | 'page' | 'component'; name: string; file: string }> {
  const documentedLower = documented.map(d => d.toLowerCase())
  const missing: Array<{ type: 'hook' | 'page' | 'component'; name: string; file: string }> = []

  found.forEach((name, index) => {
    if (!documentedLower.includes(name.toLowerCase())) {
      missing.push({
        type,
        name,
        file: files[index] || 'unknown'
      })
    }
  })

  return missing
}

/**
 * Determina status baseado no delta
 */
function determineStatus(delta: number): 'FRESH' | 'STALE' {
  return Math.abs(delta) <= 2 ? 'FRESH' : 'STALE'
}

/**
 * Determina status geral
 */
function determineOverallStatus(
  hooksStatus: 'FRESH' | 'STALE',
  pagesStatus: 'FRESH' | 'STALE',
  componentsStatus: 'FRESH' | 'STALE'
): 'FRESH' | 'STALE' | 'CRITICAL' {
  const staleCount = [hooksStatus, pagesStatus, componentsStatus].filter(s => s === 'STALE').length

  if (staleCount >= 2) return 'CRITICAL'
  if (staleCount >= 1) return 'STALE'
  return 'FRESH'
}

/**
 * Função principal: verify_sync
 */
export async function verifySync(
  input: { checkOnly?: string[] },
  projectData: ParsedProjectData
): Promise<SyncResult> {
  const checkOnly = input.checkOnly || ['all']
  const shouldCheckAll = checkOnly.includes('all')

  // Diretório base do projeto (assumindo que o MCP server está em mcp-servers/)
  const projectRoot = process.cwd().replace(/\/mcp-servers\/[^/]+$/, '')

  // Inicializa resultado
  const result: SyncResult = {
    hooks: { documented: 0, found: 0, delta: 0, status: 'FRESH' },
    pages: { documented: 0, found: 0, delta: 0, status: 'FRESH' },
    components: { documented: 0, found: 0, delta: 0, status: 'FRESH' },
    missingItems: [],
    lastUpdated: projectData.lastParsed,
    overallStatus: 'FRESH'
  }

  // Verifica hooks
  if (shouldCheckAll || checkOnly.includes('hooks')) {
    const hookFiles = await countFiles(HOOKS_GLOB, projectRoot)
    const foundHooks = extractHookNames(hookFiles)
    const documentedHooks = projectData.codebase.hooks.map(h => h.name)

    result.hooks = {
      documented: documentedHooks.length,
      found: foundHooks.length,
      delta: foundHooks.length - documentedHooks.length,
      status: determineStatus(foundHooks.length - documentedHooks.length)
    }

    const missingHooks = findMissingItems(documentedHooks, foundHooks, 'hook', hookFiles)
    result.missingItems.push(...missingHooks)
  }

  // Verifica páginas
  if (shouldCheckAll || checkOnly.includes('pages')) {
    const pageFiles = await countFiles(PAGES_GLOB, projectRoot)
    const foundPages = extractPageNames(pageFiles)
    const documentedPages = projectData.codebase.pages.map(p => p.name)

    result.pages = {
      documented: documentedPages.length,
      found: foundPages.length,
      delta: foundPages.length - documentedPages.length,
      status: determineStatus(foundPages.length - documentedPages.length)
    }

    const missingPages = findMissingItems(documentedPages, foundPages, 'page', pageFiles)
    result.missingItems.push(...missingPages)
  }

  // Verifica componentes
  if (shouldCheckAll || checkOnly.includes('components')) {
    const componentFiles = await countFiles(COMPONENTS_GLOB, projectRoot)
    const foundComponents = extractComponentNames(componentFiles)
    const documentedComponents = projectData.codebase.components.map(c => c.name)

    result.components = {
      documented: documentedComponents.length,
      found: foundComponents.length,
      delta: foundComponents.length - documentedComponents.length,
      status: determineStatus(foundComponents.length - documentedComponents.length)
    }

    // Não adiciona componentes faltando por serem muitos
    // Apenas indica o delta
  }

  // Determina status geral
  result.overallStatus = determineOverallStatus(
    result.hooks.status,
    result.pages.status,
    result.components.status
  )

  return result
}
