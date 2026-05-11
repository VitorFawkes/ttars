/** Labels e rótulos direcionais para cada campo de ordenação */
export const SORT_FIELD_LABELS: Record<string, { label: string; asc: string; desc: string; icon?: string }> = {
    created_at:           { label: 'Data de Criação',     asc: 'Antigos',   desc: 'Recentes'  },
    updated_at:           { label: 'Última Atualização',  asc: 'Antigos',   desc: 'Recentes'  },
    data_viagem_inicio:   { label: 'Data da Viagem',      asc: 'Próximas',  desc: 'Distantes' },
    data_fechamento:      { label: 'Data de Fechamento',  asc: 'Próximas',  desc: 'Distantes' },
    titulo:               { label: 'Título',              asc: 'A → Z',     desc: 'Z → A'     },
    valor_estimado:       { label: 'Valor Estimado',      asc: 'Menor',     desc: 'Maior'     },
    tempo_etapa_dias:     { label: 'Tempo na Etapa',      asc: 'Recentes',  desc: 'Antigos'   },
    data_proxima_tarefa:  { label: 'Próxima Tarefa',      asc: 'Urgentes',  desc: 'Futuras'   },
}
