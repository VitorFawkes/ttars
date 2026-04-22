import { useEffect, useState } from 'react'
import { X, RotateCcw, Save } from 'lucide-react'
import {
  AGGREGATE_LABELS,
  KPI_TYPE_LABELS,
  type KpiAggregate,
  type KpiConfig,
  type KpiType,
} from './kpiConfig'
import type { StageOption } from './FunnelFilterPanel'

interface Props {
  isOpen: boolean
  onClose: () => void
  configs: KpiConfig[]
  stageOptions: StageOption[]
  onSave: (configs: KpiConfig[]) => void
  onReset: () => void
}

const TYPE_ORDER: KpiType[] = ['volume_stage', 'conversion', 'aggregate', 'time_stage']
const AGGREGATE_ORDER: KpiAggregate[] = ['cards', 'faturamento', 'receita', 'ticket']

export default function FunnelKpisEditor({
  isOpen,
  onClose,
  configs,
  stageOptions,
  onSave,
  onReset,
}: Props) {
  const [draft, setDraft] = useState<KpiConfig[]>(configs)

  // Sincroniza quando o modal abre (pega o estado atual)
  useEffect(() => {
    if (isOpen) setDraft(configs)
  }, [isOpen, configs])

  if (!isOpen) return null

  const updateSlot = (idx: number, patch: Partial<KpiConfig>) => {
    setDraft(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }

  const changeType = (idx: number, type: KpiType) => {
    // Reset campos específicos quando muda o tipo
    setDraft(prev =>
      prev.map((c, i) => {
        if (i !== idx) return c
        return {
          id: c.id,
          type,
          label: c.label,
          stageId: type === 'volume_stage' || type === 'time_stage' ? stageOptions[0]?.id : undefined,
          fromStageId: type === 'conversion' ? stageOptions[0]?.id : undefined,
          toStageId: type === 'conversion' ? stageOptions[stageOptions.length - 1]?.id : undefined,
          aggregate: type === 'aggregate' ? 'cards' : undefined,
        }
      })
    )
  }

  const handleSave = () => {
    onSave(draft)
    onClose()
  }

  const handleReset = () => {
    onReset()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Personalizar KPIs do topo</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Defina o que cada um dos 4 cards mostra. A escolha é salva só pra você.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slots */}
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {draft.map((cfg, idx) => (
            <div
              key={cfg.id}
              className="border border-slate-200 rounded-lg p-4 space-y-3 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                  {idx + 1}
                </span>
                Card {idx + 1}
              </div>

              {/* Tipo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Tipo de métrica
                  </label>
                  <select
                    value={cfg.type}
                    onChange={e => changeType(idx, e.target.value as KpiType)}
                    className="w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
                  >
                    {TYPE_ORDER.map(t => (
                      <option key={t} value={t}>
                        {KPI_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Nome exibido
                  </label>
                  <input
                    type="text"
                    value={cfg.label}
                    onChange={e => updateSlot(idx, { label: e.target.value })}
                    placeholder="deixe vazio para usar nome padrão"
                    className="w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
                  />
                </div>
              </div>

              {/* Campos condicionais */}
              {(cfg.type === 'volume_stage' || cfg.type === 'time_stage') && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Etapa
                  </label>
                  <select
                    value={cfg.stageId ?? ''}
                    onChange={e => updateSlot(idx, { stageId: e.target.value || undefined })}
                    className="w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
                  >
                    <option value="">Selecione uma etapa…</option>
                    {stageOptions.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {cfg.type === 'conversion' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      De (etapa origem)
                    </label>
                    <select
                      value={cfg.fromStageId ?? ''}
                      onChange={e => updateSlot(idx, { fromStageId: e.target.value || undefined })}
                      className="w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
                    >
                      <option value="">Selecione…</option>
                      {stageOptions.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Até (etapa destino)
                    </label>
                    <select
                      value={cfg.toStageId ?? ''}
                      onChange={e => updateSlot(idx, { toStageId: e.target.value || undefined })}
                      className="w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
                    >
                      <option value="">Selecione…</option>
                      {stageOptions.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {cfg.type === 'aggregate' && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Métrica
                  </label>
                  <select
                    value={cfg.aggregate ?? ''}
                    onChange={e =>
                      updateSlot(idx, { aggregate: (e.target.value as KpiAggregate) || undefined })
                    }
                    className="w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
                  >
                    <option value="">Selecione…</option>
                    {AGGREGATE_ORDER.map(a => (
                      <option key={a} value={a}>
                        {AGGREGATE_LABELS[a]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar padrão
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
