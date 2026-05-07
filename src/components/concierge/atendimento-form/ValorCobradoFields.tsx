import { Input } from '../../ui/Input'
import type { CobradoDe } from '../../../hooks/concierge/types'

interface ValorCobradoFieldsProps {
  valor: string
  cobradoDe: CobradoDe | ''
  onValorChange: (valor: string) => void
  onCobradoDeChange: (cobradoDe: CobradoDe | '') => void
}

export function ValorCobradoFields({
  valor,
  cobradoDe,
  onValorChange,
  onCobradoDeChange,
}: ValorCobradoFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Valor
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-slate-600 text-sm">R$</span>
          <Input
            type="number"
            placeholder="0.00"
            value={valor}
            onChange={(e) => onValorChange(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Cobrado de
        </label>
        <select
          value={cobradoDe}
          onChange={(e) => onCobradoDeChange(e.target.value as CobradoDe | '')}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
        >
          <option value="">Selecionar...</option>
          <option value="cliente">Cliente</option>
          <option value="cortesia">Cortesia</option>
          <option value="incluido_pacote">Incluído pacote</option>
        </select>
      </div>
    </div>
  )
}
