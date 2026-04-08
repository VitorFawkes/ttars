/**
 * PendingTab — Aba "Pendente" do portal do cliente.
 * Mostra itens enviados pelo planner para aprovação.
 */

import { useState } from 'react'

import { useResolveApproval } from '@/hooks/useTripPlanApprovals'
import {
    Bell,
    Check,
    X,
    Loader2,
    MessageCircle,
} from 'lucide-react'

interface Approval {
    id: string
    title: string
    description: string | null
    approval_data: Record<string, unknown>
    status: string
    created_at: string
}

interface PendingTabProps {
    approvals: Approval[]
    token: string
}

export function PendingTab({ approvals, token }: PendingTabProps) {
    const pending = approvals.filter(a => a.status === 'pending')

    if (pending.length === 0) {
        return (
            <div className="text-center py-20 px-4">
                <Bell className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Nenhuma atualização pendente
                </h3>
                <p className="text-sm text-slate-500">
                    Quando sua consultora enviar uma alteração, ela aparecerá aqui
                    para sua aprovação.
                </p>
            </div>
        )
    }

    return (
        <div className="px-4 py-4 space-y-4">
            {/* Banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <Bell className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                    <p className="text-sm font-semibold text-amber-900">
                        Sua consultora enviou {pending.length} {pending.length === 1 ? 'atualização' : 'atualizações'}
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                        Revise e aprove ou recuse cada item abaixo.
                    </p>
                </div>
            </div>

            {/* Approval cards */}
            {pending.map(approval => (
                <ApprovalCard key={approval.id} approval={approval} token={token} />
            ))}
        </div>
    )
}

function ApprovalCard({ approval, token }: { approval: Approval; token: string }) {
    const [notes, setNotes] = useState('')
    const [showNotes, setShowNotes] = useState(false)
    const resolve = useResolveApproval()

    const handleAction = (action: 'approve' | 'reject') => {
        resolve.mutate({
            token,
            approvalId: approval.id,
            action,
            notes: notes || undefined,
        })
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4">
                <h3 className="text-sm font-semibold text-slate-900">{approval.title}</h3>
                {approval.description && (
                    <p className="text-xs text-slate-500 mt-1">{approval.description}</p>
                )}
                <p className="text-[10px] text-slate-400 mt-2">
                    Enviado em {new Date(approval.created_at).toLocaleDateString('pt-BR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </p>
            </div>

            {/* Notes */}
            {showNotes && (
                <div className="px-4 pb-3">
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Deixe um comentário (opcional)..."
                        rows={2}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
            )}

            {/* Actions */}
            <div className="flex border-t border-slate-100">
                <button
                    onClick={() => setShowNotes(!showNotes)}
                    className="flex-1 flex items-center justify-center gap-1 py-3 text-xs text-slate-500 hover:bg-slate-50"
                >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Comentar
                </button>
                <button
                    onClick={() => handleAction('reject')}
                    disabled={resolve.isPending}
                    className="flex-1 flex items-center justify-center gap-1 py-3 text-xs text-red-600 hover:bg-red-50 border-l border-slate-100"
                >
                    {resolve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    Recusar
                </button>
                <button
                    onClick={() => handleAction('approve')}
                    disabled={resolve.isPending}
                    className="flex-1 flex items-center justify-center gap-1 py-3 text-xs text-emerald-600 hover:bg-emerald-50 border-l border-slate-100 font-medium"
                >
                    {resolve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Aprovar
                </button>
            </div>
        </div>
    )
}
