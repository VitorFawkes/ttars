/**
 * MobilePreview — Preview mobile em tempo real do portal.
 * Renderiza os blocos publicados como o cliente veria.
 */

import { useTripPlanEditor } from '@/hooks/useTripPlanEditor'
import {
    CalendarDays,
    FileDown,
    Phone,
    Mail,
    MessageCircle,
    Check,
    Lightbulb,

    Video,
    MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function MobilePreview() {
    const { blocks, getDayBlocks, getChildrenOfDay, getOrphanBlocks } = useTripPlanEditor()

    const days = getDayBlocks()
    const orphans = getOrphanBlocks()
    const hasContent = blocks.length > 0

    return (
        <div className="w-[320px] h-full border-l border-slate-200 bg-slate-100 shrink-0 flex flex-col overflow-hidden">
            {/* Preview header */}
            <div className="px-3 py-2 bg-white border-b border-slate-200 shrink-0">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Preview Mobile
                </p>
            </div>

            {/* Phone frame */}
            <div className="flex-1 overflow-y-auto p-3">
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200 min-h-[500px]">
                    {/* Status bar */}
                    <div className="h-6 bg-slate-900 flex items-center justify-center">
                        <div className="w-16 h-1 bg-slate-600 rounded-full" />
                    </div>

                    {/* Content */}
                    <div className="p-3 space-y-3">
                        {!hasContent && (
                            <div className="text-center py-12">
                                <p className="text-xs text-slate-400">
                                    Adicione blocos para ver o preview
                                </p>
                            </div>
                        )}

                        {/* Pre-trip sections */}
                        {orphans.filter(b => b.block_type === 'pre_trip_section').map(block => (
                            <PreTripPreview key={block.id} data={block.data} />
                        ))}

                        {/* Days */}
                        {days.map(day => (
                            <div key={day.id} className="space-y-2">
                                <DayPreview data={day.data} />
                                {getChildrenOfDay(day.id).map(child => (
                                    <BlockPreview key={child.id} block={child} />
                                ))}
                            </div>
                        ))}

                        {/* Contacts at bottom */}
                        {orphans.filter(b => b.block_type === 'contact').map(block => (
                            <ContactPreview key={block.id} data={block.data} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Preview components ─────────────────────────────────────────────────────

function DayPreview({ data }: { data: Record<string, unknown> }) {
    const title = String(data.title || 'Novo dia')
    const date = String(data.date || '')
    const city = String(data.city || '')

    return (
        <div className="bg-indigo-50 rounded-lg p-2.5 border border-indigo-100">
            <div className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-indigo-600" />
                <span className="text-xs font-bold text-indigo-900">{title}</span>
            </div>
            {(date || city) && (
                <p className="text-[10px] text-indigo-500 mt-0.5 ml-5">
                    {date && new Date(date + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                    {date && city && ' — '}
                    {city}
                </p>
            )}
        </div>
    )
}

function BlockPreview({ block }: { block: { block_type: string; data: Record<string, unknown> } }) {
    switch (block.block_type) {
        case 'tip':
            return (
                <div className="bg-yellow-50 rounded-lg p-2 border border-yellow-100">
                    <div className="flex items-start gap-1.5">
                        <Lightbulb className="h-3 w-3 text-yellow-500 mt-0.5 shrink-0" />
                        <div>
                            {(block.data.title as string) && (
                                <p className="text-[10px] font-bold text-yellow-800">{String(block.data.title as string)}</p>
                            )}
                            <p className="text-[10px] text-yellow-700 line-clamp-3">
                                {String((block.data.content as string) || '')}
                            </p>
                        </div>
                    </div>
                </div>
            )

        case 'photo':
            return (block.data.image_url as string) ? (
                <div>
                    <img
                        src={String(block.data.image_url)}
                        alt={String(block.data.caption || '')}
                        className="w-full h-24 object-cover rounded-lg"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    {(block.data.caption as string) && (
                        <p className="text-[9px] text-slate-400 mt-0.5">{String(block.data.caption as string)}</p>
                    )}
                </div>
            ) : null

        case 'video':
            return block.data.url ? (
                <div className="bg-purple-50 rounded-lg p-2 border border-purple-100">
                    <div className="flex items-center gap-1.5">
                        <Video className="h-3 w-3 text-purple-500" />
                        <span className="text-[10px] text-purple-700 truncate">
                            {String((block.data.caption as string) || (block.data.url as string))}
                        </span>
                    </div>
                </div>
            ) : null

        case 'voucher':
            return (
                <div className="bg-amber-50 rounded-lg p-2 border border-amber-100">
                    <div className="flex items-center gap-1.5">
                        <FileDown className="h-3 w-3 text-amber-600" />
                        <span className="text-[10px] text-amber-800 truncate">
                            {String((block.data.file_name as string) || 'Voucher')}
                        </span>
                    </div>
                    {(block.data.supplier as string) && (
                        <p className="text-[9px] text-amber-500 ml-4.5 mt-0.5">{String(block.data.supplier as string)}</p>
                    )}
                </div>
            )

        case 'travel_item':
            return (
                <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                    <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-emerald-600" />
                        <span className="text-[10px] font-medium text-emerald-800 truncate">
                            {String((block.data.title as string) || 'Item da viagem')}
                        </span>
                    </div>
                </div>
            )

        case 'checklist':
            const items = Array.isArray(block.data.items) ? block.data.items : []
            return (
                <div className="space-y-1">
                    {(items as Array<{ label: string; checked: boolean }>).slice(0, 4).map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                            <div className={cn(
                                'w-3 h-3 rounded border flex items-center justify-center',
                                item.checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                            )}>
                                {item.checked && <Check className="h-2 w-2 text-white" />}
                            </div>
                            <span className={cn(
                                'text-[10px]',
                                item.checked ? 'text-slate-400 line-through' : 'text-slate-700'
                            )}>
                                {item.label}
                            </span>
                        </div>
                    ))}
                </div>
            )

        default:
            return null
    }
}

function ContactPreview({ data }: { data: Record<string, unknown> }) {
    return (
        <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
            <p className="text-[10px] font-bold text-blue-900">{String((data.name as string) || '')}</p>
            <p className="text-[9px] text-blue-500">{String((data.role as string) || '')}</p>
            <div className="flex gap-2 mt-1">
                {(data.phone as string) && <Phone className="h-3 w-3 text-blue-400" />}
                {(data.email as string) && <Mail className="h-3 w-3 text-blue-400" />}
                {(data.whatsapp as string) && <MessageCircle className="h-3 w-3 text-blue-400" />}
            </div>
        </div>
    )
}

function PreTripPreview({ data }: { data: Record<string, unknown> }) {
    const topics = Array.isArray(data.topics) ? (data.topics as string[]) : []
    if (topics.length === 0) return null

    return (
        <div className="bg-orange-50 rounded-lg p-2 border border-orange-100">
            <p className="text-[10px] font-bold text-orange-800 mb-1">📋 Antes da viagem</p>
            <div className="space-y-0.5">
                {topics.slice(0, 5).map(t => (
                    <p key={t} className="text-[9px] text-orange-600">• {t}</p>
                ))}
                {topics.length > 5 && (
                    <p className="text-[9px] text-orange-400">+{topics.length - 5} mais</p>
                )}
            </div>
        </div>
    )
}
