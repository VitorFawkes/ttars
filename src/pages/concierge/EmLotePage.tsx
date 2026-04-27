import { useState } from 'react'
import { Loader2, Zap, ChevronDown, ChevronRight } from 'lucide-react'
import { useAtendimentosLote } from '../../hooks/concierge/useAtendimentosLote'
import { useExecutarEmLote } from '../../hooks/concierge/useAtendimentoMutations'
import { TIPO_LABEL, JANELA_LABEL, CATEGORIAS_CONCIERGE } from '../../hooks/concierge/types'
import type { AtendimentoLote, OutcomeConcierge } from '../../hooks/concierge/types'

function categoriaLabel(key: string): string {
  return CATEGORIAS_CONCIERGE[key as keyof typeof CATEGORIAS_CONCIERGE]?.label ?? key
}

export default function EmLotePage() {
  const { data: grupos, isLoading } = useAtendimentosLote()
  const executar = useExecutarEmLote()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmAction, setConfirmAction] = useState<{ grupo: AtendimentoLote; outcome: OutcomeConcierge } | null>(null)
  const [observacao, setObservacao] = useState('')

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando lotes...
      </div>
    )
  }

  if (!grupos || grupos.length === 0) {
    return (
      <div className="p-8">
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <Zap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-900">Nada em lote agora</h2>
          <p className="text-sm text-slate-600 mt-2">Sua fila está limpa. Volta aqui quando tiver atendimentos pendentes pra processar em massa.</p>
        </div>
      </div>
    )
  }

  const toggle = (key: string) => {
    setExpanded(s => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }

  const onConfirmExecutar = async () => {
    if (!confirmAction) return
    await executar.mutateAsync({
      atendimento_ids: confirmAction.grupo.atendimento_ids,
      outcome: confirmAction.outcome,
      observacao: observacao.trim() || undefined,
    })
    setConfirmAction(null)
    setObservacao('')
  }

  return (
    <div className="p-6 space-y-3">
      <h1 className="text-base font-semibold text-slate-900 tracking-tight mb-4">Em Lote</h1>
      {grupos.map(g => {
        const key = `${g.categoria}-${g.janela_embarque}`
        const isExpanded = expanded.has(key)
        const tipoCfg = TIPO_LABEL[g.tipo_concierge]
        const isOferta = g.tipo_concierge === 'oferta'
        return (
          <div key={key} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50" onClick={() => toggle(key)}>
              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${tipoCfg.bgColor} ${tipoCfg.color}`}>
                {tipoCfg.emoji} {tipoCfg.label}
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">{categoriaLabel(g.categoria)}</div>
                <div className="text-xs text-slate-500">{JANELA_LABEL[g.janela_embarque]}</div>
              </div>
              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                {g.total_pendentes} pendente{g.total_pendentes === 1 ? '' : 's'}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmAction({ grupo: g, outcome: 'feito' }) }}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700"
              >
                Marcar todos como feito
              </button>
              {isOferta && (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmAction({ grupo: g, outcome: 'aceito' }) }}
                  className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700"
                >
                  Marcar como aceito
                </button>
              )}
            </div>
            {isExpanded && (
              <div className="border-t border-slate-100 p-4 space-y-1.5 bg-slate-50">
                {g.atendimento_ids.map((aid, i) => (
                  <div key={aid} className="text-xs text-slate-600 flex justify-between gap-3">
                    <span>Card {g.card_ids[i]?.slice(0, 8)}…</span>
                    <span className="text-slate-400">tarefa {g.tarefa_ids[i]?.slice(0, 8)}…</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {confirmAction && (
        <div
          className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { setConfirmAction(null); setObservacao('') }}
        >
          <div
            className="bg-white rounded-xl border border-slate-200 shadow-lg max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">
              Confirmar ação em lote
            </h3>
            <p className="text-sm text-slate-600 mt-2">
              Você vai marcar <strong>{confirmAction.grupo.atendimento_ids.length} atendimento(s)</strong> como{' '}
              <strong>{confirmAction.outcome}</strong>. Essa ação não pode ser desfeita facilmente.
            </p>
            <label className="text-xs font-medium text-slate-600 mt-4 block">Observação (opcional)</label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => { setConfirmAction(null); setObservacao('') }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirmExecutar}
                disabled={executar.isPending}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {executar.isPending ? 'Executando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
