export type HealthSeverity = 'blocker' | 'warning' | 'info'

export interface HealthAlert {
  id: string
  severity: HealthSeverity
  /** Categoria pra agrupar visualmente: "Conversa", "Pontuação", "Conhecimento", etc. */
  category: string
  title: string
  detail: string
  /** Sugestão de ação concreta (texto curto pra UI). */
  suggestion?: string
  /** Aba que o admin deve abrir pra resolver (opcional, pra link). */
  navigateTo?: 'identity' | 'voice' | 'moments' | 'qualification' | 'boundaries' | 'signals' | 'examples'
}
