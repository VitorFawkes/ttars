import { Loader2, AlertTriangle, Info, UserCheck, Plus, ArrowRight, CheckCircle } from 'lucide-react'
import type { DuplicateMatch } from '../../hooks/useDuplicateDetection'
import { cn } from '../../lib/utils'

const MATCH_LABELS: Record<string, string> = {
    cpf: 'CPF idêntico',
    email: 'Email idêntico',
    telefone: 'Telefone idêntico',
    nome: 'Nome idêntico',
}

interface MergeableField {
    field: string
    label: string
    value: string
}

interface DuplicateWarningPanelProps {
    duplicates: DuplicateMatch[]
    isChecking: boolean
    /** Dados que o usuário digitou no form (para calcular o que pode ser mesclado) */
    newData?: { email?: string | null; telefone?: string | null; cpf?: string | null }
    onSelectExisting: (contactId: string, mergeData?: Record<string, string | null>) => void
    onDismiss?: () => void
    mode?: 'full' | 'compact'
    noDuplicatesFound?: boolean
}

function getMergeableFields(
    duplicate: DuplicateMatch,
    newData?: DuplicateWarningPanelProps['newData']
): MergeableField[] {
    if (!newData) return []
    const fields: MergeableField[] = []

    if (newData.email?.trim() && !duplicate.contact_email) {
        fields.push({ field: 'email', label: 'Email', value: newData.email.trim() })
    }
    if (newData.telefone?.trim() && !duplicate.contact_telefone) {
        fields.push({ field: 'telefone', label: 'Telefone', value: newData.telefone.trim() })
    }
    if (newData.cpf?.trim() && !duplicate.contact_cpf) {
        fields.push({ field: 'cpf', label: 'CPF', value: newData.cpf.trim() })
    }

    return fields
}

function formatContactName(d: DuplicateMatch): string {
    return [d.contact_nome, d.contact_sobrenome].filter(Boolean).join(' ') || 'Sem Nome'
}

