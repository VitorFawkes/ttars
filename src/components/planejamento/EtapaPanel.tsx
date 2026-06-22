import { useState } from 'react'
import { Flag, ArrowRight, Check, Lock, PartyPopper, FilePenLine } from 'lucide-react'
import { cn } from '../../lib/utils'
import { toast } from 'sonner'
import { useUpdatePlanejamentoEtapa } from '../../hooks/planejamento/useUpdatePlanejamentoEtapa'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import {
  PLANEJAMENTO_LABEL,
  PLANEJAMENTO_OBJETIVO,
  PLANEJ_FIELD,
  REGIAO_OPTIONS,
  FORMATO_OPTIONS,
  nextEtapa,
  type EtapaPlanejamento,
} from '../../hooks/planejamento/types'

const CARD = 'bg-white border border-[#EAE1D3] rounded-2xl shadow-[0_1px_2px_rgba(78,24,32,0.05)]'

// ════════════════════════════════════════════════════════════════════════════
// MARCOS — o card de "avançar de etapa" (blocos lado a lado, como no design)
// ════════════════════════════════════════════════════════════════════════════

export function EtapaPanel({ wedding }: { wedding: WeddingPlanejamento }) {
  const update = useUpdatePlanejamentoEtapa()
  const etapa = wedding.planejamentoEtapa
  const gate = wedding.gate
  const next = nextEtapa(etapa)
  const pct = gate.total > 0 ? Math.round((gate.met / gate.total) * 100) : 0

  const handleAdvance = () => {
    if (!next || !gate.allOk) {
      if (!gate.allOk) toast.error('Cumpra os marcos da etapa antes de avançar.')
      return
    }
    update.mutate({ cardId: wedding.id, etapa: next })
  }

  const liberado = gate.allOk && (next != null)

  return (
    <section className={cn(CARD, 'p-5 sm:p-6')}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2.5 flex-wrap mb-3">
            <Flag className="w-[18px] h-[18px] text-[#BD965C]" />
            <h2 className="font-bold text-[15px] text-[#3A3633]">Marcos para avançar de etapa</h2>
            <span className="px-2.5 py-1 rounded-full text-[11.5px] font-bold bg-[#F4ECDD] border border-[#E6D3B3] text-[#8A6A33]">
              {gate.met} de {gate.total} cumpridos
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-[#EFE3CC] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#C9A468] to-[#BD965C]" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[12px] font-bold text-[#8A6A33] tabular-nums">{pct}%</span>
          </div>
        </div>

        {next ? (
          <button
            type="button"
            onClick={handleAdvance}
            disabled={!liberado || update.isPending}
            className={cn(
              'inline-flex items-center gap-2 h-11 px-4 rounded-[10px] text-[13px] font-semibold transition-colors shrink-0',
              liberado
                ? 'bg-[#BD965C] text-white hover:bg-[#a37f47] shadow-[0_1px_2px_rgba(140,100,40,0.25)] cursor-pointer'
                : 'border border-dashed border-[#D9CFC2] bg-[#F6F0E8] text-[#B0A595] cursor-not-allowed',
            )}
          >
            {liberado ? <ArrowRight className="w-[15px] h-[15px]" /> : <Lock className="w-[15px] h-[15px]" />}
            Avançar para {PLANEJAMENTO_LABEL[next]}
          </button>
        ) : gate.allOk ? (
          <span className="inline-flex items-center gap-2 h-11 px-4 rounded-[10px] text-[13px] font-semibold bg-[#EDF1EA] border border-[#CFE0C8] text-[#3F6238] shrink-0">
            <PartyPopper className="w-[15px] h-[15px]" /> Pronto para Produção
          </span>
        ) : null}
      </div>

      <p className="text-[12.5px] text-[#9A9082] mt-3 [font-family:'Roboto',sans-serif]">{PLANEJAMENTO_OBJETIVO[etapa]}</p>

      {/* Marcos em blocos lado a lado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
        {gate.criteria.map((c) => (
          <div
            key={c.key}
            className={cn(
              'rounded-xl border p-3.5',
              c.ok ? 'border-[#DCE7D6] bg-[#F4F8F1]' : 'border-[#E7D7A0] bg-[#FBF6E8]',
            )}
          >
            <div className="flex items-start gap-2.5">
              {c.ok ? (
                <span className="w-[22px] h-[22px] rounded-full bg-[#4F7A4A] text-white grid place-items-center shrink-0">
                  <Check className="w-[13px] h-[13px]" />
                </span>
              ) : (
                <span className="w-[22px] h-[22px] rounded-full border-[1.5px] border-[#D6BE83] bg-white shrink-0" />
              )}
              <span className={cn('text-[13.5px] font-semibold leading-snug [font-family:\'Roboto\',sans-serif]', c.ok ? 'text-[#3F6238]' : 'text-[#8A6D1A]')}>
                {c.label}
              </span>
            </div>
            <div className={cn('mt-3 pt-2.5 border-t text-[11px] font-bold uppercase tracking-[0.06em]', c.ok ? 'border-[#E0EAD9] text-[#6F8568]' : 'border-[#EFE0B3] text-[#A88C57]')}>
              {c.ok ? 'Cumprido' : 'Pendente'}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CAMPOS DESTA ETAPA — card separado (no grid)
// ════════════════════════════════════════════════════════════════════════════

type CampoDef =
  | { key: string; label: string; type: 'text' | 'date' | 'number' | 'datetime-local' | 'bool' }
  | { key: string; label: string; type: 'readonly'; from: string }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] }

const strOpts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }))

const CAMPOS_POR_ETAPA: Record<EtapaPlanejamento, CampoDef[]> = {
  boas_vindas: [
    { key: 'ww_tipo_casamento', label: 'Tipo do casamento', type: 'readonly', from: 'ww_tipo_casamento' },
    { key: PLANEJ_FIELD.reuniao1, label: 'Data da 1ª reunião', type: 'date' },
    { key: PLANEJ_FIELD.notas, label: 'Notas da planejadora', type: 'text' },
  ],
  onboarding: [
    { key: PLANEJ_FIELD.reuniao1Feita, label: '1ª reunião realizada', type: 'bool' },
    { key: PLANEJ_FIELD.convidadosEstimado, label: 'Nº de convidados estimado', type: 'number' },
    { key: PLANEJ_FIELD.tema, label: 'Tema / estilo (primeira ideia)', type: 'text' },
  ],
  propostas: [
    { key: PLANEJ_FIELD.regiao, label: 'Região', type: 'select', options: strOpts(REGIAO_OPTIONS) },
    { key: PLANEJ_FIELD.formato, label: 'Formato do local', type: 'select', options: strOpts(FORMATO_OPTIONS) },
    { key: PLANEJ_FIELD.proximaReuniao, label: 'Próxima reunião', type: 'date' },
  ],
  definicao: [
    { key: PLANEJ_FIELD.espaco, label: 'Espaço / pacote do casamento', type: 'text' },
    { key: PLANEJ_FIELD.contratoAssinado, label: 'Contrato do casamento assinado', type: 'bool' },
    { key: PLANEJ_FIELD.sinalPagoEm, label: 'Sinal pago em', type: 'date' },
    { key: PLANEJ_FIELD.sinalValor, label: 'Valor do sinal (R$)', type: 'number' },
    { key: PLANEJ_FIELD.valorTotal, label: 'Valor total do casamento (R$)', type: 'number' },
  ],
  passagem: [
    { key: PLANEJ_FIELD.quartosBloquear, label: 'Nº de quartos a bloquear', type: 'number' },
    { key: PLANEJ_FIELD.promoTarifa, label: 'Tarifa promocional (R$/noite)', type: 'number' },
    { key: PLANEJ_FIELD.promoInicio, label: 'Início da promo', type: 'date' },
    { key: PLANEJ_FIELD.promoFim, label: 'Fim da promo', type: 'date' },
  ],
  aditivo: [
    { key: PLANEJ_FIELD.listaPreenchida, label: 'Lista de convidados preenchida', type: 'bool' },
    { key: PLANEJ_FIELD.dataHoraCasamento, label: 'Data/hora do casamento', type: 'datetime-local' },
    { key: PLANEJ_FIELD.notas, label: 'Notas finais', type: 'text' },
  ],
}

function readVal(pd: Record<string, unknown> | null, key: string): string {
  if (!pd) return ''
  const v = pd[key]
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'true' : ''
  return String(v)
}

export function CamposEtapaCard({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const campos = CAMPOS_POR_ETAPA[wedding.planejamentoEtapa]
  const saveField = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })

  return (
    <section className={cn(CARD, 'p-5')}>
      <header className="flex items-center gap-2 mb-4">
        <FilePenLine className="w-5 h-5 text-[#BD965C]" />
        <h2 className="text-base font-semibold text-slate-900">Campos desta etapa</h2>
      </header>
      {campos.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Nada a preencher nesta etapa.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {campos.map((c) => (
            <CampoField key={c.key} def={c} value={readVal(wedding.produto_data, c.key)} onSave={saveField} />
          ))}
        </div>
      )}
    </section>
  )
}

const FIELD_CLS =
  'w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'
const LBL_CLS = 'text-[10.5px] uppercase tracking-[0.08em] font-bold text-slate-500'

function CampoField({
  def, value, onSave,
}: {
  def: CampoDef
  value: string
  onSave: (key: string, value: unknown) => void
}) {
  const [local, setLocal] = useState(value)

  if (def.type === 'readonly') {
    return (
      <div className="min-w-0">
        <label className={LBL_CLS}>{def.label}</label>
        <p className="mt-1 px-3 py-2 text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg truncate">{value || '—'}</p>
      </div>
    )
  }

  if (def.type === 'bool') {
    const checked = value === 'true'
    return (
      <label className="flex items-center gap-2.5 cursor-pointer select-none sm:col-span-2 py-1">
        <button
          type="button"
          onClick={() => onSave(def.key, checked ? '' : true)}
          className={cn(
            'w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors',
            checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-slate-400',
          )}
          aria-pressed={checked}
        >
          {checked && <Check className="w-3.5 h-3.5" />}
        </button>
        <span className="text-sm text-slate-700">{def.label}</span>
      </label>
    )
  }

  if (def.type === 'select') {
    return (
      <label className="block">
        <span className={LBL_CLS}>{def.label}</span>
        <select value={value} onChange={(e) => onSave(def.key, e.target.value)} className={FIELD_CLS}>
          <option value="">— selecionar —</option>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="block">
      <span className={LBL_CLS}>{def.label}</span>
      <input
        type={def.type === 'text' ? 'text' : def.type}
        inputMode={def.type === 'number' ? 'decimal' : undefined}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onSave(def.key, local.trim()) }}
        className={FIELD_CLS}
      />
    </label>
  )
}
