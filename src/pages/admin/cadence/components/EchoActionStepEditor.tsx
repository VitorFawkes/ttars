import React from 'react'
import { AlertCircle, UserCheck, UserMinus, X, Settings, Tag, Users } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select as CustomSelect } from '@/components/ui/Select'
import { useEchoTags, useEchoCloseReasons, useEchoUsers } from '@/hooks/useEchoCatalogs'
import { EchoBadge } from '@/components/automations/EchoBadge'

export type EchoSubAction =
    | 'assign'
    | 'release'
    | 'close'
    | 'set_status'
    | 'add_tag'
    | 'remove_tag'
    | 'add_co_owner'
    | 'remove_co_owner'

export interface EchoConfig {
    action?: EchoSubAction
    // assign / co-owners
    assign_to?: 'card_owner' | 'specific'
    user_id?: string | null  // TTARS profile.id (engine resolve via integration_user_map)
    // close / set_status
    reason?: string | null
    close_reason_id?: string | null
    status?: 'active' | 'waiting' | 'closed'
    // tags
    tag_id?: string | null
    // fallback pra criar conversa
    phone_number_id?: string | null
}

interface EchoActionStepEditorProps {
    config: EchoConfig
    onChange: (next: EchoConfig) => void
}

export const ECHO_SUB_ACTION_META: Record<EchoSubAction, { label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = {
    assign:           { label: 'Atribuir conversa',     icon: UserCheck,  description: 'Define o atendente responsável da conversa Echo' },
    release:          { label: 'Liberar conversa',      icon: UserMinus,  description: 'Devolve a conversa ao pool (status waiting)' },
    close:            { label: 'Fechar conversa',       icon: X,          description: 'Encerra a conversa com motivo opcional' },
    set_status:       { label: 'Mudar status',          icon: Settings,   description: 'Define active / waiting / closed' },
    add_tag:          { label: 'Adicionar tag',         icon: Tag,        description: 'Aplica uma tag Echo à conversa' },
    remove_tag:       { label: 'Remover tag',           icon: Tag,        description: 'Remove uma tag Echo da conversa' },
    add_co_owner:     { label: 'Adicionar co-owner',    icon: Users,      description: 'Compartilha custódia da conversa com outro atendente' },
    remove_co_owner:  { label: 'Remover co-owner',      icon: Users,      description: 'Remove um co-proprietário' },
}

export const EchoActionStepEditor: React.FC<EchoActionStepEditorProps> = ({
    config,
    onChange,
}) => {
    const { data: tags = [], isLoading: tagsLoading } = useEchoTags()
    const { data: closeReasons = [], isLoading: reasonsLoading } = useEchoCloseReasons()
    const { data: echoUsers = [], isLoading: usersLoading } = useEchoUsers()

    const action = config.action

    const renderSubAction = () => {
        switch (action) {
            case 'assign':
                return (
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label className="text-xs">Atribuir a</Label>
                            <CustomSelect
                                value={config.assign_to || 'card_owner'}
                                onChange={(v) => onChange({ ...config, assign_to: v as 'card_owner' | 'specific' })}
                                options={[
                                    { value: 'card_owner', label: 'Responsável do card' },
                                    { value: 'specific',   label: 'Pessoa específica' },
                                ]}
                            />
                        </div>
                        {config.assign_to === 'specific' && (
                            <div className="space-y-2">
                                <Label className="text-xs">Pessoa</Label>
                                <CustomSelect
                                    value={config.user_id || ''}
                                    onChange={(v) => onChange({ ...config, user_id: v || null })}
                                    options={[
                                        { value: '', label: usersLoading ? 'Carregando...' : 'Selecionar usuário Echo...' },
                                        ...echoUsers.map((u) => ({ value: u.profile_id, label: u.nome })),
                                    ]}
                                />
                                <p className="text-xs text-slate-500">
                                    Só aparecem usuários TTARS com mapping ativo no Echo.
                                </p>
                            </div>
                        )}
                    </div>
                )
            case 'release':
                return (
                    <p className="text-sm text-slate-600">
                        A conversa volta pro pool (<code className="bg-slate-100 px-1 rounded">status = waiting</code>).
                        Sem parâmetros adicionais.
                    </p>
                )
            case 'close':
                return (
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label className="text-xs">Motivo (catálogo Echo) — opcional</Label>
                            <CustomSelect
                                value={config.close_reason_id || ''}
                                onChange={(v) => {
                                    const reason = closeReasons.find((r) => r.id === v)
                                    onChange({
                                        ...config,
                                        close_reason_id: v || null,
                                        reason: reason ? reason.name : config.reason || null,
                                    })
                                }}
                                options={[
                                    { value: '', label: reasonsLoading ? 'Carregando...' : 'Sem motivo / texto livre abaixo' },
                                    ...closeReasons.map((r) => ({ value: r.id, label: r.name })),
                                ]}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Ou texto livre</Label>
                            <Textarea
                                value={config.reason || ''}
                                onChange={(e) => onChange({ ...config, reason: e.target.value || null })}
                                placeholder="Descrição livre do motivo do fechamento"
                                rows={2}
                            />
                        </div>
                    </div>
                )
            case 'set_status':
                return (
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label className="text-xs">Novo status</Label>
                            <CustomSelect
                                value={config.status || ''}
                                onChange={(v) => onChange({ ...config, status: v as 'active' | 'waiting' | 'closed' })}
                                options={[
                                    { value: '',        label: 'Selecionar...' },
                                    { value: 'active',  label: 'Ativa' },
                                    { value: 'waiting', label: 'Aguardando (waiting)' },
                                    { value: 'closed',  label: 'Fechada' },
                                ]}
                            />
                        </div>
                        {config.status === 'closed' && (
                            <div className="space-y-2">
                                <Label className="text-xs">Motivo do fechamento (opcional)</Label>
                                <Input
                                    value={config.reason || ''}
                                    onChange={(e) => onChange({ ...config, reason: e.target.value || null })}
                                    placeholder="Texto livre"
                                />
                            </div>
                        )}
                    </div>
                )
            case 'add_tag':
            case 'remove_tag':
                return (
                    <div className="space-y-2">
                        <Label className="text-xs">Tag Echo</Label>
                        <CustomSelect
                            value={config.tag_id || ''}
                            onChange={(v) => onChange({ ...config, tag_id: v || null })}
                            options={[
                                { value: '', label: tagsLoading ? 'Carregando...' : 'Selecionar tag...' },
                                ...tags.map((t) => ({ value: t.id, label: t.name })),
                            ]}
                        />
                        {!tagsLoading && tags.length === 0 && (
                            <p className="text-xs text-amber-700 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Nenhuma tag cadastrada no Echo. Crie pela UI do Echo primeiro.
                            </p>
                        )}
                    </div>
                )
            case 'add_co_owner':
            case 'remove_co_owner':
                return (
                    <div className="space-y-2">
                        <Label className="text-xs">Pessoa</Label>
                        <CustomSelect
                            value={config.user_id || ''}
                            onChange={(v) => onChange({ ...config, user_id: v || null })}
                            options={[
                                { value: '', label: usersLoading ? 'Carregando...' : 'Selecionar usuário Echo...' },
                                ...echoUsers.map((u) => ({ value: u.profile_id, label: u.nome })),
                            ]}
                        />
                    </div>
                )
            default:
                return (
                    <p className="text-sm text-slate-500">Selecione uma ação Echo abaixo.</p>
                )
        }
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                    <EchoBadge iconOnly size={12} />
                    Ação Echo
                </Label>
                <CustomSelect
                    value={action || ''}
                    onChange={(v) => onChange({ ...config, action: (v || undefined) as EchoSubAction | undefined })}
                    options={[
                        { value: '', label: 'Selecionar ação...' },
                        ...Object.entries(ECHO_SUB_ACTION_META).map(([key, meta]) => ({
                            value: key,
                            label: meta.label,
                        })),
                    ]}
                />
                {action && ECHO_SUB_ACTION_META[action] && (
                    <p className="text-xs text-slate-500">{ECHO_SUB_ACTION_META[action].description}</p>
                )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                {renderSubAction()}
            </div>
        </div>
    )
}

export default EchoActionStepEditor
