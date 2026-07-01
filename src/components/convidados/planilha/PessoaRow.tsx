import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, Pencil, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { precisaTelefone } from '../../../lib/convidados/calcStatsConvites'
import { formatPhoneBR } from '../../../lib/convidados/formatPhoneBR'
import { COUNTRIES, OTHER_DIAL, countryByDial, parsePhoneValue, serializePhoneValue } from '../../../lib/convidados/countryDialCodes'
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
  // Guarda o telefone CRU (formato de armazenamento): BR "DD 99999-9999" sem
  // "+"; internacional "+DDI dígitos". O PhoneInput fatia isso em país + número.
  const [telefone, setTelefone] = useState(pessoa.telefone_raw || '')
  const [obs, setObs] = useState(pessoa.observacoes || '')

  // Sync prop → state local quando o servidor manda novo valor (refetch, outro
  // editor). Inputs ficam controlados localmente entre keystrokes pro debounce
  // não atrasar UI. setState dentro de useEffect é intencional aqui.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNome(pessoa.nome_raw || '') }, [pessoa.nome_raw])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTelefone(pessoa.telefone_raw || '') }, [pessoa.telefone_raw])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setObs(pessoa.observacoes || '') }, [pessoa.observacoes])

  const needsPhone = precisaTelefone(pessoa.faixa)
  // Conta DÍGITOS (não caracteres): "+" ou texto sem número não vale como telefone.
  const missingPhone = needsPhone && telefone.replace(/\D/g, '').length === 0

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (isLastOfLastGroup) onEnterCreate()
    }
  }

  const handleNomeChange = (v: string) => { setNome(v); onChange({ nome_raw: v }) }
  const handleTelefoneChange = (raw: string) => { setTelefone(raw); onChange({ telefone_raw: raw }) }
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

/**
 * Campo de telefone com seletor de país (DDI). Aceita número internacional —
 * não fica mais travado no +55. Brasil continua com a máscara "DD 99999-9999"
 * e é gravado sem "+"; internacional grava "+DDI dígitos".
 *
 * `value` é o telefone CRU (formato de armazenamento) e `onChange` devolve o
 * telefone CRU já montado (país + número).
 */
