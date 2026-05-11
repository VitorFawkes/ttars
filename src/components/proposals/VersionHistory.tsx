import { useState } from 'react'
import { useProposalVersions } from '@/hooks/useProposal'
import { Button } from '@/components/ui/Button'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
    History,
    ChevronRight,
    Clock,
    CheckCircle,
    FileText,
    ArrowLeft,
    Loader2,
    X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProposalVersion } from '@/types/proposals'

interface VersionHistoryProps {
    proposalId: string
    currentVersionId: string | null
    onClose?: () => void
}

const VERSION_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
    draft: { label: 'Rascunho', color: 'text-slate-600', bgColor: 'bg-slate-100' },
    pending: { label: 'Pendente', color: 'text-amber-600', bgColor: 'bg-amber-100' },
    approved: { label: 'Aprovada', color: 'text-green-600', bgColor: 'bg-green-100' },
    rejected: { label: 'Rejeitada', color: 'text-red-600', bgColor: 'bg-red-100' },
}

export function VersionHistory({ proposalId, currentVersionId, onClose }: VersionHistoryProps) {
    const { data: versions = [], isLoading } = useProposalVersions(proposalId)
    const [selectedVersion, setSelectedVersion] = useState<ProposalVersion | null>(null)

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        )
    }

    if (selectedVersion) {
        return (
            <VersionDetail
                version={selectedVersion}
                isCurrent={selectedVersion.id === currentVersionId}
                onBack={() => setSelectedVersion(null)}
            />
        )
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-none h-12 px-4 flex items-center justify-between border-b border-slate-200">
                <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-slate-500" />
                    <h3 className="font-medium text-slate-900 text-sm">Histórico de Versões</h3>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-slate-100 rounded transition-colors"
                    >
                        <X className="h-4 w-4 text-slate-400" />
                    </button>
                )}
            </div>

            {/* Version List */}
            <div className="flex-1 overflow-y-auto">
                {versions.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">
                        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Nenhuma versão encontrada</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {versions.map((version) => {
                            const isCurrent = version.id === currentVersionId
                            const versionStatus = (version as any).status || 'draft'
                            const statusConfig = VERSION_STATUS_CONFIG[versionStatus] || VERSION_STATUS_CONFIG.draft

                            return (
                                <button
                                    key={version.id}
                                    onClick={() => setSelectedVersion(version)}
                                    className={cn(
                                        'w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors group',
                                        isCurrent && 'bg-blue-50/50'
                                    )}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            {/* Version Title */}
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium text-sm text-slate-900">
                                                    v{version.version_number}
                                                </span>
                                                {isCurrent && (
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                                        Atual
                                                    </span>
                                                )}
                                                <span className={cn(
                                                    'text-[10px] px-1.5 py-0.5 rounded',
                                                    statusConfig.bgColor,
                                                    statusConfig.color
                                                )}>
                                                    {statusConfig.label}
                                                </span>
                                            </div>

                                            {/* Title */}
                                            <p className="text-sm text-slate-700 truncate mb-1">
                                                {version.title || 'Sem título'}
                                            </p>

                                            {/* Meta */}
                                            <div className="flex items-center gap-3 text-xs text-slate-400">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {formatDistanceToNow(new Date(version.created_at!), {
                                                        addSuffix: true,
                                                        locale: ptBR,
                                                    })}
                                                </span>
                                            </div>
                                        </div>

                                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors mt-1" />
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex-none p-4 border-t border-slate-200 bg-slate-50">
                <p className="text-xs text-slate-500 text-center">
                    {versions.length} versão{versions.length !== 1 ? 'ões' : ''} encontrada{versions.length !== 1 ? 's' : ''}
                </p>
            </div>
        </div>
    )
}

interface VersionDetailProps {
    version: ProposalVersion
    isCurrent: boolean
    onBack: () => void
}

function VersionDetail({ version, isCurrent, onBack }: VersionDetailProps) {
    const versionStatus = (version as any).status || 'draft'
    const statusConfig = VERSION_STATUS_CONFIG[versionStatus] || VERSION_STATUS_CONFIG.draft

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-none h-12 px-4 flex items-center gap-2 border-b border-slate-200">
                <button
                    onClick={onBack}
                    className="p-1 hover:bg-slate-100 rounded transition-colors"
                >
                    <ArrowLeft className="h-4 w-4 text-slate-500" />
                </button>
                <h3 className="font-medium text-slate-900 text-sm">
                    Versão {version.version_number}
                </h3>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {/* Status Badge */}
                <div className="flex items-center gap-2 mb-6">
                    {isCurrent && (
                        <span className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                            <CheckCircle className="h-3 w-3" />
                            Versão Ativa
                        </span>
                    )}
                    <span className={cn(
                        'text-xs px-2 py-1 rounded-full',
                        statusConfig.bgColor,
                        statusConfig.color
                    )}>
                        {statusConfig.label}
                    </span>
                </div>

                {/* Info Cards */}
                <div className="space-y-4">
                    {/* Title */}
                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                            <FileText className="h-3 w-3" />
                            Título
                        </div>
                        <p className="font-medium text-slate-900">
                            {version.title || 'Sem título'}
                        </p>
                    </div>

                    {/* Created At */}
                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                            <Clock className="h-3 w-3" />
                            Criada em
                        </div>
                        <p className="font-medium text-slate-900">
                            {new Date(version.created_at!).toLocaleString('pt-BR')}
                        </p>
                    </div>

                    {/* Version Number */}
                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                            <History className="h-3 w-3" />
                            Número da Versão
                        </div>
                        <p className="font-medium text-slate-900">
                            v{version.version_number}
                        </p>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex-none p-4 border-t border-slate-200 bg-slate-50">
                {!isCurrent && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled
                    >
                        Restaurar esta versão (em breve)
                    </Button>
                )}
            </div>
        </div>
    )
}
