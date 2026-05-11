/**
 * Tipos para o MCP Server welcomecrm-context
 */

// Tipos de tarefas reconhecidas
export type TaskType =
  | 'investigation'  // Explorar/entender código
  | 'implementation' // Criar/modificar código
  | 'debug'          // Investigar bugs
  | 'design'         // Trabalho de UI/UX

// Categorias de domínio
export type DomainCategory =
  | 'frontend'   // React, componentes, UI
  | 'backend'    // Edge Functions, API
  | 'database'   // SQL, migrations, views
  | 'pipeline'   // Sistema de funil
  | 'proposals'  // Sistema de propostas
  | 'integrations' // Integrações externas
  | 'general'    // Não específico

// Estrutura do Agent
export interface AgentInfo {
  name: string
  description: string
  skills: string[]
  keyRules: string[]
  triggers: string[]
}

// Seção do CODEBASE.md
export interface CodebaseSection {
  id: string
  title: string
  content: string
  subsections?: CodebaseSection[]
}

// Hook documentado
export interface DocumentedHook {
  name: string
  file: string
  purpose: string
  category: string
}

// Página documentada
export interface DocumentedPage {
  name: string
  path: string
  route: string
  description: string
  category: string
}

// Tabela documentada
export interface DocumentedTable {
  name: string
  description: string
  fkTo: string[]
  category: string
}

// Componente documentado
export interface DocumentedComponent {
  name: string
  path: string
  usedIn: string[]
  impact: string
}

// Resultado de get_context
export interface ContextResult {
  agent: AgentInfo
  codebaseSections: {
    relevant: Array<{
      section: string
      content: string
      relevanceReason: string
    }>
  }
  filesToRead: string[]
  relatedHooks: DocumentedHook[]
  relatedTables: DocumentedTable[]
  protocolReminder: string
  declareContextTemplate: string
}

// Resultado de check_impact
export interface ImpactResult {
  directDependencies: Array<{
    file: string
    type: 'component' | 'hook' | 'page' | 'util'
    reason: string
  }>
  hooksAffected: string[]
  tablesInvolved: string[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  testsToRun: string[]
  warnings: string[]
}

// Resultado de verify_sync
export interface SyncResult {
  hooks: { documented: number; found: number; delta: number; status: 'FRESH' | 'STALE' }
  pages: { documented: number; found: number; delta: number; status: 'FRESH' | 'STALE' }
  components: { documented: number; found: number; delta: number; status: 'FRESH' | 'STALE' }
  missingItems: Array<{
    type: 'hook' | 'page' | 'component'
    name: string
    file: string
  }>
  lastUpdated: string
  overallStatus: 'FRESH' | 'STALE' | 'CRITICAL'
}

// Resultado de get_dependencies
export interface DependencyResult {
  entity: string
  entityType: 'table' | 'hook' | 'component' | 'page'
  usedByHooks: string[]
  usedByPages: string[]
  usedByComponents: string[]
  cascadeRisk: 'low' | 'medium' | 'high' | 'critical'
  riskExplanation: string
}

// Dados parseados do projeto
export interface ParsedProjectData {
  agents: Record<string, AgentInfo>
  codebase: {
    sections: CodebaseSection[]
    hooks: DocumentedHook[]
    pages: DocumentedPage[]
    tables: DocumentedTable[]
    components: DocumentedComponent[]
    stats: {
      tables: number
      pages: number
      hooks: number
      views: number
      components: number
    }
  }
  rules: Array<{
    name: string
    trigger: string
    priority: string
    content: string
  }>
  lastParsed: string
}
