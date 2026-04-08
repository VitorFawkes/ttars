/**
 * TravelGuideTab — Aba "Minha Viagem" do portal do cliente.
 *
 * Cronograma dia-a-dia com blocos publicados pelo operador.
 * Mobile-first, leitura apenas, design premium.
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { CountdownHeader } from './CountdownHeader'
import {
    CalendarDays,
    Lightbulb,
    FileDown,
    Phone,
    Mail,
    MessageCircle,
    ExternalLink,
    MapPin,
    Check,
    Download,
} from 'lucide-react'

interface Block {
    id: string
    block_type: string
    parent_day_id: string | null
    ordem: number
    data: Record<string, unknown>
}

interface TravelGuideTabProps {
    blocks: Block[]
    proposalTitle?: string
}

export function TravelGuideTab({ blocks, proposalTitle }: TravelGuideTabProps) {
    // Organizar blocos: dias como pais, filhos agrupados
    const { days, contacts, preTripSections } = useMemo(() => {
        const dayBlocks = blocks.filter(b => b.block_type === 'day_header').sort((a, b) => a.ordem - b.ordem)
        const contactBlocks = blocks.filter(b => b.block_type === 'contact')
        const preTripBlocks = blocks.filter(b => b.block_type === 'pre_trip_section')
        const orphanBlocks = blocks.filter(b =>
            b.parent_day_id === null &&
            b.block_type !== 'day_header' &&
            b.block_type !== 'contact' &&
            b.block_type !== 'pre_trip_section'
        )

        const daysWithChildren = dayBlocks.map(day => ({
            ...day,
            children: blocks.filter(b => b.parent_day_id === day.id).sort((a, b) => a.ordem - b.ordem),
        }))

        return {
            days: daysWithChildren,
            orphans: orphanBlocks,
            contacts: contactBlocks,
            preTripSections: preTripBlocks,
        }
    }, [blocks])

    // Encontrar primeira data para countdown
    const firstDate = useMemo(() => {
        for (const day of days) {
            const date = day.data.date as string
            if (date) return date
        }
        return null
    }, [days])

    if (blocks.length === 0) {
        return (
            <div className="text-center py-20 px-4">
                <MapPin className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Seu guia de viagem está sendo preparado
                </h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    Sua consultora está montando o roteiro completo com todas as informações
                    da sua viagem. Você receberá uma notificação quando estiver pronto.
                </p>
            </div>
        )
    }

    return (
        <div className="pb-24">
            {/* Countdown */}
            {firstDate && <CountdownHeader targetDate={firstDate} title={proposalTitle} />}

            {/* Pré-viagem */}
            {preTripSections.map(section => (
                <PreTripSection key={section.id} data={section.data} />
            ))}

            {/* Dias */}
            {days.map(day => (
                <div key={day.id} className="mb-6">
                    {/* Day header */}
                    <div className="bg-indigo-50 px-4 py-3 border-y border-indigo-100">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-indigo-600" />
                            <h2 className="text-sm font-bold text-indigo-900">
                                {String(day.data.title || 'Dia')}
                            </h2>
                        </div>
                        {((day.data.date as string) || (day.data.city as string)) && (
                            <p className="text-xs text-indigo-500 ml-6">
                                {(day.data.date as string) && formatDate(String(day.data.date))}
                                {(day.data.date as string) && (day.data.city as string) && ' — '}
                                {(day.data.city as string) && String(day.data.city)}
                            </p>
                        )}
                    </div>

                    {/* Day children */}
                    <div className="px-4 py-3 space-y-3">
                        {day.children.map(block => (
                            <BlockRenderer key={block.id} block={block} />
                        ))}
                        {day.children.length === 0 && (
                            <p className="text-xs text-slate-400 text-center py-4">
                                Detalhes em breve
                            </p>
                        )}
                    </div>
                </div>
            ))}

            {/* Documentos (todos vouchers) */}
            {blocks.filter(b => b.block_type === 'voucher').length > 0 && (
                <div className="px-4 mb-6">
                    <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                        <Download className="h-4 w-4 text-slate-500" />
                        Documentos da Viagem
                    </h3>
                    <div className="space-y-2">
                        {blocks.filter(b => b.block_type === 'voucher').map(block => (
                            <a
                                key={block.id}
                                href={String(block.data.file_url || '#')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors"
                            >
                                <FileDown className="h-5 w-5 text-amber-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-900 truncate">
                                        {String(block.data.file_name || 'Documento')}
                                    </p>
                                    {(block.data.supplier as string) && (
                                        <p className="text-xs text-slate-500">{String(block.data.supplier)}</p>
                                    )}
                                </div>
                                <ExternalLink className="h-4 w-4 text-slate-300 shrink-0" />
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Contatos */}
            {contacts.length > 0 && (
                <div className="px-4 mb-6">
                    <h3 className="text-sm font-bold text-slate-900 mb-3">Contatos</h3>
                    <div className="space-y-2">
                        {contacts.map(contact => (
                            <ContactCard key={contact.id} data={contact.data} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Block renderers ────────────────────────────────────────────────────────

function BlockRenderer({ block }: { block: Block }) {
    switch (block.block_type) {
        case 'tip':
            return (
                <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-100">
                    <div className="flex items-start gap-2">
                        <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                        <div>
                            {(block.data.title as string) && (
                                <p className="text-sm font-semibold text-yellow-800 mb-1">
                                    {String(block.data.title)}
                                </p>
                            )}
                            <p className="text-sm text-yellow-700 whitespace-pre-line">
                                {String(block.data.content || '')}
                            </p>
                        </div>
                    </div>
                </div>
            )

        case 'photo':
            return block.data.image_url ? (
                <div>
                    <img
                        src={String(block.data.image_url)}
                        alt={String(block.data.caption || '')}
                        className="w-full rounded-xl object-cover max-h-64"
                        loading="lazy"
                    />
                    {(block.data.caption as string) && (
                        <p className="text-xs text-slate-500 mt-1 px-1">{String(block.data.caption)}</p>
                    )}
                </div>
            ) : null

        case 'video': {
            const embedUrl = getEmbedUrl(String(block.data.url || ''))
            return embedUrl ? (
                <div>
                    <div className="aspect-video rounded-xl overflow-hidden">
                        <iframe src={embedUrl} className="w-full h-full" allowFullScreen />
                    </div>
                    {(block.data.caption as string) && (
                        <p className="text-xs text-slate-500 mt-1 px-1">{String(block.data.caption)}</p>
                    )}
                </div>
            ) : null
        }

        case 'travel_item':
            return (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    {(block.data.image_url as string) && (
                        <img
                            src={String(block.data.image_url)}
                            alt={String(block.data.title || '')}
                            className="w-12 h-12 rounded-lg object-cover shrink-0"
                        />
                    )}
                    <div>
                        <p className="text-sm font-medium text-emerald-900">
                            {String(block.data.title || 'Item da viagem')}
                        </p>
                        {(block.data.description as string) && (
                            <p className="text-xs text-emerald-600">{String(block.data.description)}</p>
                        )}
                    </div>
                </div>
            )

        case 'voucher':
            return (
                <a
                    href={String(block.data.file_url || '#')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100"
                >
                    <FileDown className="h-5 w-5 text-amber-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-900 truncate">
                            {String(block.data.file_name || 'Voucher')}
                        </p>
                        {(block.data.supplier as string) && (
                            <p className="text-xs text-amber-600">{String(block.data.supplier)}</p>
                        )}
                    </div>
                    <ExternalLink className="h-4 w-4 text-amber-400 shrink-0" />
                </a>
            )

        case 'checklist': {
            const items = Array.isArray(block.data.items) ? block.data.items as Array<{ label: string; checked: boolean }> : []
            return (
                <div className="space-y-2">
                    {items.map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className={cn(
                                'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0',
                                item.checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                            )}>
                                {item.checked && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <span className={cn(
                                'text-sm',
                                item.checked ? 'text-slate-400 line-through' : 'text-slate-700'
                            )}>
                                {item.label}
                            </span>
                        </div>
                    ))}
                </div>
            )
        }

        default:
            return null
    }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ContactCard({ data }: { data: Record<string, unknown> }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-semibold text-slate-900">{String(data.name || '')}</p>
                    <p className="text-xs text-slate-500">{String(data.role || '')}</p>
                </div>
                <div className="flex gap-2">
                    {(data.phone as string) && (
                        <a href={`tel:${String(data.phone)}`} className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
                            <Phone className="h-4 w-4 text-emerald-600" />
                        </a>
                    )}
                    {(data.whatsapp as string) && (
                        <a href={`https://wa.me/${String(data.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center">
                            <MessageCircle className="h-4 w-4 text-green-600" />
                        </a>
                    )}
                    {(data.email as string) && (
                        <a href={`mailto:${String(data.email)}`} className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center">
                            <Mail className="h-4 w-4 text-blue-600" />
                        </a>
                    )}
                </div>
            </div>
        </div>
    )
}

function PreTripSection({ data }: { data: Record<string, unknown> }) {
    const topics = Array.isArray(data.topics) ? (data.topics as string[]) : []
    const customNotes = (data.custom_notes || {}) as Record<string, string>
    if (topics.length === 0) return null

    const TOPIC_LABELS: Record<string, { emoji: string; label: string }> = {
        passport: { emoji: '🛂', label: 'Passaporte' },
        visa: { emoji: '📋', label: 'Vistos' },
        vaccines: { emoji: '💉', label: 'Vacinas' },
        insurance: { emoji: '🛡️', label: 'Seguro Viagem' },
        currency: { emoji: '💰', label: 'Câmbio e Moeda' },
        timezone: { emoji: '🕐', label: 'Fuso Horário' },
        luggage: { emoji: '🧳', label: 'Bagagem' },
        weather: { emoji: '☀️', label: 'Clima' },
        transport: { emoji: '🚇', label: 'Transporte Local' },
        emergency: { emoji: '🚨', label: 'Emergências' },
    }

    return (
        <div className="px-4 py-4 mb-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">📋 Antes da Viagem</h3>
            <div className="space-y-3">
                {topics.map(key => {
                    const config = TOPIC_LABELS[key] || { emoji: '📌', label: key }
                    const note = customNotes[key]
                    return (
                        <div key={key} className="bg-orange-50 rounded-xl p-3 border border-orange-100">
                            <p className="text-sm font-medium text-orange-900">
                                {config.emoji} {config.label}
                            </p>
                            {note && (
                                <p className="text-xs text-orange-700 mt-1 whitespace-pre-line">{note}</p>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr + 'T12:00')
        return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    } catch {
        return dateStr
    }
}

function getEmbedUrl(url: string): string | null {
    if (!url) return null
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
    return null
}
