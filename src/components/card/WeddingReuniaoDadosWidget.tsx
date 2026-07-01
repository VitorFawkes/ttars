import { CalendarClock, ExternalLink } from 'lucide-react'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import type { Database } from '@/database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface WeddingReuniaoDadosWidgetProps {
    cardId: string
    card: Card
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

type FieldKind = 'datetime' | 'date' | 'bool' | 'link' | 'text'

interface DataRow {
    key: string
    label: string
    kind: FieldKind
}

// Infos que deixaram de ser campo editável e agora são dado (vêm de tarefa de
// reunião / Calendly / log de etapa). Aqui só EXIBIMOS, sem editar.
const GRUPO_SDR: DataRow[] = [
    { key: 'ww_sdr_data_reuniao', label: 'Data da 1ª reunião', kind: 'datetime' },
    { key: 'ww_sdr_como_reuniao', label: 'Como foi feita a 1ª reunião', kind: 'text' },
    { key: 'ww_sdr_link_reuniao', label: 'Link da reunião', kind: 'link' },
    { key: 'ww_sdr_agendamento_closer', label: 'Agendamento com a Closer', kind: 'datetime' },
    { key: 'ww_sdr_data_qualificacao', label: 'Qualificado em', kind: 'datetime' },
]

const GRUPO_CLOSER: DataRow[] = [
    { key: 'ww_closer_data_reuniao', label: 'Data da reunião Closer', kind: 'datetime' },
    { key: 'ww_closer_como_reuniao', label: 'Como foi feita a reunião Closer', kind: 'text' },
    { key: 'ww_sdr_tipo_reuniao_closer', label: 'Tipo da reunião com a Closer', kind: 'text' },
    { key: 'ww_closer_segunda_reuniao', label: 'Fez 2ª reunião?', kind: 'bool' },
    { key: 'ww_closer_link_reuniao', label: 'Link da reunião Closer', kind: 'link' },
    { key: 'ww_closer_data_ganho', label: 'Ganho em', kind: 'date' },
]

const GRUPO_GERAL: DataRow[] = [
    { key: 'ww_plan_qtd_reunioes', label: 'Reuniões realizadas', kind: 'text' },
]

// data_reuniao & afins são wall-clock de São Paulo (ISO sem fuso). NÃO converter
// timezone — formatamos os componentes da string direto pra não deslocar 3h.
function formatDateTime(raw: string, withTime: boolean): string {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
    if (!m) return raw
    const [, y, mo, d, hh, mm] = m
    const dateStr = `${d}/${mo}/${y}`
    if (withTime && hh && mm) return `${dateStr} ${hh}:${mm}`
    return dateStr
}

function formatBool(raw: unknown): string {
    const s = String(raw).trim().toLowerCase()
    if (['true', 'sim', 't', '1', 'yes'].includes(s)) return 'Sim'
    if (['false', 'não', 'nao', 'f', '0', 'no'].includes(s)) return 'Não'
    return String(raw)
}

function isEmpty(v: unknown): boolean {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

function renderValue(row: DataRow, value: unknown) {
    if (row.kind === 'link') {
        const href = String(value)
        const isUrl = /^https?:\/\//i.test(href)
        if (isUrl) {
            return (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
                >
                    Abrir <ExternalLink className="h-3 w-3" />
                </a>
            )
        }
        return <span className="text-slate-700 break-all">{href}</span>
    }
    if (row.kind === 'datetime') return <span className="text-slate-800">{formatDateTime(String(value), true)}</span>
    if (row.kind === 'date') return <span className="text-slate-800">{formatDateTime(String(value), false)}</span>
    if (row.kind === 'bool') return <span className="text-slate-800">{formatBool(value)}</span>
    return <span className="text-slate-800">{String(value)}</span>
}

function Grupo({ titulo, rows, data }: { titulo: string; rows: DataRow[]; data: Record<string, unknown> }) {
    const preenchidos = rows.filter(r => !isEmpty(data[r.key]))
    if (preenchidos.length === 0) return null
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{titulo}</p>
            <dl className="space-y-1.5">
                {preenchidos.map(row => (
                    <div key={row.key} className="flex items-start justify-between gap-3 text-sm">
                        <dt className="text-slate-500 shrink-0">{row.label}</dt>
                        <dd className="text-right min-w-0">{renderValue(row, data[row.key])}</dd>
                    </div>
                ))}
            </dl>
        </div>
    )
}

export default function WeddingReuniaoDadosWidget({ card, isExpanded, onToggleCollapse }: WeddingReuniaoDadosWidgetProps) {
    const data = ((card.produto_data as Record<string, unknown> | null) ?? {})

    const temAlgo =
        [...GRUPO_SDR, ...GRUPO_CLOSER, ...GRUPO_GERAL].some(r => !isEmpty(data[r.key]))

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div
                className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-violet-50 cursor-pointer"
                onClick={onToggleCollapse}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <CalendarClock className="h-4 w-4 text-violet-700" />
                    <h3 className="text-sm font-semibold text-violet-700">Reunião & Qualificação</h3>
                </div>
                <SectionCollapseToggle isExpanded={!!isExpanded} onToggle={() => onToggleCollapse?.()} />
            </div>

            <div className="p-4 space-y-4">
                <p className="text-xs text-slate-400 -mt-1">
                    Registros da reunião e da qualificação (vêm das tarefas e do avanço de etapa — só leitura).
                </p>
                {temAlgo ? (
                    <>
                        <Grupo titulo="SDR" rows={GRUPO_SDR} data={data} />
                        <Grupo titulo="Closer" rows={GRUPO_CLOSER} data={data} />
                        <Grupo titulo="Planejamento" rows={GRUPO_GERAL} data={data} />
                    </>
                ) : (
                    <p className="text-sm text-slate-400">Ainda sem dados de reunião ou qualificação.</p>
                )}
            </div>
        </div>
    )
}
