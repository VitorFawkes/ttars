import React, { useMemo } from 'react'
import { ShieldCheck, FileText, AlertCircle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select as CustomSelect } from '@/components/ui/Select'
import {
    useWhatsAppTemplates,
    parseTemplateBody,
    type WhatsAppTemplate,
} from '@/hooks/useWhatsAppTemplates'
import {
    useWhatsAppLinhas,
    isOfficialMetaLine,
} from '@/hooks/useWhatsAppLinhas'

export interface MessageConfig {
    send_mode?: 'hsm' | 'text'
    hsm_template_name?: string | null
    hsm_language?: string
    hsm_params?: string[]
    corpo?: string | null
    template_id?: string | null
    phone_number_id?: string | null
}

interface MessageStepEditorProps {
    config: MessageConfig
    onChange: (next: MessageConfig) => void
    /**
     * Produto do workspace ativo. Filtra a lista de linhas WhatsApp.
     * Pode vir vazio em workspaces com 1 produto único — nesse caso o hook
     * lista todas as linhas da org.
     */
    product?: string | null
}

const VARIABLE_HINTS = [
    '{{contact.primeiro_nome}}',
    '{{contact.nome}}',
    '{{card.titulo}}',
    '{{card.destinos}}',
    '{{now}}',
    // Calendly (disponíveis quando o gatilho é "Reunião agendada no Calendly")
    '{{trigger.invitee_name}}',
    '{{trigger.event_start_time}}',
    '{{trigger.event_name}}',
    '{{trigger.meeting_join_url}}',
    // Tarefa concluída (gatilho "Tarefa concluída", ex: reunião)
    '{{trigger.data_reuniao}}',
]

