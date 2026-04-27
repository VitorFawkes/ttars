import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, History, UserPlus, Pencil, Trash2, RotateCcw, Globe, Bot } from 'lucide-react'
import { useContatoChangeLog, type ContatoChangeLogEntry, type ContatoFieldChange } from '../../hooks/useContatoChangeLog'

const FIELD_LABELS: Record<string, string> = {
    nome: 'Nome',
    sobrenome: 'Sobrenome',
    email: 'Email',
    telefone: 'Telefone',
    cpf: 'CPF',
    rg: 'RG',
    passaporte: 'Passaporte',
    passaporte_validade: 'Validade do Passaporte',
    data_nascimento: 'Data de Nascimento',
    sexo: 'Sexo',
    tipo_pessoa: 'Tipo de Pessoa',
    tipo_cliente: 'Tipo de Cliente',
    observacoes: 'Observações',
    endereco: 'Endereço',
    origem: 'Origem',
    origem_detalhe: 'Detalhe da Origem',
    responsavel_id: 'Responsável',
}

const SOURCE_LABELS: Record<string, { label: string; icon: typeof Globe; color: string }> = {
    manual: { label: 'Edição manual', icon: Pencil, color: 'text-slate-600 bg-slate-100' },
    monde_import: { label: 'Importação Monde', icon: Globe, color: 'text-blue-600 bg-blue-50' },
    system: { label: 'Sistema', icon: Bot, color: 'text-purple-600 bg-purple-50' },
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'object') return JSON.stringify(value, null, 2)
    return String(value)
}

function FieldDiff({ field, change }: { field: string; change: ContatoFieldChange }) {
    const label = FIELD_LABELS[field] || field
    const fromText = formatValue(change.from)
    const toText = formatValue(change.to)
    const isJson = typeof change.from === 'object' || typeof change.to === 'object'

    return (
        <div className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="text-xs font-medium text-slate-500 mb-1.5">{label}</div>
            {isJson ? (
                <div className="space-y-1.5 text-xs font-mono">
                    <div>
                        <span className="text-slate-400">Antes:</span>
                        <pre className="mt-0.5 p-1.5 bg-red-50 text-red-900 rounded whitespace-pre-wrap break-all">{fromText}</pre>
                    </div>
                    <div>
                        <span className="text-slate-400">Depois:</span>
                        <pre className="mt-0.5 p-1.5 bg-emerald-50 text-emerald-900 rounded whitespace-pre-wrap break-all">{toText}</pre>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 line-through decoration-red-300/60">
                        {fromText}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                        {toText}
                    </span>
                </div>
            )}
        </div>
    )
}

function EventEntry({ entry }: { entry: ContatoChangeLogEntry }) {
    const sourceMeta = SOURCE_LABELS[entry.source] || SOURCE_LABELS.manual
    const SourceIcon = sourceMeta.icon
    const dateText = format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

    let icon = Pencil
    let title = 'Atualizado'
    let titleColor = 'text-slate-700'

    if (entry.event_type === 'created') {
        icon = UserPlus
        title = 'Contato criado'
        titleColor = 'text-emerald-700'
    } else if (entry.event_type === 'deleted') {
        icon = Trash2
        title = 'Contato removido'
        titleColor = 'text-red-700'
    } else if (entry.event_type === 'restored') {
        icon = RotateCcw
        title = 'Contato restaurado'
        titleColor = 'text-blue-700'
    }

    const EventIcon = icon
    const author = entry.changed_by_name || (entry.changed_by ? 'Usuário desconhecido' : null)

    return (
        <div className="relative pl-8">
            {/* Timeline dot */}
            <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center">
                <EventIcon className={`h-3 w-3 ${titleColor}`} />
            </div>

            <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className={`font-semibold ${titleColor}`}>{title}</span>
                    {author && (
                        <>
                            <span className="text-slate-400">por</span>
                            <span className="font-medium text-slate-700">{author}</span>
                        </>
                    )}
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${sourceMeta.color}`}>
                        <SourceIcon className="h-3 w-3" />
                        {sourceMeta.label}
                    </span>
                </div>

                <div className="text-xs text-slate-500">{dateText}</div>

                {entry.event_type === 'updated' && entry.changed_fields && (
                    <div className="space-y-2 mt-2">
                        {Object.entries(entry.changed_fields).map(([field, change]) => (
                            <FieldDiff key={field} field={field} change={change} />
                        ))}
                    </div>
                )}

                {entry.event_type === 'created' && entry.changed_fields && (
                    <div className="text-xs text-slate-500 bg-slate-50 rounded p-2 border border-slate-200">
                        Cadastrado com:{' '}
                        {[
                            entry.changed_fields.nome && `nome ${formatValue(entry.changed_fields.nome)}`,
                            entry.changed_fields.email && `email ${formatValue(entry.changed_fields.email)}`,
                            entry.changed_fields.telefone && `telefone ${formatValue(entry.changed_fields.telefone)}`,
                        ]
                            .filter(Boolean)
                            .join(', ') || '—'}
                    </div>
                )}
            </div>
        </div>
    )
}

export default function ContactChangeLogTab({ contatoId }: { contatoId: string }) {
    const { data: log, isLoading, error } = useContatoChangeLog(contatoId)

    if (isLoading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-8 text-sm text-red-600">
                Não foi possível carregar o histórico.
            </div>
        )
    }

    if (!log || log.length === 0) {
        return (
            <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma alteração registrada ainda.</p>
                <p className="text-xs mt-1 text-slate-400">
                    O histórico passa a contar a partir da próxima edição.
                </p>
            </div>
        )
    }

    return (
        <div className="relative space-y-6">
            {/* Vertical timeline line */}
            <div className="absolute left-3 top-3 bottom-3 w-px bg-slate-200" aria-hidden />
            {log.map((entry) => (
                <EventEntry key={entry.id} entry={entry} />
            ))}
        </div>
    )
}
