import { X } from 'lucide-react'
import { Input } from '../../ui/Input'
import { TipoCategoriaPicker } from './TipoCategoriaPicker'
import { PrioridadeSelect } from './PrioridadeSelect'
import { ResponsavelSelect } from './ResponsavelSelect'
import { ValorCobradoFields } from './ValorCobradoFields'
import { ViagemPicker } from './ViagemPicker'
import type { AtendimentoBlockState } from './types'

interface AtendimentoFormBlockProps {
  index: number
  value: AtendimentoBlockState
  onChange: (next: AtendimentoBlockState) => void
  onRemove?: () => void
  produtoSlug: string | null | undefined
  /** Quando true, marca o bloco com erro de validação (título vazio ou viagem ausente). */
  showError?: boolean
  /** Org ativa — usada pra restringir busca de viagem. */
  orgId: string | undefined
  /** Quando setado, a viagem fica travada nesse cardId (modo "criar pra este card"). */
  lockedCardId?: string
  /** Título da viagem travada — informativo, mostrado no picker. */
  lockedCardTitulo?: string
}

export function AtendimentoFormBlock({
  index,
  value,
  onChange,
  onRemove,
  produtoSlug,
  showError = false,
  orgId,
  lockedCardId,
  lockedCardTitulo,
}: AtendimentoFormBlockProps) {
  const update = (patch: Partial<AtendimentoBlockState>) => onChange({ ...value, ...patch })
  const mostraValor = value.tipo === 'oferta'
  const tituloInvalido = showError && !value.titulo.trim()
  const viagemInvalida = showError && !value.cardId

  // Quando há lockedCardId, o picker fica desabilitado e o cardId vem da prop.
  const effectiveCardId = lockedCardId ?? value.cardId
  const effectiveCardTitulo = lockedCardId ? (lockedCardTitulo ?? '') : value.cardTitulo

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          Atendimento {index + 1}
        </h3>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700 transition-colors"
            title="Remover este atendimento"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div>
        <ViagemPicker
          cardId={effectiveCardId}
          cardTitulo={effectiveCardTitulo}
          onChange={(cardId, cardTitulo) => update({ cardId, cardTitulo })}
          disabled={!!lockedCardId}
          orgId={orgId}
          fallbackLabel={lockedCardTitulo}
        />
        {viagemInvalida && (
          <p className="mt-1 text-[11px] text-red-600">Selecione uma viagem</p>
        )}
      </div>

      <TipoCategoriaPicker
        tipo={value.tipo}
        categoria={value.categoria}
        onTipoChange={(tipo) => update({ tipo })}
        onCategoriaChange={(categoria) => update({ categoria })}
        produtoSlug={produtoSlug}
      />

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Título *
        </label>
        <Input
          type="text"
          placeholder="Ex: Oferecer upgrade de assento"
          value={value.titulo}
          onChange={(e) => update({ titulo: e.target.value })}
          className={tituloInvalido ? 'border-red-300 focus:ring-red-500 text-sm' : 'text-sm'}
        />
        {tituloInvalido && (
          <p className="mt-1 text-[11px] text-red-600">Digite um título</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Descrição
        </label>
        <textarea
          placeholder="Detalhes adicionais..."
          value={value.descricao}
          onChange={(e) => update({ descricao: e.target.value })}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-none h-20 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Prazo
          </label>
          <Input
            type="date"
            value={value.prazo}
            onChange={(e) => update({ prazo: e.target.value })}
            className="text-sm"
          />
        </div>
        <PrioridadeSelect
          value={value.prioridade}
          onChange={(prioridade) => update({ prioridade })}
        />
      </div>

      <ResponsavelSelect
        value={value.responsavelId}
        onChange={(responsavelId) => update({ responsavelId })}
      />

      {mostraValor && (
        <ValorCobradoFields
          valor={value.valor}
          cobradoDe={value.cobradoDe}
          onValorChange={(valor) => update({ valor })}
          onCobradoDeChange={(cobradoDe) => update({ cobradoDe })}
        />
      )}
    </div>
  )
}