export const MessageStepEditor: React.FC<MessageStepEditorProps> = ({
    config,
    onChange,
    product,
}) => {
    const sendMode: 'hsm' | 'text' = config.send_mode
        || (config.hsm_template_name ? 'hsm' : 'text')

    const { data: linhas = [], isLoading: linhasLoading } = useWhatsAppLinhas(product || null)
    const { data: waTemplates = [], isLoading: waTemplatesLoading } = useWhatsAppTemplates(
        config.phone_number_id || null,
    )

    const selectedTemplate = useMemo<WhatsAppTemplate | null>(
        () => waTemplates.find((t) => t.name === config.hsm_template_name) || null,
        [waTemplates, config.hsm_template_name],
    )

    const templateMeta = useMemo(
        () => (selectedTemplate ? parseTemplateBody(selectedTemplate) : null),
        [selectedTemplate],
    )

    const selectedLinha = useMemo(
        () => linhas.find((l) => l.phone_number_id === config.phone_number_id) || null,
        [linhas, config.phone_number_id],
    )
    const linhaIsOfficial = selectedLinha
        ? isOfficialMetaLine(selectedLinha.phone_number_id)
        : false

    // Linha oficial Meta + texto livre = bloqueio (Meta dropa fora da janela 24h).
    // Forçamos modo HSM nesses casos.
    const forceHsm = linhaIsOfficial

    const setMode = (mode: 'hsm' | 'text') => {
        onChange({ ...config, send_mode: mode })
    }

    const setHsmName = (name: string) => {
        const next = waTemplates.find((t) => t.name === name)
        const meta = next ? parseTemplateBody(next) : null
        const newParams: string[] = meta
            ? Array.from({ length: meta.paramCount }, (_, i) => config.hsm_params?.[i] || '')
            : []
        onChange({
            ...config,
            send_mode: 'hsm',
            hsm_template_name: name || null,
            hsm_language: next?.language || config.hsm_language || 'pt_BR',
            hsm_params: newParams,
        })
    }

    const setParam = (index: number, value: string) => {
        const next = [...(config.hsm_params || [])]
        next[index] = value
        onChange({ ...config, hsm_params: next })
    }

    return (
        <div className="space-y-4">
            {/* Linha WhatsApp (obrigatória) */}
            <div className="space-y-2">
                <Label className="text-xs">De qual linha WhatsApp envia? *</Label>
                <CustomSelect
                    value={config.phone_number_id || ''}
                    onChange={(v) => onChange({ ...config, phone_number_id: v || null })}
                    options={[
                        { value: '', label: linhasLoading ? 'Carregando linhas...' : 'Selecionar linha...' },
                        ...linhas.map((l) => ({
                            value: l.phone_number_id || '',
                            label: `${l.phone_number_label} — ${
                                isOfficialMetaLine(l.phone_number_id) ? 'Oficial Meta' : 'Não-oficial'
                            }`,
                        })),
                    ]}
                />
                {!config.phone_number_id && (
                    <p className="text-xs text-amber-700 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Escolha de qual linha a mensagem sai.
                    </p>
                )}
                {linhaIsOfficial && (
                    <p className="text-xs text-slate-500">
                        Linha oficial Meta: fora da janela de 24h só HSM aprovado funciona — o modo Texto livre fica desabilitado.
                    </p>
                )}
            </div>

            {/* Toggle HSM x Texto livre */}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setMode('hsm')}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        sendMode === 'hsm'
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                >
                    <ShieldCheck className="w-4 h-4" />
                    <div className="text-left">
                        <div className="font-medium">Template HSM</div>
                        <div className="text-xs opacity-70">Aprovado pela Meta</div>
                    </div>
                </button>
                <button
                    type="button"
                    onClick={() => !forceHsm && setMode('text')}
                    disabled={forceHsm}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        sendMode === 'text' && !forceHsm
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    } ${forceHsm ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                    <FileText className="w-4 h-4" />
                    <div className="text-left">
                        <div className="font-medium">Texto livre</div>
                        <div className="text-xs opacity-70">Funciona dentro da janela 24h</div>
                    </div>
                </button>
            </div>

            {/* Modo HSM */}
            {sendMode === 'hsm' && (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-xs">Template aprovado (HSM)</Label>
                        <CustomSelect
                            value={config.hsm_template_name || ''}
                            onChange={setHsmName}
                            options={[
                                { value: '', label: waTemplatesLoading ? 'Carregando templates...' : 'Selecionar template...' },
                                ...waTemplates
                                    .filter((t) => t.status === 'APPROVED')
                                    .map((t) => ({
                                        value: t.name,
                                        label: `${t.name} (${t.language})`,
                                    })),
                            ]}
                        />
                    </div>

                    {selectedTemplate && templateMeta && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Corpo do template</p>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{templateMeta.bodyText || '(sem corpo)'}</p>
                            </div>
                            {templateMeta.paramCount > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Parâmetros</p>
                                    {Array.from({ length: templateMeta.paramCount }, (_, i) => (
                                        <div key={i} className="space-y-1">
                                            <Label className="text-xs">{`{{${i + 1}}} — ${templateMeta.paramLabels[i]}`}</Label>
                                            <Input
                                                value={config.hsm_params?.[i] || ''}
                                                onChange={(e) => setParam(i, e.target.value)}
                                                placeholder="Texto fixo OU variável (ex: {{contact.primeiro_nome}})"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-slate-500">
                                Variáveis disponíveis: {VARIABLE_HINTS.map((v) => <code key={v} className="bg-white border border-slate-200 px-1 mx-1 rounded">{v}</code>)}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Modo Texto livre */}
            {sendMode === 'text' && !forceHsm && (
                <div className="space-y-2">
                    <Label className="text-xs">Texto da mensagem</Label>
                    <Textarea
                        value={config.corpo || ''}
                        onChange={(e) => onChange({ ...config, corpo: e.target.value })}
                        placeholder="Olá {{contact.primeiro_nome}}, tudo bem?"
                        rows={4}
                    />
                    <p className="text-xs text-slate-500">
                        Variáveis: {VARIABLE_HINTS.map((v) => <code key={v} className="bg-slate-100 px-1 mx-1 rounded">{v}</code>)}
                    </p>
                </div>
            )}
        </div>
    )
}

export default MessageStepEditor
