import { useEffect, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { formatPhoneBR } from '../../../lib/convidados/formatPhoneBR'
import { isAdultoOuIdoso } from '../../../lib/convidados/calcStatsConvites'
import { LadoSegmented } from './LadoSegmented'
import { TipoSelect } from './TipoSelect'
import { FaixaSelect } from './FaixaSelect'
import type { Pessoa, FaixaKey, LadoKey, TipoKey } from '../../../lib/convidados/types'

interface Props {
  index: number
  pessoa: Pessoa
  isLastOfLastGroup: boolean
  canDelete: boolean
  onChange: (patch: Partial<Pessoa>) => void
  onDelete: () => void
  onEnterCreate: () => void
}

export function PessoaRow({ index, pessoa, isLastOfLastGroup, canDelete, onChange, onDelete, onEnterCreate }: Props) {
  const [nome, setNome] = useState(pessoa.nome_raw || '')
  const [telefone, setTelefone] = useState(formatPhoneBR(pessoa.telefone_raw))
  const [obs, setObs] = useState(pessoa.observacoes || '')

  useEffect(() => { setNome(pessoa.nome_raw || '') }, [pessoa.nome_raw])
  useEffect(() => { setTelefone(formatPhoneBR(pessoa.telefone_raw)) }, [pessoa.telefone_raw])
  useEffect(() => { setObs(pessoa.observacoes || '') }, [pessoa.observacoes])

  const needsPhone = isAdultoOuIdoso(pessoa.faixa)
  const missingPhone = needsPhone && !(telefone.trim().length > 0)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (isLastOfLastGroup) onEnterCreate()
    }
  }

  return (
    <div className="grid items-center gap-1.5 px-3 py-1 hover:bg-ww-paper/60 transition-colors group"
      style={{ gridTemplateColumns: '32px 1.4fr 104px 1fr 180px 0.9fr 1.2fr 28px' }}>
      <span className="text-[11px] text-ww-n400 tabular-nums text-right">{index}</span>

      <input
        value={nome}
        onChange={(e) => { setNome(e.target.value); onChange({ nome_raw: e.target.value }) }}
        onKeyDown={handleKeyDown}
        placeholder="Nome da pessoa"
        className="text-[13px] px-1.5 py-1 border border-transparent rounded focus:border-ww-gold focus:ring-2 focus:ring-ww-gold/30 focus:outline-none hover:border-ww-sand bg-transparent text-ww-n700"
      />

      <FaixaSelect value={pessoa.faixa} onChange={(faixa: FaixaKey) => onChange({ faixa })} />

      <div className={cn('flex items-stretch border rounded transition-colors',
        missingPhone ? 'border-red-300 bg-red-50/30' : 'border-transparent hover:border-ww-sand focus-within:border-ww-gold focus-within:ring-2 focus-within:ring-ww-gold/30')}>
        <span className={cn('inline-flex items-center px-1.5 text-[10px] border-r',
          missingPhone ? 'border-red-200 text-red-500' : 'border-ww-sand text-ww-n500')}>+55</span>
        <input
          value={telefone}
          onChange={(e) => { const f = formatPhoneBR(e.target.value); setTelefone(f); onChange({ telefone_raw: f }) }}
          onKeyDown={handleKeyDown}
          placeholder={missingPhone ? 'Obrigatório' : 'DDD número'}
          inputMode="numeric"
          className={cn('flex-1 px-1.5 py-1 text-[13px] bg-transparent focus:outline-none',
            missingPhone ? 'placeholder:text-red-500 text-red-700' : 'text-ww-n700')}
        />
        {missingPhone && (
          <span className="inline-flex items-center px-1.5 text-red-500" title="Telefone obrigatório para adultos">
            <AlertCircle className="w-3 h-3" />
          </span>
        )}
      </div>

      <LadoSegmented value={pessoa.lado} onChange={(lado: LadoKey | '') => onChange({ lado })} />
      <TipoSelect value={pessoa.tipo} onChange={(tipo: TipoKey | '') => onChange({ tipo })} />

      <input
        value={obs}
        onChange={(e) => { setObs(e.target.value); onChange({ observacoes: e.target.value }) }}
        onKeyDown={handleKeyDown}
        placeholder="Observação"
        className="italic text-[12.5px] px-1.5 py-1 border border-transparent rounded focus:border-ww-gold focus:ring-2 focus:ring-ww-gold/30 focus:outline-none focus:not-italic hover:border-ww-sand bg-transparent text-ww-n600"
      />

      <button type="button" onClick={onDelete} disabled={!canDelete}
        className={cn('p-1 rounded text-ww-n400 hover:text-ww-rosewood hover:bg-ww-rosewood-soft transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100',
          !canDelete && 'cursor-not-allowed hover:text-ww-n400 hover:bg-transparent')}
        aria-label="Remover pessoa"
        title={canDelete ? 'Remover' : 'Cada convite precisa de pelo menos uma pessoa'}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