export default function DuplicateWarningPanel({
    duplicates,
    isChecking,
    newData,
    onSelectExisting,
    onDismiss,
    mode = 'full',
    noDuplicatesFound,
}: DuplicateWarningPanelProps) {
    if (!isChecking && duplicates.length === 0 && !noDuplicatesFound) return null

    const isHighConfidence = duplicates.some(d => d.match_type === 'cpf' || d.match_type === 'email')

    if (isChecking && duplicates.length === 0) {
        return (
            <div className="flex items-center gap-2 py-2 px-3 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Verificando duplicados...
            </div>
        )
    }

    if (noDuplicatesFound && duplicates.length === 0 && !isChecking) {
        return (
            <div className="flex items-center gap-2 py-2 px-3 text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-3.5 w-3.5" />
                Nenhum duplicado encontrado
            </div>
        )
    }

    if (mode === 'compact') {
        return (
            <div className={cn(
                'rounded-lg border p-3 space-y-2',
                isHighConfidence
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-blue-50 border-blue-200'
            )}>
                <div className="flex items-center gap-1.5 text-xs font-medium">
                    {isHighConfidence ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                        <Info className="h-3.5 w-3.5 text-blue-600" />
                    )}
                    <span className={isHighConfidence ? 'text-amber-800' : 'text-blue-800'}>
                        {duplicates.length === 1 ? 'Possível duplicado' : `${duplicates.length} possíveis duplicados`}
                    </span>
                    {isChecking && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
                </div>

                {duplicates.slice(0, 2).map(d => (
                    <button
                        key={d.contact_id}
                        type="button"
                        onClick={() => onSelectExisting(d.contact_id)}
                        className={cn(
                            'w-full flex items-center justify-between p-2 rounded-md text-left transition-colors',
                            isHighConfidence
                                ? 'hover:bg-amber-100/60'
                                : 'hover:bg-blue-100/60'
                        )}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <div className={cn(
                                'h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0',
                                isHighConfidence
                                    ? 'bg-amber-200 text-amber-800'
                                    : 'bg-blue-200 text-blue-800'
                            )}>
                                {(d.contact_nome || 'S').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">
                                    {formatContactName(d)}
                                </p>
                                <p className={cn(
                                    'text-xs',
                                    isHighConfidence ? 'text-amber-700' : 'text-blue-700'
                                )}>
                                    {MATCH_LABELS[d.match_type] || d.match_type}
                                </p>
                            </div>
                        </div>
                        <UserCheck className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    </button>
                ))}
            </div>
        )
    }

    // Full mode
    return (
        <div className={cn(
            'rounded-xl border p-4 space-y-3',
            isHighConfidence
                ? 'bg-amber-50 border-amber-300'
                : 'bg-blue-50 border-blue-200'
        )}>
            <div className="flex items-center gap-2">
                {isHighConfidence ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                ) : (
                    <Info className="h-4 w-4 text-blue-600" />
                )}
                <span className={cn(
                    'text-sm font-medium',
                    isHighConfidence ? 'text-amber-800' : 'text-blue-800'
                )}>
                    {duplicates.length === 1
                        ? 'Possível duplicado encontrado'
                        : `${duplicates.length} possíveis duplicados encontrados`
                    }
                </span>
                {isChecking && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            </div>

            <div className="space-y-2">
                {duplicates.slice(0, 3).map(d => {
                    const mergeableFields = getMergeableFields(d, newData)
                    const mergeData: Record<string, string | null> = {}
                    mergeableFields.forEach(f => { mergeData[f.field] = f.value })

                    return (
                        <div
                            key={d.contact_id}
                            className="bg-white rounded-lg border border-slate-200 p-3 space-y-2"
                        >
                            {/* Contact info */}
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    'h-9 w-9 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0',
                                    isHighConfidence
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-blue-100 text-blue-700'
                                )}>
                                    {(d.contact_nome || 'S').charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-900 truncate">
                                        {formatContactName(d)}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                                        {d.contact_email && <span>{d.contact_email}</span>}
                                        {d.contact_email && d.contact_telefone && <span>·</span>}
                                        {d.contact_telefone && <span>{d.contact_telefone}</span>}
                                    </div>
                                    {d.contact_cpf && (
                                        <p className="text-xs text-slate-400 mt-0.5">CPF: {d.contact_cpf}</p>
                                    )}
                                </div>
                                <span className={cn(
                                    'text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0',
                                    isHighConfidence
                                        ? 'bg-amber-200 text-amber-800'
                                        : 'bg-blue-200 text-blue-800'
                                )}>
                                    {MATCH_LABELS[d.match_type] || d.match_type}
                                </span>
                            </div>

                            {/* Mergeable fields */}
                            {mergeableFields.length > 0 && (
                                <div className="bg-green-50 border border-green-200 rounded-md p-2 space-y-1">
                                    <p className="text-xs font-medium text-green-800">
                                        Dados novos que podem ser adicionados:
                                    </p>
                                    {mergeableFields.map(f => (
                                        <div key={f.field} className="flex items-center gap-1.5 text-xs text-green-700">
                                            <Plus className="h-3 w-3" />
                                            <span className="font-medium">{f.label}:</span>
                                            <span>{f.value}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => onSelectExisting(
                                        d.contact_id,
                                        mergeableFields.length > 0 ? mergeData : undefined
                                    )}
                                    className={cn(
                                        'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                                        mergeableFields.length > 0
                                            ? 'bg-green-600 hover:bg-green-700 text-white'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                    )}
                                >
                                    {mergeableFields.length > 0 ? (
                                        <>
                                            <ArrowRight className="h-3.5 w-3.5" />
                                            Abrir e mesclar dados
                                        </>
                                    ) : (
                                        <>
                                            <UserCheck className="h-3.5 w-3.5" />
                                            Usar este contato
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Dismiss option */}
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    className="w-full text-center text-xs text-slate-500 hover:text-slate-700 py-1 transition-colors"
                >
                    Ignorar e criar novo contato mesmo assim
                </button>
            )}
        </div>
    )
}
