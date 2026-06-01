import type { ForecastCard } from './usePlannerForecastByDono'
import type { DrillDownCard } from './useAnalyticsDrillDown'

/**
 * Mapeia cards de previsão (ForecastCard, já carregados no cliente) para linhas do drawer de
 * detalhe, no modo "preset" — para clicar num gráfico de Previsão e ver EXATAMENTE aqueles cards,
 * com data prevista e o contexto-tempo (fecha em X dias / Y dias de atraso).
 */
export function forecastToDrillRows(cards: ForecastCard[], todayStr: string): DrillDownCard[] {
  const today = new Date(todayStr).getTime()
  return cards.map(c => {
    const dprev = new Date(c.data_prevista).getTime()
    const dias = isNaN(dprev) ? null : Math.round((dprev - today) / 86400000)
    const extra =
      dias == null ? ''
        : dias < 0 ? `${-dias} ${dias === -1 ? 'dia' : 'dias'} de atraso`
          : dias === 0 ? 'fecha hoje'
            : `fecha em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
    return {
      id: c.card_id,
      titulo: c.card_titulo,
      produto: 'TRIPS',
      status_comercial: 'aberto',
      etapa_nome: c.stage_nome ?? '—',
      fase: c.phase_slug ?? '',
      dono_atual_nome: c.planner_nome,
      valor_display: c.valor,
      receita: 0,
      created_at: c.data_prevista,
      data_fechamento: null,
      pessoa_nome: null,
      pessoa_telefone: null,
      total_count: cards.length,
      stage_entered_at: null,
      data_prevista: c.data_prevista,
      extra_label: extra,
    }
  })
}
