import { useState } from 'react'
import { RefreshCw, ArrowRight, Check, Loader2, AlertTriangle, Calendar, Type, Copy, SplitSquareHorizontal, Info, ShieldX } from 'lucide-react'
import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, DrawerTitle, DrawerClose } from '../ui/drawer'
import { Button } from '../ui/Button'
import { type IssueType, type QualityIssue, ISSUE_META, buildFixForIssue } from '../../hooks/useContactQuality'
import type { useContactQuality } from '../../hooks/useContactQuality'

const ISSUE_ICONS: Record<IssueType, React.ReactNode> = {
    nome_duplicado:        <Copy className="h-4 w-4" />,
    nome_completo_no_nome: <SplitSquareHorizontal className="h-4 w-4" />,
    nome_maiusculo:        <Type className="h-4 w-4" />,
    nome_minusculo:        <Type className="h-4 w-4" />,
    cpf_invalido:          <ShieldX className="h-4 w-4" />,
    nascimento_invalido:   <Calendar className="h-4 w-4" />,
    sem_nascimento:        <Calendar className="h-4 w-4" />,
}

const ISSUE_ORDER: IssueType[] = [
    'nome_duplicado',
    'nome_completo_no_nome',
    'nome_maiusculo',
    'nome_minusculo',
    'cpf_invalido',
    'nascimento_invalido',
    'sem_nascimento',
]

const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    icon: 'text-red-500' },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  icon: 'text-amber-500' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: 'text-orange-500' },
    slate:  { bg: 'bg-slate-50',  border: 'border-slate-200',  text: 'text-slate-500',  icon: 'text-slate-400' },
}

interface DataQualityDrawerProps {
    isOpen: boolean
    onClose: () => void
    quality: ReturnType<typeof useContactQuality>
    onApplied: () => void
}

function formatName(nome: string | null, sobrenome: string | null): string {
    return [nome, sobrenome].filter(Boolean).join(' ') || '(sem nome)'
}

