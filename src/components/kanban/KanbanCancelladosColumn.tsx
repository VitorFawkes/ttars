import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Archive } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface CardCancelado {
  id: string
  titulo: string | null
  pessoa_nome: string | null
  data_fechamento: string | null
  viagem_modo: string | null
  viagem_motivo_nome: string | null
}

interface KanbanCancelladosColumnProps {
  pipelineId: string | undefined
  orgId: string | undefined
}

/** Coluna "Cancelados" — cards em etapa terminal (is_terminal=true).
 *  Aparece SOMENTE quando o toggle "Incluir cancelados" está ligado no header do kanban. */
export function KanbanCancelladosColumn({ pipelineId, orgId }: KanbanCancelladosColumnProps) {
  const navigate = useNavigate()

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['kanban-cancelados', pipelineId, orgId],
    queryFn: async (): Promise<CardCancelado[]> => {
      if (!pipelineId || !orgId) return []
      // Busca stages terminais do pipeline
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .eq('is_terminal', true)
      const stageIds = (stages ?? []).map((s: { id: string }) => s.id)
      if (stageIds.length === 0) return []
      // Cards nesses stages
      const { data, error } = await supabase
        .from('cards')
        .select('id, titulo, pessoa_principal_id, data_fechamento')
        .eq('org_id', orgId)
        .in('pipeline_stage_id', stageIds)
        .order('data_fechamento', { ascending: false, nullsFirst: false })
        .limit(100)
      if (error) throw error
      const cardIds = (data ?? []).map((c: { id: string }) => c.id)
      // Buscar viagens associadas com motivo
      const viagensMap = new Map<string, { modo: string | null; motivo: string | null }>()
      if (cardIds.length > 0) {
        const { data: viagens } = await supabase
          .from('viagens')
          .select('card_id, modo_cancelamento, motivos_cancelamento:motivo_cancelamento_id (nome)')
          .in('card_id', cardIds)
        for (const v of viagens ?? []) {
          const row = v as { card_id: string; modo_cancelamento: string | null; motivos_cancelamento?: { nome?: string | null } | null }
          if (row.card_id) {
            viagensMap.set(row.card_id, {
              modo: row.modo_cancelamento,
              motivo: row.motivos_cancelamento?.nome ?? null,
            })
          }
        }
      }
      // Buscar nome do contato principal
      const pessoaIds = (data ?? [])
        .map((c: { pessoa_principal_id: string | null }) => c.pessoa_principal_id)
        .filter(Boolean) as string[]
      const pessoasMap = new Map<string, string>()
      if (pessoaIds.length > 0) {
        const { data: pessoas } = await supabase
          .from('contatos')
          .select('id, nome')
          .in('id', pessoaIds)
        for (const p of pessoas ?? []) {
          const row = p as { id: string; nome: string | null }
          if (row.nome) pessoasMap.set(row.id, row.nome)
        }
      }
      return (data ?? []).map((c) => {
        const row = c as {
          id: string
          titulo: string | null
          pessoa_principal_id: string | null
          data_fechamento: string | null
        }
        const viagem = viagensMap.get(row.id)
        return {
          id: row.id,
          titulo: row.titulo,
          pessoa_nome: row.pessoa_principal_id ? pessoasMap.get(row.pessoa_principal_id) ?? null : null,
          data_fechamento: row.data_fechamento,
          viagem_modo: viagem?.modo ?? null,
          viagem_motivo_nome: viagem?.motivo ?? null,
        }
      })
    },
    enabled: !!pipelineId && !!orgId,
    staleTime: 30_000,
  })

  return (
    <>
      {/* Divisor visual antes da coluna */}
      <div className="w-px bg-slate-400 shrink-0 mx-1.5 my-2 rounded-full" aria-hidden />

      <div className="shrink-0 w-72 bg-slate-100 rounded-lg border-2 border-slate-300 border-dashed flex flex-col h-full">
        <div className="px-3 py-2.5 border-b border-slate-300 bg-slate-200/60 rounded-t-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-slate-700">
              <Archive className="w-4 h-4" />
              <span className="font-semibold text-sm">Cancelados</span>
            </div>
            <span className="text-xs font-medium text-slate-600 bg-slate-300/60 px-2 py-0.5 rounded-full">
              {cards.length}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wide">Arquivo</div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {isLoading && <div className="text-xs text-slate-400 text-center py-4">Carregando…</div>}
          {!isLoading && cards.length === 0 && (
            <div className="text-xs text-slate-500 text-center py-4 px-2">
              Nenhum cancelamento total no histórico
            </div>
          )}
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/cards/${c.id}`)}
              className={cn(
                'w-full text-left bg-white rounded-lg border border-slate-200 p-2.5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all',
              )}
            >
              <div className="font-medium text-sm text-slate-700 truncate">
                {c.titulo ?? 'Sem título'}
              </div>
              {c.pessoa_nome && (
                <div className="text-xs text-slate-500 truncate">{c.pessoa_nome}</div>
              )}
              <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                {c.viagem_modo && (
                  <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide text-[9px]">
                    {c.viagem_modo}
                  </span>
                )}
                {c.viagem_motivo_nome && <span className="truncate">{c.viagem_motivo_nome}</span>}
                {c.data_fechamento && (
                  <span className="text-slate-400">
                    {new Date(c.data_fechamento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
