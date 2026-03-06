import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Bot, Phone, Check, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

const KNOWN_LINES = [
    { label: 'SDR Trips', description: 'Linha SDR de viagens' },
    { label: 'Welcome Trips', description: 'Linha principal Trips' },
    { label: 'Welconnect', description: 'Linha Welconnect' },
    { label: 'Concierge Welcome', description: 'Linha Concierge' },
    { label: 'Marketing Welcome', description: 'Linha Marketing' },
    { label: 'Extras', description: 'Linha Extras' },
    { label: 'Trips - Travel Planner', description: 'Linha Travel Planner Trips' },
]

export default function JuliaIAConfig() {
    const queryClient = useQueryClient()
    const [saving, setSaving] = useState(false)

    const { data: currentLabels, isLoading } = useQuery({
        queryKey: ['julia-phone-labels'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_settings')
                .select('value')
                .eq('key', 'JULIA_PHONE_LABELS')
                .single()
            if (error) return []
            return (data?.value || '').split(',').map((s: string) => s.trim()).filter(Boolean)
        },
    })

    const toggleLine = async (label: string) => {
        if (saving) return
        setSaving(true)
        try {
            const current = currentLabels || []
            const updated = current.includes(label)
                ? current.filter((l: string) => l !== label)
                : [...current, label]

            await supabase
                .from('integration_settings')
                .upsert({
                    key: 'JULIA_PHONE_LABELS',
                    value: updated.join(','),
                }, { onConflict: 'key' })

            queryClient.invalidateQueries({ queryKey: ['julia-phone-labels'] })
        } finally {
            setSaving(false)
        }
    }

    const activeCount = currentLabels?.length || 0

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-50">
                    <Bot className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Julia IA - Linhas Ativas</h2>
                    <p className="text-sm text-slate-500">
                        Selecione em quais linhas WhatsApp a Julia responde automaticamente
                    </p>
                </div>
            </div>

            {/* Status */}
            <div className={cn(
                "px-4 py-3 rounded-lg border text-sm font-medium",
                activeCount > 0
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-50 text-slate-500 border-slate-200"
            )}>
                {activeCount > 0
                    ? `Julia ativa em ${activeCount} linha${activeCount > 1 ? 's' : ''}`
                    : 'Julia desativada — nenhuma linha selecionada'
                }
            </div>

            {/* Lines Grid */}
            {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando configuracao...
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {KNOWN_LINES.map((line) => {
                        const isActive = currentLabels?.includes(line.label) || false
                        return (
                            <button
                                key={line.label}
                                onClick={() => toggleLine(line.label)}
                                disabled={saving}
                                className={cn(
                                    "flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left",
                                    saving && "opacity-50 cursor-not-allowed",
                                    isActive
                                        ? "border-indigo-500 bg-indigo-50/50"
                                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                )}
                            >
                                <div className={cn(
                                    "flex items-center justify-center h-8 w-8 rounded-full shrink-0",
                                    isActive
                                        ? "bg-indigo-500 text-white"
                                        : "bg-slate-100 text-slate-400"
                                )}>
                                    {isActive ? (
                                        <Check className="h-4 w-4" />
                                    ) : (
                                        <Phone className="h-4 w-4" />
                                    )}
                                </div>
                                <div>
                                    <p className={cn(
                                        "font-medium text-sm",
                                        isActive ? "text-indigo-700" : "text-slate-700"
                                    )}>
                                        {line.label}
                                    </p>
                                    <p className="text-xs text-slate-400">{line.description}</p>
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Info */}
            <p className="text-xs text-slate-400">
                Mensagens de linhas nao selecionadas continuam sendo salvas no CRM, mas Julia nao responde.
            </p>
        </div>
    )
}