export function DataQualityDrawer({ isOpen, onClose, quality, onApplied }: DataQualityDrawerProps) {
    const [selectedType, setSelectedType] = useState<IssueType | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    const activeTypes = ISSUE_ORDER.filter(type => (quality.counts.get(type) ?? 0) > 0)

    const isInfoOnly = selectedType === 'sem_nascimento'
    const totalCount = selectedType ? (quality.counts.get(selectedType) ?? 0) : 0
    const loadedDetails = quality.loadedType === selectedType ? quality.typeDetails : []
    const isPartial = totalCount > loadedDetails.length

    const toggleId = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleAll = () => {
        if (selectedIds.size === loadedDetails.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(loadedDetails.map(i => i.contact_id)))
        }
    }

    const handleSelectType = (type: IssueType) => {
        setSelectedType(type)
        setSelectedIds(new Set())
        quality.fetchTypeDetails(type)
    }

    const handleApplySelected = async () => {
        const selected = loadedDetails.filter(i => selectedIds.has(i.contact_id))
        const fixes = selected
            .filter(i => i.issue_type !== 'sem_nascimento')
            .map(i => buildFixForIssue(i))
        await quality.applyFixes(fixes)
        setSelectedIds(new Set())
        onApplied()
    }

    const handleApplyAllLoaded = async () => {
        if (!selectedType) return
        await quality.applyAllLoaded()
        setSelectedIds(new Set())
        if ((quality.counts.get(selectedType) ?? 0) === 0) {
            setSelectedType(null)
        }
        onApplied()
    }

    return (
        <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="max-w-3xl">
                <DrawerHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <DrawerTitle>Qualidade dos Dados</DrawerTitle>
                            <p className="text-sm text-slate-500 mt-1">
                                Revise e corrija problemas detectados nos contatos
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => quality.runAudit()}
                            disabled={quality.isLoading}
                            className="h-8"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${quality.isLoading ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                    </div>
                    <DrawerClose onClick={onClose} />
                </DrawerHeader>

                <DrawerBody>
                    {quality.isLoading && activeTypes.length === 0 ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                            <span className="ml-3 text-sm text-slate-500">Analisando contatos...</span>
                        </div>
                    ) : quality.totalIssueCount === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Check className="h-10 w-10 text-green-500 mb-3" />
                            <p className="text-lg font-medium text-slate-900">Tudo certo!</p>
                            <p className="text-sm text-slate-500 mt-1">Nenhum problema de qualidade detectado.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Summary Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {activeTypes.map(type => {
                                    const count = quality.counts.get(type) ?? 0
                                    const meta = ISSUE_META[type]
                                    const colors = COLOR_CLASSES[meta.color] || COLOR_CLASSES.slate
                                    const isActive = selectedType === type

                                    return (
                                        <button
                                            key={type}
                                            onClick={() => handleSelectType(type)}
                                            className={`p-3 rounded-lg border text-left transition-all ${
                                                isActive
                                                    ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200'
                                                    : `${colors.bg} ${colors.border} hover:ring-1 hover:ring-slate-300`
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={isActive ? 'text-indigo-500' : colors.icon}>
                                                    {ISSUE_ICONS[type]}
                                                </span>
                                                <span className="text-xs font-medium text-slate-500 truncate">
                                                    {meta.label}
                                                </span>
                                            </div>
                                            <div className="text-xl font-bold text-slate-900">
                                                {count.toLocaleString('pt-BR')}
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Detail Table */}
                            {selectedType && (
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    {/* Table Header */}
                                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                                        <div className="flex items-center gap-3">
                                            {!isInfoOnly && !quality.isLoadingDetails && loadedDetails.length > 0 && (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.size === loadedDetails.length && loadedDetails.length > 0}
                                                    onChange={toggleAll}
                                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                            )}
                                            <span className="text-sm font-medium text-slate-700">
                                                {ISSUE_META[selectedType].label}
                                                <span className="text-slate-400 ml-1.5">
                                                    ({totalCount.toLocaleString('pt-BR')})
                                                </span>
                                            </span>
                                            {isPartial && !quality.isLoadingDetails && (
                                                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                                    Mostrando {loadedDetails.length.toLocaleString('pt-BR')} de {totalCount.toLocaleString('pt-BR')}
                                                </span>
                                            )}
                                        </div>
                                        {!isInfoOnly && selectedIds.size > 0 && (
                                            <span className="text-xs text-indigo-600 font-medium">
                                                {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>

                                    {/* Rows */}
                                    {quality.isLoadingDetails ? (
                                        <div className="flex items-center justify-center py-12">
                                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                            <span className="ml-2 text-sm text-slate-500">Carregando detalhes...</span>
                                        </div>
                                    ) : loadedDetails.length === 0 ? (
                                        <div className="flex items-center justify-center py-8 text-sm text-slate-400">
                                            Nenhum detalhe encontrado
                                        </div>
                                    ) : (
                                        <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-100">
                                            {loadedDetails.map(issue => (
                                                <IssueRow
                                                    key={issue.contact_id}
                                                    issue={issue}
                                                    isInfoOnly={isInfoOnly}
                                                    isSelected={selectedIds.has(issue.contact_id)}
                                                    onToggle={() => toggleId(issue.contact_id)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {!selectedType && (
                                <div className="flex items-center justify-center py-6">
                                    <Info className="h-5 w-5 text-slate-300 mr-2" />
                                    <p className="text-sm text-slate-400">Selecione uma categoria acima para ver os detalhes</p>
                                </div>
                            )}
                        </div>
                    )}
                </DrawerBody>

                {selectedType && !isInfoOnly && loadedDetails.length > 0 && !quality.isLoadingDetails && (
                    <DrawerFooter>
                        <div className="flex items-center gap-3 w-full">
                            <Button
                                variant="outline"
                                onClick={handleApplySelected}
                                disabled={selectedIds.size === 0 || quality.isApplying}
                                className="flex-1"
                            >
                                {quality.isApplying ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <Check className="h-4 w-4 mr-2" />
                                )}
                                Aplicar Selecionados ({selectedIds.size})
                            </Button>
                            <Button
                                onClick={handleApplyAllLoaded}
                                disabled={quality.isApplying}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                {quality.isApplying ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : null}
                                Corrigir {isPartial ? `${loadedDetails.length.toLocaleString('pt-BR')} carregados` : `Todos (${loadedDetails.length.toLocaleString('pt-BR')})`}
                            </Button>
                        </div>
                        {isPartial && (
                            <p className="text-xs text-slate-400 text-center mt-2">
                                Após corrigir, clique em &quot;Atualizar&quot; para carregar o próximo lote.
                            </p>
                        )}
                    </DrawerFooter>
                )}
            </DrawerContent>
        </Drawer>
    )
}

function formatDate(date: string | null): string {
    if (!date) return ''
    const d = new Date(date + 'T00:00:00')
    return d.toLocaleDateString('pt-BR')
}

/** Mostra a mudança de um campo individual (atual → sugerido) */
function FieldChange({ label, current, suggested }: {
    label: string
    current: string | null
    suggested: string | null
}) {
    const cur = current?.trim() || null
    const sug = suggested?.trim() || null
    const changed = (cur || '') !== (sug || '')

    if (!changed) {
        // Campo não muda — mostrar em cinza discreto
        if (!cur) return null
        return (
            <span className="text-xs text-slate-400">
                <span className="font-medium text-slate-500">{label}:</span>{' '}
                {cur} <span className="text-slate-300 italic ml-1">igual</span>
            </span>
        )
    }

    return (
        <span className="text-xs">
            <span className="font-medium text-slate-500">{label}:</span>{' '}
            {cur ? (
                <span className="text-red-400 line-through">{cur}</span>
            ) : (
                <span className="text-slate-300 italic">(vazio)</span>
            )}
            <ArrowRight className="h-3 w-3 text-slate-300 inline mx-1 -mt-0.5" />
            {sug ? (
                <span className="font-medium text-green-700">{sug}</span>
            ) : (
                <span className="text-amber-600 italic">(limpar)</span>
            )}
        </span>
    )
}

function IssueRow({ issue, isInfoOnly, isSelected, onToggle }: {
    issue: QualityIssue
    isInfoOnly: boolean
    isSelected: boolean
    onToggle: () => void
}) {
    const currentName = formatName(issue.contact_nome, issue.contact_sobrenome)
    const isDateIssue = issue.issue_type === 'nascimento_invalido'
    const isCpfIssue = issue.issue_type === 'cpf_invalido'
    const isNameIssue = !isInfoOnly && !isDateIssue && !isCpfIssue

    return (
        <div className={`flex items-start gap-3 px-4 py-3 ${isInfoOnly ? 'opacity-60' : 'hover:bg-slate-50'}`}>
            {!isInfoOnly && (
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggle}
                    className="h-4 w-4 mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                />
            )}
            {isInfoOnly && <Info className="h-4 w-4 mt-0.5 text-slate-300 flex-shrink-0" />}

            <div className="flex-1 min-w-0 space-y-1">
                {isNameIssue ? (
                    <div className="flex flex-col gap-1">
                        <FieldChange
                            label="Nome"
                            current={issue.contact_nome}
                            suggested={issue.suggested_nome}
                        />
                        <FieldChange
                            label="Sobrenome"
                            current={issue.contact_sobrenome}
                            suggested={issue.suggested_sobrenome}
                        />
                    </div>
                ) : isDateIssue ? (
                    <div className="space-y-1">
                        <span className="text-sm text-slate-900 truncate block">{currentName}</span>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 flex-shrink-0">
                                <AlertTriangle className="h-3 w-3 inline mr-1" />
                                {issue.issue_description}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                            {issue.suggested_data_nascimento ? (
                                <span className="text-xs font-medium text-green-700">
                                    Corrigir para {formatDate(issue.suggested_data_nascimento)}
                                </span>
                            ) : (
                                <span className="text-xs font-medium text-amber-700">Limpar data</span>
                            )}
                        </div>
                    </div>
                ) : isCpfIssue ? (
                    <div className="space-y-1">
                        <span className="text-sm text-slate-900 truncate block">{currentName}</span>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 font-mono flex-shrink-0">
                                <ShieldX className="h-3 w-3 inline mr-1" />
                                CPF: {issue.contact_cpf}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                            <span className="text-xs font-medium text-amber-700">Limpar CPF</span>
                        </div>
                    </div>
                ) : (
                    <div>
                        <span className="text-sm text-slate-500">{currentName}</span>
                        <span className="text-xs text-slate-400 ml-2">{issue.issue_description}</span>
                    </div>
                )}

                {/* Identificadores */}
                <div className="flex items-center gap-3">
                    {issue.contact_cpf && !isCpfIssue && (
                        <span className="text-xs text-slate-400">CPF: {issue.contact_cpf}</span>
                    )}
                    {issue.contact_email && (
                        <span className="text-xs text-slate-400">{issue.contact_email}</span>
                    )}
                </div>
            </div>
        </div>
    )
}