function PhoneInput({
  value, missing, onChange, onKeyDown,
}: {
  value: string
  missing: boolean
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const initial = parsePhoneValue(value)
  const [dial, setDial] = useState(initial.dial)
  const [local, setLocal] = useState(initial.local)
  // Re-sincroniza quando o value muda POR FORA (refetch do servidor, outro
  // editor). Padrão recomendado do React: ajustar estado no render comparando
  // com o valor anterior, sem useEffect.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    // Só re-deriva país/número de mudança EXTERNA. Se o value é o eco da nossa
    // própria edição (igual ao que serializamos), mantém dial/local — senão o
    // modo "Outro" seria reclassificado pra um país no meio da digitação e o
    // texto do casal saltaria/duplicaria o DDI.
    if (value !== serializePhoneValue(dial, local)) {
      const p = parsePhoneValue(value)
      setLocal(p.local)
      // Não reseta o país escolhido quando o número está vazio (senão trocar de
      // país com o campo em branco voltaria pro Brasil sozinho).
      if ((value ?? '').trim()) setDial(p.dial)
    }
  }

  const emit = (nextDial: string, nextLocal: string) => {
    onChange(serializePhoneValue(nextDial, nextLocal))
  }

  const handleLocal = (typed: string) => {
    let nextLocal: string
    if (dial === '55') {
      nextLocal = formatPhoneBR(typed) // Brasil: máscara BR (idempotente)
    } else if (dial === OTHER_DIAL) {
      nextLocal = typed // "Outro": texto livre verbatim (deve conter o +DDI)
    } else {
      // País listado: se colou/digitou "+DDI…", remove o DDI redundante uma vez
      // pra não duplicar (senão o serialize geraria "+33 33…").
      nextLocal = stripLeadingDial(typed, dial)
    }
    setLocal(nextLocal)
    emit(dial, nextLocal)
  }

  const handleDial = (nextDial: string) => {
    // Reajusta o número ao trocar de país, sem perder nem duplicar dígitos.
    let nextLocal = local
    if (nextDial === '55') {
      nextLocal = formatPhoneBR(local)
    } else if (nextDial === OTHER_DIAL) {
      // Indo pra "Outro" a partir de um país listado: prefixa "+DDI" pro número
      // continuar internacional (senão viraria BR no envio).
      const digits = local.replace(/\D/g, '')
      nextLocal = dial !== '55' && dial !== OTHER_DIAL && digits ? `+${dial} ${digits}` : local
    } else {
      // Outro país listado: número nacional, tirando "+DDI" redundante se o
      // local trazia o código do país (ex: veio do modo "Outro").
      nextLocal = stripLeadingDial(local, nextDial)
    }
    setDial(nextDial)
    setLocal(nextLocal)
    emit(nextDial, nextLocal)
  }

  const isOther = dial === OTHER_DIAL
  const placeholder = missing
    ? 'Obrigatório'
    : dial === '55' ? 'DDD número' : isOther ? '+DDI número' : 'Número'

  return (
    <div className={cn('w-full flex items-stretch border rounded transition-colors',
      missing ? 'border-red-300 bg-red-50/30' : 'border-ww-sand md:border-transparent hover:border-ww-sand focus-within:border-ww-gold focus-within:ring-2 focus-within:ring-ww-gold/30')}>
      <CountryDialSelect value={dial} invalid={missing} onChange={handleDial} />
      <input
        value={local}
        onChange={(e) => handleLocal(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        inputMode={isOther ? 'tel' : 'numeric'}
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

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Para um pa\u00eds listado: se o texto veio com "+DDI" (colado ou vindo do modo
 * "Outro"), devolve s\u00f3 o n\u00famero nacional removendo o DDI redundante uma vez \u2014
 * evita duplicar o c\u00f3digo do pa\u00eds no valor salvo (ex: "+33 33\u2026"). Se n\u00e3o tem
 * "+", mant\u00e9m o que foi digitado (n\u00famero nacional).
 */
function stripLeadingDial(input: string, dial: string): string {
  const trimmed = input.trim()
  if (!trimmed.startsWith('+')) return input
  const digits = trimmed.replace(/\D/g, '')
  return digits.startsWith(dial) ? digits.slice(dial.length) : digits
}

/**
 * Seletor de país (DDI) próprio. O gatilho fica COMPACTO — bandeira + sigla +
 * "+DDI" (ex: "🇧🇷 BR +55"), sem cortar — e a lista aberta mostra o nome
 * completo do país + campo de busca. Native <select> cortava o texto da opção.
 */
function CountryDialSelect({
  value, invalid, onChange,
}: {
  value: string
  invalid: boolean
  onChange: (dial: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const selected = value === OTHER_DIAL ? null : countryByDial(value)
  const triggerLabel = value === OTHER_DIAL
    ? '🌐 Outro'
    : selected ? `${selected.flag} ${selected.iso} +${selected.dial}` : `+${value}`

  const q = stripAccents(query.trim())
  const filtered = q
    ? COUNTRIES.filter((c) => stripAccents(c.name).includes(q) || c.iso.toLowerCase().includes(q) || c.dial.includes(q))
    : COUNTRIES

  const pick = (dial: string) => { onChange(dial); setOpen(false); setQuery('') }

  return (
    <div ref={boxRef} className="relative shrink-0 flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="País do telefone"
        aria-expanded={open}
        title="País do telefone"
        className={cn('flex items-center gap-1 pl-1.5 pr-1 text-[11px] whitespace-nowrap border-r cursor-pointer focus:outline-none',
          invalid ? 'border-red-200 text-red-600' : 'border-ww-sand text-ww-n600 hover:text-ww-n800')}
      >
        <span>{triggerLabel}</span>
        <ChevronDown className={cn('w-3 h-3 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-60 max-w-[78vw] bg-white border border-ww-sand rounded-lg shadow-lg overflow-hidden">
          <div className="p-1.5 border-b border-ww-cream">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar país…"
              className="w-full px-2 py-1.5 text-[12px] border border-ww-sand rounded focus:border-ww-gold focus:ring-2 focus:ring-ww-gold/30 focus:outline-none text-ww-n700"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map((c) => (
              <button
                key={c.dial}
                type="button"
                onClick={() => pick(c.dial)}
                className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] text-left hover:bg-ww-gold-soft/50 transition-colors',
                  c.dial === value ? 'bg-ww-gold-soft/40 text-ww-n800 font-medium' : 'text-ww-n600')}
              >
                <span className="text-[15px] leading-none">{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-ww-n400 tabular-nums">+{c.dial}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => pick(OTHER_DIAL)}
              className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] text-left hover:bg-ww-gold-soft/50 border-t border-ww-cream transition-colors',
                value === OTHER_DIAL ? 'bg-ww-gold-soft/40 text-ww-n800 font-medium' : 'text-ww-n600')}
            >
              <span className="text-[15px] leading-none">🌐</span>
              <span className="flex-1">Outro país (digite o +DDI)</span>
            </button>
            {filtered.length === 0 && (
              <p className="px-2.5 py-3 text-[12px] text-ww-n400 text-center">Nenhum país encontrado</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
