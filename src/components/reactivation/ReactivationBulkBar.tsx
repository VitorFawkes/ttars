import { useState } from 'react'
import { X, UserX, UserPlus, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReactivationActions, SUPPRESSION_REASON_LABELS, type SuppressionReason } from '@/hooks/useReactivationActions'
import { useReactivationFacets } from '@/hooks/useReactivationFacets'
import { useUsers } from '@/hooks/useUsers'
import { usePipelines } from '@/hooks/usePipelines'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'

interface Props {
    selectedIds: string[]
    onClear: () => void
    onCompleted: () => Promise<void>
}

type Mode = null | 'suppress' | 'assign' | 'create'

export default function ReactivationBulkBar({ selectedIds, onClear, onCompleted }: Props) {
    const [mode, setMode] = useState<Mode>(null)

    if (selectedIds.length === 0) return null

    return (
        <>
            <div className="sticky bottom-4 z-20 mx-auto max-w-2xl">
                <div className="bg-slate-900 text-white rounded-xl shadow-lg flex items-center gap-2 px-3 py-2">
                    <span className="text-xs font-semibold bg-indigo-500 rounded-lg px-2 py-1">
                        {selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}
                    </span>
                    <div className="flex-1" />
                    <button
                        onClick={() => setMode('create')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Abrir card
                    </button>
                    <button
                        onClick={() => setMode('assign')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10"
                    >
                        <UserPlus className="w-3.5 h-3.5" />
                        Atribuir
                    </button>
                    <button
                        onClick={() => setMode('suppress')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 text-rose-300"
                    >
                        <UserX className="w-3.5 h-3.5" />
                        Não contactar
                    </button>
                    <button
                        onClick={onClear}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
                        aria-label="Limpar seleção"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {mode === 'suppress' && (
                <SuppressModal
                    selectedIds={selectedIds}
                    onClose={() => setMode(null)}
                    onDone={async () => { setMode(null); onClear(); await onCompleted() }}
                />
            )}
            {mode === 'assign' && (
                <AssignModal
                    selectedIds={selectedIds}
                    onClose={() => setMode(null)}
                    onDone={async () => { setMode(null); onClear(); await onCompleted() }}
                />
            )}
            {mode === 'create' && (
                <CreateCardsModal
                    selectedIds={selectedIds}
                    onClose={() => setMode(null)}
                    onDone={async () => { setMode(null); onClear(); await onCompleted() }}
                />
            )}
        </>
    )
}

function SuppressModal({ selectedIds, onClose, onDone }: { selectedIds: string[]; onClose: () => void; onDone: () => Promise<void> }) {
    const { suppressBulk, busy } = useReactivationActions()
    const [reason, setReason] = useState<SuppressionReason>('working_elsewhere')
    const [duration, setDuration] = useState<'permanent' | '30' | '90' | '180' | '365'>('90')
    const [note, setNote] = useState('')

    async function submit() {
        let until: Date | null = null
        if (duration !== 'permanent') {
            until = new Date()
            until.setDate(until.getDate() + Number(duration))
        }
        await suppressBulk(selectedIds, reason, until, note || undefined)
        await onDone()
    }

    return (
        <Modal title={`Não contactar — ${selectedIds.length} contato${selectedIds.length > 1 ? 's' : ''}`} onClose={onClose}>
            <div className="space-y-4">
                <div>
                    <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Motivo</label>
                    <select
                        value={reason}
                        onChange={e => setReason(e.target.value as SuppressionReason)}
                        className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg ring-1 ring-slate-200 bg-white"
                    >
                        {(Object.keys(SUPPRESSION_REASON_LABELS) as SuppressionReason[]).map(k => (
                            <option key={k} value={k}>{SUPPRESSION_REASON_LABELS[k]}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Por quanto tempo</label>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {[
                            { v: '30', l: '30 dias' },
                            { v: '90', l: '90 dias' },
                            { v: '180', l: '6 meses' },
                            { v: '365', l: '1 ano' },
                            { v: 'permanent', l: 'Permanente' },
                        ].map(o => (
                            <button
                                key={o.v}
                                type="button"
                                onClick={() => setDuration(o.v as typeof duration)}
                                className={cn(
                                    'px-2.5 py-1 rounded-lg text-xs ring-1',
                                    duration === o.v ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'
                                )}
                            >
                                {o.l}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Observação (opcional)</label>
                    <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        rows={2}
                        className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg ring-1 ring-slate-200 bg-white"
                        placeholder="Ex: cliente contratou direto, pediu para não ligar mais…"
                    />
                </div>

                <p className="text-xs text-slate-500 bg-amber-50 ring-1 ring-amber-200 rounded-lg p-2.5">
                    Esses contatos vão <strong>sumir da lista de reativação</strong> {duration === 'permanent' ? 'permanentemente' : `pelos próximos ${duration} dias`}.
                </p>

                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={submit}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Marcar não contactar
                    </button>
                </div>
            </div>
        </Modal>
    )
}

function AssignModal({ selectedIds, onClose, onDone }: { selectedIds: string[]; onClose: () => void; onDone: () => Promise<void> }) {
    const { assignBulk, busy } = useReactivationActions()
    const { users } = useUsers()
    const { responsaveis } = useReactivationFacets()
    const [userId, setUserId] = useState<string>('')

    const options = Array.from(new Map([
        ...users.filter(u => u.active).map(u => [u.id, { id: u.id, nome: u.nome, email: u.email }] as [string, { id: string; nome: string | null; email: string | null }]),
        ...responsaveis.map(r => [r.id, { id: r.id, nome: r.nome, email: r.email }] as [string, { id: string; nome: string | null; email: string | null }]),
    ]).values()).sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? ''))

    async function submit() {
        if (!userId) return
        await assignBulk(selectedIds, userId)
        await onDone()
    }

    return (
        <Modal title={`Atribuir responsável — ${selectedIds.length} contato${selectedIds.length > 1 ? 's' : ''}`} onClose={onClose}>
            <div className="space-y-4">
                <select
                    value={userId}
                    onChange={e => setUserId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg ring-1 ring-slate-200 bg-white"
                >
                    <option value="">Escolha um vendedor…</option>
                    {options.map(u => (
                        <option key={u.id} value={u.id}>{u.nome ?? u.email ?? u.id}</option>
                    ))}
                </select>
                <p className="text-xs text-slate-500">
                    O responsável é gravado na lista de reativação e passa a aparecer no filtro "Minha carteira". Não muda os cards históricos.
                </p>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
                    <button
                        type="button"
                        disabled={busy || !userId}
                        onClick={submit}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Atribuir
                    </button>
                </div>
            </div>
        </Modal>
    )
}

function CreateCardsModal({ selectedIds, onClose, onDone }: { selectedIds: string[]; onClose: () => void; onDone: () => Promise<void> }) {
    const { createCardsBulk, busy } = useReactivationActions()
    const { users } = useUsers()
    const { pipelineId } = useCurrentProductMeta()
    const { data: pipelines } = usePipelines()
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>(pipelineId ?? '')
    const effectivePipelineId = selectedPipelineId || pipelineId || pipelines?.[0]?.id
    const { data: stages } = usePipelineStages(effectivePipelineId)
    const [stageId, setStageId] = useState<string>('')
    const [ownerId, setOwnerId] = useState<string>('')

    async function submit() {
        if (!effectivePipelineId || !stageId) return
        await createCardsBulk(selectedIds, effectivePipelineId, stageId, ownerId || null)
        await onDone()
    }

    return (
        <Modal title={`Abrir ${selectedIds.length} card${selectedIds.length > 1 ? 's' : ''} novo${selectedIds.length > 1 ? 's' : ''}`} onClose={onClose}>
            <div className="space-y-4">
                <div>
                    <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Pipeline</label>
                    <select
                        value={selectedPipelineId}
                        onChange={e => { setSelectedPipelineId(e.target.value); setStageId('') }}
                        className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg ring-1 ring-slate-200 bg-white"
                    >
                        {(pipelines ?? []).map(p => (
                            <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Etapa inicial</label>
                    <select
                        value={stageId}
                        onChange={e => setStageId(e.target.value)}
                        className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg ring-1 ring-slate-200 bg-white"
                    >
                        <option value="">Escolha a etapa…</option>
                        {(stages ?? []).map(s => (
                            <option key={s.id} value={s.id}>{s.nome}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Vendedor responsável (opcional)</label>
                    <select
                        value={ownerId}
                        onChange={e => setOwnerId(e.target.value)}
                        className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg ring-1 ring-slate-200 bg-white"
                    >
                        <option value="">Sem dono definido</option>
                        {users.filter(u => u.active).map(u => (
                            <option key={u.id} value={u.id}>{u.nome ?? u.email}</option>
                        ))}
                    </select>
                </div>

                <p className="text-xs text-slate-500 bg-indigo-50 ring-1 ring-indigo-200 rounded-lg p-2.5">
                    Vamos criar {selectedIds.length} card{selectedIds.length > 1 ? 's' : ''} novo{selectedIds.length > 1 ? 's' : ''} no pipeline selecionado. Os contatos saem da lista de reativação assim que o card é criado.
                </p>

                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
                    <button
                        type="button"
                        disabled={busy || !stageId}
                        onClick={submit}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Criar cards
                    </button>
                </div>
            </div>
        </Modal>
    )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
                    <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Fechar">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    )
}
