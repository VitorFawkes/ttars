import { useEffect, useState } from 'react'
import { AlertCircle, Pencil, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { formatPhoneBR } from '../../../lib/convidados/formatPhoneBR'
import { precisaTelefone } from '../../../lib/convidados/calcStatsConvites'
import { LadoSegmented } from './LadoSegmented'
import { TipoSelect } from './TipoSelect'
import { FaixaSelect } from './FaixaSelect'
import { PLANILHA_GRID } from './PlanilhaConvidados'
import { normalizeFaixa } from '../../../lib/convidados/types'
import type { Pessoa, FaixaKey, LadoKey, LadoLabels, TipoKey } from '../../../lib/convidados/types'

interface Props {
  index: number
  pessoa: Pessoa
  ladoLabels: LadoLabels
  onEditLadoNomes: () => void
  isLastOfLastGroup: boolean
  canDelete: boolean
  onChange: (patch: Partial<Pessoa>) => void
  onDelete: () => void
  onEnterCreate: () => void
}

const cellBaseCls = 'h-9 px-2 flex items-center border-l border-ww-cream'

export function PessoaRow({ index, pessoa, ladoLabels, onEditLadoNomes, isLastOfLastGroup, canDelete, onChange, onDelete, onEnterCreate }: Props) {
  const [nome, setNome] = useState(pessoa.nome_raw || '')
  const [telefone, setTelefone] = useState(formatPhoneBR(pessoa.telefone_raw))
  const [obs, setObs] = useState(pessoa.observacoes || '')

  // Sync prop → state local quando o servidor manda novo valor (refetch, outro
  // editor). Inputs ficam controlados localmente entre keystrokes pro debounce
  // não atrasar UI. setState dentro de useEffect é intencional aqui.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNome(pessoa.nome_raw || '') }, [pessoa.nome_raw])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTelefone(formatPhoneBR(pessoa.telefone_raw)) }, [pessoa.telefone_raw])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setObs(pessoa.observacoes || '') }, [pessoa.observacoes])

  const needsPhone = precisaTelefone(pessoa.faixa)
  const missingPhone = needsPhone && !(telefone.trim().length > 0)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (isLastOfLastGroup) onEnterCreate()
    }
  }

  const handleNomeChange = (v: string) => { setNome(v); onChange({ nome_raw: v }) }
  const handleTelefoneChange = (v: string) => { const f = formatPhoneBR(v); setTelefone(f); onChange({ telefone_raw: f }) }
  const handleObsChange = (v: string) => { setObs(v); onChange({ observacoes: v }) }

  return (
    <div>
      {/* ─── DESKTOP (md+): linha de grid horizontal ─────────────────────── */}
      <div className="hidden md:grid items-stretch hover:bg-ww-paper/60 transition-colors group"
        style={{ gridTemplateColumns: PLANILHA_GRID }}>
        <div className="flex items-center justify-center text-[11px] text-ww-n400 tabular-nums font-mono">
          {index}
        </div>

        <div className={cellBaseCls}>
          <input
            value={nome}
            onChange={(e) => handleNomeChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={index === 1 ? 'Quem é? Ex: Maria Silva' : 'Nome'}
            className="w-full px-1.5 py-1 text-[13px] border border-transparent rounded focus:border-ww-gold focus:ring-2 focus:ring-ww-gold/30 focus:outline-none hover:border-ww-sand bg-transparent text-ww-n700"
          />
        </div>

        <div className={cellBaseCls}>
          <FaixaSelect value={normalizeFaixa(pessoa.faixa)} onChange={(faixa: FaixaKey) => onChange({ faixa })} />
        </div>

        <div className={cellBaseCls}>
          <PhoneInput
            value={telefone}
            missing={missingPhone}
            onChange={handleTelefoneChange}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className={cn(cellBaseCls, 'justify-center')}>
          <LadoSegmented value={pessoa.lado} labels={ladoLabels} onChange={(lado: LadoKey | '') => onChange({ lado })} />
        </div>

        <div className={cellBaseCls}>
          <TipoSelect value={pessoa.tipo} onChange={(tipo: TipoKey | '') => onChange({ tipo })} />
        </div>

        <div className={cellBaseCls}>
          <input
            value={obs}
            onChange={(e) => handleObsChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Observação"
            className="w-full italic text-[12.5px] px-1.5 py-1 border border-transparent rounded focus:border-ww-gold focus:ring-2 focus:ring-ww-gold/30 focus:outline-none focus:not-italic hover:border-ww-sand bg-transparent text-ww-n600"
          />
        </div>

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onDelete}
            disabled={!canDelete}
            className={cn('p-1 rounded text-ww-n400 hover:text-ww-rosewood hover:bg-ww-rosewood-soft transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100',
              !canDelete && 'cursor-not-allowed hover:text-ww-n400 hover:bg-transparent')}
            aria-label="Remover pessoa"
            title={canDelete ? 'Remover' : 'Cada convite precisa de pelo menos uma pessoa'}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── MOBILE (<md): card vertical com rótulos ─────────────────────── */}
      <div className="md:hidden px-3 py-3 space-y-2.5 bg-white">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-ww-n400 tabular-nums">#{index}</span>
          <button
            type="button"
            onClick={onDelete}
            disabled={!canDelete}
            className={cn(
              'inline-flex items-center gap-1 px-2 h-7 text-[11px] rounded text-ww-n500 hover:text-ww-rosewood hover:bg-ww-rosewood-soft transition-colors',
              !canDelete && 'opacity-40 cursor-not-allowed hover:text-ww-n500 hover:bg-transparent',
            )}
            aria-label="Remover pessoa"
            title={canDelete ? 'Remover' : 'Cada convite precisa de pelo menos uma pessoa'}
          >
            <X className="w-3 h-3" /> Remover
          </button>
        </div>

        <MobileField label="Nome">
          <input
            value={nome}
            onChange={(e) => handleNomeChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={index === 1 ? 'Quem é? Ex: Maria Silva' : 'Nome'}
            className="w-full px-2 py-2 text-[14px] border border-ww-sand rounded-md focus:border-ww-gold focus:ring-2 focus:ring-ww-gold/30 focus:outline-none bg-white text-ww-n700"
          />
        </MobileField>

        <div className="grid grid-cols-2 gap-2">
          <MobileField label="Idade">
            <FaixaSelect value={normalizeFaixa(pessoa.faixa)} onChange={(faixa: FaixaKey) => onChange({ faixa })} />
          </MobileField>
          <MobileField label="Tipo">
            <TipoSelect value={pessoa.tipo} onChange={(tipo: TipoKey | '') => onChange({ tipo })} />
          </MobileField>
        </div>

        <MobileField label="Telefone">
          <PhoneInput
            value={telefone}
            missing={missingPhone}
            onChange={handleTelefoneChange}
            onKeyDown={handleKeyDown}
          />
        </MobileField>

        <div>
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ww-n500 mb-1">
            Lado
            <button
              type="button"
              onClick={onEditLadoNomes}
              className="p-0.5 rounded text-ww-n400 hover:text-ww-gold-ink transition-colors"
              aria-label="Ajustar os nomes do casal"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </span>
          <LadoSegmented value={pessoa.lado} labels={ladoLabels} onChange={(lado: LadoKey | '') => onChange({ lado })} />
        </div>

        <MobileField label="Observação">
          <input
            value={obs}
            onChange={(e) => handleObsChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Observação"
            className="w-full italic px-2 py-2 text-[13px] border border-ww-sand rounded-md focus:border-ww-gold focus:ring-2 focus:ring-ww-gold/30 focus:outline-none focus:not-italic bg-white text-ww-n600"
          />
        </MobileField>
      </div>
    </div>
  )
}

function MobileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-ww-n500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function PhoneInput({
  value, missing, onChange, onKeyDown,
}: {
  value: string
  missing: boolean
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div className={cn('w-full flex items-stretch border rounded transition-colors',
      missing ? 'border-red-300 bg-red-50/30' : 'border-ww-sand md:border-transparent hover:border-ww-sand focus-within:border-ww-gold focus-within:ring-2 focus-within:ring-ww-gold/30')}>
      <span className={cn('inline-flex items-center px-1.5 text-[10px] border-r font-mono',
        missing ? 'border-red-200 text-red-500' : 'border-ww-sand text-ww-n500')}>+55</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={missing ? 'Obrigatório' : 'DDD número'}
        inputMode="numeric"
        className={cn('flex-1 min-w-0 px-1.5 py-1 md:py-1 text-[13px] md:text-[13px] bg-transparent focus:outline-none',
          missing ? 'placeholder:text-red-500 text-red-700' : 'text-ww-n700')}
      />
      {missing && (
        <span className="inline-flex items-center px-1.5 text-red-500" title="Telefone obrigatório para adultos">
          <AlertCircle className="w-3 h-3" />
        </span>
      )}
    </div>
  )
}
