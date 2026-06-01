import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { usePipelineStages } from '@/hooks/usePipelineStages'

// Seletor de etapa do funil de Weddings. Usado pra escolher PRA ONDE a Sofia move
// o card quando registra/qualifica o casal (conserta o controle "mover etapa" que
// antes não tinha destino). pipelineId vem do produto ativo (Weddings).
export function StagePicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { pipelineId } = useCurrentProductMeta()
  const { data: stages, isLoading } = usePipelineStages(pipelineId)

  return (
    <div>
      <label className="block text-sm text-slate-700 mb-1">Para qual etapa o card vai quando ela registra o casal</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={isLoading || !pipelineId}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        <option value="">{isLoading ? 'Carregando etapas…' : 'Escolha a etapa de destino'}</option>
        {(stages ?? []).map(s => (
          <option key={s.id} value={s.id}>{s.nome}</option>
        ))}
      </select>
      {value == null && (
        <p className="text-xs text-amber-600 mt-1">Sem etapa escolhida, o card não vai se mover (mesmo com o botão ligado).</p>
      )}
    </div>
  )
}
