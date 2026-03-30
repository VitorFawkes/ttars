import { useState, useMemo, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { Megaphone, ChevronsUpDown, Check, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface SendAlertModalProps {
    isOpen: boolean
    onClose: () => void
    cardId: string
    cardTitle: string | null
}

export default function SendAlertModal({ isOpen, onClose, cardId, cardTitle }: SendAlertModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
            <DialogContent className="sm:max-w-md">
                {isOpen && (
                    <SendAlertForm cardId={cardId} cardTitle={cardTitle} onClose={onClose} />
                )}
            </DialogContent>
        </Dialog>
    )
}

/** Inner form — mounts/unmounts with dialog, state resets naturally */
function SendAlertForm({ cardId, cardTitle, onClose }: { cardId: string; cardTitle: string | null; onClose: () => void }) {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [selectedUserId, setSelectedUserId] = useState('')
    const [message, setMessage] = useState('')
    const [dropdownOpen, setDropdownOpen] = useState(false)
    const [search, setSearch] = useState('')
    const dropdownRef = useRef<HTMLDivElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)

    // Close dropdown on outside click
    useEffect(() => {
        if (!dropdownOpen) return
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [dropdownOpen])

    // Focus search when dropdown opens
    useEffect(() => {
        if (dropdownOpen) {
            setTimeout(() => searchRef.current?.focus(), 50)
        }
    }, [dropdownOpen])

    // Fetch active profiles
    const { data: profiles } = useQuery({
        queryKey: ['active-profiles-with-team-or-admin'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, nome, email, team_id, is_admin')
                .eq('active', true)
                .or('team_id.not.is.null,is_admin.eq.true')
                .order('nome')
            if (error) throw error
            return data
        },
        staleTime: 1000 * 60 * 5,
    })

    // Fetch card owners + team members to prioritize them
    const { data: cardOwners } = useQuery({
        queryKey: ['card-owners', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('sdr_owner_id, vendas_owner_id, pos_owner_id, dono_atual_id')
                .eq('id', cardId)
                .single()
            if (error) return null
            return data
        },
        staleTime: 1000 * 60,
        enabled: !!cardId,
    })

    const { data: teamMemberIds } = useQuery({
        queryKey: ['card-team-ids', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('card_team_members')
                .select('profile_id')
                .eq('card_id', cardId)
            if (error) return []
            return data?.map(d => d.profile_id) || []
        },
        staleTime: 1000 * 60,
        enabled: !!cardId,
    })

    // Build grouped profiles: card team first, then others (exclude self)
    const { teamProfiles, otherProfiles } = useMemo(() => {
        if (!profiles) return { teamProfiles: [], otherProfiles: [] }

        const cardTeamIds = new Set([
            cardOwners?.sdr_owner_id,
            cardOwners?.vendas_owner_id,
            cardOwners?.pos_owner_id,
            cardOwners?.dono_atual_id,
            ...(teamMemberIds || []),
        ].filter(Boolean) as string[])

        const sortByName = (a: typeof profiles[0], b: typeof profiles[0]) =>
            (a.nome || a.email || '').localeCompare(b.nome || b.email || '', 'pt-BR')

        const available = profiles.filter(p => p.id !== user?.id)
        const team = available.filter(p => cardTeamIds.has(p.id)).sort(sortByName)
        const others = available.filter(p => !cardTeamIds.has(p.id)).sort(sortByName)

        return { teamProfiles: team, otherProfiles: others }
    }, [profiles, cardOwners, teamMemberIds, user?.id])

    // Filter by search
    const filteredTeam = useMemo(() => {
        if (!search) return teamProfiles
        const q = search.toLowerCase()
        return teamProfiles.filter(p => (p.nome || p.email || '').toLowerCase().includes(q))
    }, [teamProfiles, search])

    const filteredOthers = useMemo(() => {
        if (!search) return otherProfiles
        const q = search.toLowerCase()
        return otherProfiles.filter(p => (p.nome || p.email || '').toLowerCase().includes(q))
    }, [otherProfiles, search])

    const selectedName = useMemo(() => {
        if (!selectedUserId || !profiles) return null
        const p = profiles.find(pr => pr.id === selectedUserId)
        return p ? (p.nome || p.email || 'Sem nome') : null
    }, [selectedUserId, profiles])

    // Check if card_alert type is enabled
    const { data: alertConfig } = useQuery({
        queryKey: ['notification-type-config', 'card_alert'],
        queryFn: async () => {
            const { data, error } = await db
                .from('notification_type_config')
                .select('enabled')
                .eq('type_key', 'card_alert')
                .maybeSingle()
            if (error) return { enabled: true }
            return data ?? { enabled: true }
        },
        staleTime: 5 * 60_000,
    })

    // Send alert mutation
    const sendAlert = useMutation({
        mutationFn: async () => {
            if (!alertConfig?.enabled) {
                throw new Error('Alertas no card estão desativados pelo admin')
            }

            // 1. Insert notification
            const { error: notifError } = await db
                .from('notifications')
                .insert({
                    user_id: selectedUserId,
                    type: 'card_alert',
                    title: `Alerta em "${cardTitle || 'Card'}"`,
                    body: message || null,
                    url: `/cards/${cardId}`,
                })
            if (notifError) throw notifError

            // 2. Log activity on the card
            const senderName = profiles?.find(p => p.id === user?.id)?.nome || 'Alguém'
            const recipientName = profiles?.find(p => p.id === selectedUserId)?.nome || 'alguém'
            const { error: actError } = await supabase
                .from('activities')
                .insert({
                    card_id: cardId,
                    tipo: 'note_added',
                    descricao: `${senderName} enviou alerta para ${recipientName}: "${message || '(sem mensagem)'}"`,
                    metadata: {
                        alert_type: 'card_alert',
                        recipient_id: selectedUserId,
                        recipient_name: recipientName,
                    },
                    created_by: user?.id,
                })
            if (actError) console.error('Activity log failed:', actError)
        },
        onSuccess: () => {
            toast.success('Alerta enviado')
            queryClient.invalidateQueries({ queryKey: ['activities', cardId] })
            onClose()
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : 'Erro ao enviar alerta')
        },
    })

    const canSubmit = selectedUserId && !sendAlert.isPending

    const renderProfile = (p: { id: string; nome: string | null; email: string | null }) => (
        <button
            key={p.id}
            type="button"
            onClick={() => {
                setSelectedUserId(p.id)
                setDropdownOpen(false)
                setSearch('')
            }}
            className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between',
                selectedUserId === p.id && 'bg-indigo-50'
            )}
        >
            <span className="truncate">{p.nome || p.email}</span>
            {selectedUserId === p.id && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
        </button>
    )

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                    <Megaphone className="h-4.5 w-4.5 text-amber-600" />
                    Enviar Alerta
                </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
                {/* Person selector */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Para quem</label>
                        <div ref={dropdownRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className="w-full flex items-center justify-between px-3 py-2 border border-slate-200 rounded-lg text-sm hover:border-slate-300 transition-colors bg-white"
                            >
                                <span className={selectedName ? 'text-slate-900' : 'text-slate-400'}>
                                    {selectedName || 'Selecionar pessoa...'}
                                </span>
                                <ChevronsUpDown className="w-4 h-4 text-slate-400" />
                            </button>

                            {dropdownOpen && (
                                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
                                    <div className="p-2 border-b border-slate-100">
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                            <input
                                                ref={searchRef}
                                                type="text"
                                                value={search}
                                                onChange={e => setSearch(e.target.value)}
                                                placeholder="Buscar..."
                                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="overflow-y-auto max-h-48">
                                        {filteredTeam.length > 0 && (
                                            <>
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    Equipe do card
                                                </div>
                                                {filteredTeam.map(renderProfile)}
                                            </>
                                        )}
                                        {filteredOthers.length > 0 && (
                                            <>
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-t border-slate-100">
                                                    Outros
                                                </div>
                                                {filteredOthers.map(renderProfile)}
                                            </>
                                        )}
                                        {filteredTeam.length === 0 && filteredOthers.length === 0 && (
                                            <div className="px-3 py-4 text-sm text-slate-400 text-center">
                                                Nenhuma pessoa encontrada
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Message */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">
                            Mensagem <span className="text-slate-400 font-normal">(opcional)</span>
                        </label>
                        <Textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Ex: Verificar documentação do passageiro..."
                            rows={3}
                            className="resize-none"
                        />
                    </div>
                </div>

            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={sendAlert.isPending}>
                    Cancelar
                </Button>
                <Button
                    onClick={() => sendAlert.mutate()}
                    disabled={!canSubmit}
                    className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                >
                    {sendAlert.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Megaphone className="w-4 h-4" />
                    )}
                    Enviar
                </Button>
            </DialogFooter>
        </>
    )
}
