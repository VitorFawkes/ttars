/**
 * TripPlanView — Portal público "Minha Viagem" (pós-aceite).
 *
 * Mesmo link /p/:token, renderizado quando proposta está aceita e trip plan existe.
 * Mobile-first, light mode, sem autenticação.
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { TripPlan } from '@/hooks/useTripPlan'
import {
    CalendarDays,
    FileDown,
    Users,
    CheckSquare,
    Phone,
    Mail,
    ExternalLink,
    Check,
    Clock,
    Plane,
    Building2,
    Car,
    Sparkles,
} from 'lucide-react'

interface TripPlanViewProps {
    plan: TripPlan
}

type Tab = 'timeline' | 'vouchers' | 'contacts' | 'checklist'

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'timeline', label: 'Cronograma', icon: CalendarDays },
    { key: 'vouchers', label: 'Vouchers', icon: FileDown },
    { key: 'contacts', label: 'Contatos', icon: Users },
    { key: 'checklist', label: 'Checklist', icon: CheckSquare },
]

const TYPE_ICONS: Record<string, React.ElementType> = {
    hotel: Building2,
    flight: Plane,
    transfer: Car,
    experience: Sparkles,
}

export default function TripPlanView({ plan }: TripPlanViewProps) {
    const [activeTab, setActiveTab] = useState<Tab>('timeline')

    const title = plan.proposal?.title || 'Minha Viagem'

    return (
        <div className="min-h-dvh bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="px-4 py-4">
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                        {title}
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {plan.status === 'active' ? 'Viagem confirmada' : 'Viagem concluída'}
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex border-t border-slate-100">
                    {TABS.map(tab => {
                        const Icon = tab.icon
                        const isActive = activeTab === tab.key
                        const count = getTabCount(plan, tab.key)
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'flex-1 py-3 flex flex-col items-center gap-1 text-xs font-medium transition-colors',
                                    isActive
                                        ? 'text-indigo-600 border-b-2 border-indigo-600'
                                        : 'text-slate-400 hover:text-slate-600'
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                <span>{tab.label}</span>
                                {count > 0 && (
                                    <span className={cn(
                                        'px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none',
                                        isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                                    )}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </header>

            {/* Content */}
            <div className="p-4 pb-8">
                {activeTab === 'timeline' && <TimelineTab entries={plan.timeline} />}
                {activeTab === 'vouchers' && <VouchersTab entries={plan.vouchers} />}
                {activeTab === 'contacts' && <ContactsTab entries={plan.contacts} />}
                {activeTab === 'checklist' && <ChecklistTab entries={plan.checklist} />}
            </div>
        </div>
    )
}

// ─── Timeline ───────────────────────────────────────────────────────────────

function TimelineTab({ entries }: { entries: TripPlan['timeline'] }) {
    if (!entries?.length) {
        return <EmptyState message="Seu cronograma será preenchido em breve." icon={CalendarDays} />
    }

    return (
        <div className="space-y-3">
            {entries.map((entry, i) => {
                const Icon = TYPE_ICONS[entry.type] || Clock
                return (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                                <Icon className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-slate-900 text-sm">{entry.title}</h3>
                                {entry.date && (
                                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                        <CalendarDays className="h-3 w-3" />
                                        {entry.date}
                                        {entry.time && ` às ${entry.time}`}
                                    </p>
                                )}
                                {entry.description && (
                                    <p className="text-sm text-slate-600 mt-2">{entry.description}</p>
                                )}
                                {entry.notes && (
                                    <p className="text-xs text-slate-400 mt-1 italic">{entry.notes}</p>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Vouchers ───────────────────────────────────────────────────────────────

function VouchersTab({ entries }: { entries: TripPlan['vouchers'] }) {
    if (!entries?.length) {
        return <EmptyState message="Seus vouchers aparecerão aqui quando estiverem prontos." icon={FileDown} />
    }

    return (
        <div className="space-y-2">
            {entries.map((v, i) => (
                <a
                    key={i}
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                >
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                        <FileDown className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 text-sm truncate">{v.label}</p>
                        <p className="text-xs text-slate-400">{v.type}</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-slate-300 shrink-0" />
                </a>
            ))}
        </div>
    )
}

// ─── Contacts ───────────────────────────────────────────────────────────────

function ContactsTab({ entries }: { entries: TripPlan['contacts'] }) {
    if (!entries?.length) {
        return <EmptyState message="Os contatos da sua viagem serão adicionados aqui." icon={Users} />
    }

    return (
        <div className="space-y-2">
            {entries.map((c, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="font-semibold text-slate-900 text-sm">{c.name}</h3>
                            <p className="text-xs text-slate-500">{c.role}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {c.phone && (
                                <a
                                    href={`tel:${c.phone}`}
                                    className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                                >
                                    <Phone className="h-4 w-4 text-emerald-600" />
                                </a>
                            )}
                            {c.email && (
                                <a
                                    href={`mailto:${c.email}`}
                                    className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center hover:bg-blue-100 transition-colors"
                                >
                                    <Mail className="h-4 w-4 text-blue-600" />
                                </a>
                            )}
                        </div>
                    </div>
                    {c.notes && (
                        <p className="text-xs text-slate-400 mt-2">{c.notes}</p>
                    )}
                </div>
            ))}
        </div>
    )
}

// ─── Checklist ──────────────────────────────────────────────────────────────

function ChecklistTab({ entries }: { entries: TripPlan['checklist'] }) {
    if (!entries?.length) {
        return <EmptyState message="Sua checklist de viagem será preenchida em breve." icon={CheckSquare} />
    }

    return (
        <div className="space-y-2">
            {entries.map((item, i) => (
                <div
                    key={i}
                    className={cn(
                        'flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-4',
                        item.checked && 'bg-emerald-50/50 border-emerald-200'
                    )}
                >
                    <div className={cn(
                        'w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0',
                        item.checked
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-slate-300'
                    )}>
                        {item.checked && <Check className="h-4 w-4 text-white" />}
                    </div>
                    <div className="flex-1">
                        <p className={cn(
                            'text-sm',
                            item.checked ? 'text-emerald-800 line-through' : 'text-slate-900'
                        )}>
                            {item.label}
                        </p>
                        {item.category && (
                            <p className="text-xs text-slate-400">{item.category}</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ message, icon: Icon }: { message: string; icon: React.ElementType }) {
    return (
        <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Icon className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">{message}</p>
        </div>
    )
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getTabCount(plan: TripPlan, tab: Tab): number {
    switch (tab) {
        case 'timeline': return plan.timeline?.length ?? 0
        case 'vouchers': return plan.vouchers?.length ?? 0
        case 'contacts': return plan.contacts?.length ?? 0
        case 'checklist': return plan.checklist?.length ?? 0
    }
}
