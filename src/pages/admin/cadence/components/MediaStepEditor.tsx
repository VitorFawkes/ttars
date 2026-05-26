import React from 'react'
import { Image as ImageIcon, AlertCircle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select as CustomSelect } from '@/components/ui/Select'
import {
    useWhatsAppLinhas,
    isOfficialMetaLine,
} from '@/hooks/useWhatsAppLinhas'

export interface MediaConfig {
    media_url?: string | null
    mime_type?: string | null
    filename?: string | null
    caption?: string | null
    phone_number_id?: string | null
}

interface MediaStepEditorProps {
    config: MediaConfig
    onChange: (next: MediaConfig) => void
    product?: string | null
}

const MIME_OPTIONS = [
    { value: 'image/jpeg', label: 'Imagem JPEG (.jpg)' },
    { value: 'image/png', label: 'Imagem PNG (.png)' },
    { value: 'image/webp', label: 'Imagem WebP (.webp)' },
    { value: 'video/mp4', label: 'Vídeo MP4 (.mp4)' },
    { value: 'audio/mpeg', label: 'Áudio MP3 (.mp3)' },
    { value: 'audio/ogg', label: 'Áudio OGG (.ogg)' },
    { value: 'application/pdf', label: 'Documento PDF (.pdf)' },
    {
        value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        label: 'Documento DOCX (.docx)',
    },
]

const VARIABLE_HINTS = [
    '{{contact.primeiro_nome}}',
    '{{contact.nome}}',
    '{{card.titulo}}',
    '{{now}}',
    // Calendly
    '{{trigger.invitee_name}}',
    '{{trigger.event_start_time}}',
    '{{trigger.event_name}}',
    '{{trigger.meeting_join_url}}',
]

export const MediaStepEditor: React.FC<MediaStepEditorProps> = ({
    config,
    onChange,
    product,
}) => {
    const { data: linhas = [], isLoading: linhasLoading } = useWhatsAppLinhas(product || null)

    return (
        <div className="space-y-4">
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
                        Escolha de qual linha a mídia sai.
                    </p>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5" />
                        URL da mídia *
                    </Label>
                    <Input
                        value={config.media_url || ''}
                        onChange={(e) => onChange({ ...config, media_url: e.target.value || null })}
                        placeholder="https://cdn.exemplo.com/foto.jpg"
                    />
                    <p className="text-xs text-slate-500">
                        URL pública. Para automação não usamos upload — hospede em Storage/CDN.
                    </p>
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Tipo do arquivo *</Label>
                    <CustomSelect
                        value={config.mime_type || ''}
                        onChange={(v) => onChange({ ...config, mime_type: v || null })}
                        options={[{ value: '', label: 'Selecionar tipo...' }, ...MIME_OPTIONS]}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-xs">Nome do arquivo (opcional)</Label>
                <Input
                    value={config.filename || ''}
                    onChange={(e) => onChange({ ...config, filename: e.target.value || null })}
                    placeholder="proposta.pdf"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs">Legenda (opcional)</Label>
                <Textarea
                    value={config.caption || ''}
                    onChange={(e) => onChange({ ...config, caption: e.target.value || null })}
                    placeholder="Olá {{contact.primeiro_nome}}, segue o material que combinamos."
                    rows={3}
                />
                <p className="text-xs text-slate-500">
                    Variáveis: {VARIABLE_HINTS.map((v) => <code key={v} className="bg-slate-100 px-1 mx-1 rounded">{v}</code>)}
                </p>
            </div>
        </div>
    )
}

export default MediaStepEditor
