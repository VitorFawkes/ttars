import { useState } from 'react'
import { ArrowRight, Check, CheckCircle2, Circle, Lock, PartyPopper } from 'lucide-react'
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

export function EtapaPanel({ wedding }: { wedding: WeddingPlanejamento }) {
  const update = useUpdatePlanejamentoEtapa()
  const { save } = usePlanejamentoCampos()
  const etapa = wedding.planejamentoEtapa
  const gate = wedding.gate
  const next = nextEtapa(etapa)
  const campos = CAMPOS_POR_ETAPA[etapa]

  const saveField = (key: string, value: unknown) => {
    save.mutate({ cardId: wedding.id, values: { [key]: value } })
  }

  const handleAdvance = () => {
    if (!next) return
    if (!gate.allOk) {
      toast.error('Cumpra os itens da trava antes de avançar.')
      return
    }
    update.mutate({ cardId: wedding.id, etapa: next })
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-amber-50/60 to-white">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">Etapa atual</p>
            <h2 className="text-base font-bold text-slate-900">{PLANEJAMENTO_LABEL[etapa]}</h2>
          </div>
          {next ? (
            <button
              type="button"
              onClick={handleAdvance}
              disabled={!gate.allOk || update.isPending}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-semibold transition-colors',
                gate.allOk
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed',
              )}
              title={gate.allOk ? '' : 'Cumpra a trava para liberar'}
            >
              {gate.allOk ? <ArrowRight className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              Avançar para {PLANEJAMENTO_LABEL[next]}
            </button>
          ) : gate.allOk ? (
            <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <PartyPopper className="w-4 h-4" /> Pronto para Produção
            </span>
          ) : null}
        </div>
        <p className="text-xs text-slate-500 mt-1.5">{PLANEJAMENTO_OBJETIVO[etapa]}</p>
      </div>

      {/* Trava / checklist da etapa */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">O que falta para avançar</h3>
          <span
            className={cn(
              'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
              gate.allOk
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200',
            )}
          >
            {gate.met}/{gate.total} {gate.allOk ? '— liberado' : '— bloqueado'}
          </span>
        </div>
        <ul className="space-y-1.5">
          {gate.criteria.map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-sm">
              {c.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
              )}
              <span className={cn(c.ok ? 'text-slate-500 line-through' : 'text-slate-700')}>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Campos desta etapa */}
      {campos.length > 0 && (
        <div className="px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2.5">Campos desta etapa</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {campos.map((c) => (
              <CampoField key={c.key} def={c} value={readVal(wedding.produto_data, c.key)} onSave={saveField} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

const FIELD_CLS =
  'w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'

function CampoField({
  def,
  value,
  onSave,
}: {
  def: CampoDef
  value: string
  onSave: (key: string, value: unknown) => void
}) {
  const [local, setLocal] = useState(value)

  if (def.type === 'readonly') {
    return (
      <div className="min-w-0">
        <label className="text-xs font-medium text-slate-700 block">{def.label}</label>
        <p className="mt-1 px-3 py-2 text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-md truncate">
          {value || '—'}
        </p>
      </div>
    )
  }

  if (def.type === 'bool') {
    const checked = value === 'true'
    return (
      <label className="flex items-center gap-2.5 cursor-pointer select-none sm:col-span-2">
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
      <label className="text-xs font-medium text-slate-700 block">
        {def.label}
        <select
          value={value}
          onChange={(e) => onSave(def.key, e.target.value)}
          className={FIELD_CLS}
        >
          <option value="">— selecionar —</option>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  // text | date | number | datetime-local
  return (
    <label className="text-xs font-medium text-slate-700 block">
      {def.label}
      <input
        type={def.type === 'text' ? 'text' : def.type}
        inputMode={def.type === 'number' ? 'decimal' : undefined}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onSave(def.key, local.trim())
        }}
        className={FIELD_CLS}
      />
    </label>
  )
}
