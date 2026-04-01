import { useMemo } from 'react'
import { SystemPhase } from '../types/pipeline'
import { useDateFeatureSettings } from './useDateFeatureSettings'

interface StageWithPhase {
  id: string
  ordem: number
  phase_id?: string | null
  pipeline_phases?: { slug?: string; order_index?: number } | null
}

interface Phase {
  id: string
  slug: string | null
}

/**
 * Identifica a primeira etapa de pós-venda e determina se o alerta de data
 * deve ser exibido ao mover para essa etapa.
 */
export function usePosVendaAlert(
  stages: StageWithPhase[] | undefined,
  phases: Phase[] | undefined
) {
  const { posVendaAlertEnabled } = useDateFeatureSettings()

  const firstPosVendaStageId = useMemo(() => {
    if (!stages || !phases) return null

    const posVendaPhase = phases.find(p => p.slug === SystemPhase.POS_VENDA)
    if (!posVendaPhase) return null

    const posVendaStages = stages
      .filter(s => s.phase_id === posVendaPhase.id)
      .sort((a, b) => a.ordem - b.ordem)

    return posVendaStages[0]?.id || null
  }, [stages, phases])

  const shouldShowAlert = (targetStageId: string): boolean => {
    if (!posVendaAlertEnabled) return false
    if (!firstPosVendaStageId) return false
    return targetStageId === firstPosVendaStageId
  }

  return { shouldShowAlert, firstPosVendaStageId }
}
