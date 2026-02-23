
import { useState, useEffect } from 'react'
import type { Database } from '../../database.types'
import { ChevronDown, ChevronRight, Database as DatabaseIcon, Mail, Phone, User, Calendar, MapPin, Tag, RefreshCw, Clock } from 'lucide-react'
import { cn } from '../../lib/utils'
import { supabase } from '../../lib/supabase'

type Contact = Database['public']['Tables']['contatos']['Row']
type Card = Database['public']['Tables']['cards']['Row']
type IntegrationEvent = Database['public']['Tables']['integration_events']['Row']

interface ContactDetailsViewerProps {
    contact: Contact
    card?: Card // Optional, needed for raw marketing_data
}

export default function ContactDetailsViewer({ contact, card }: ContactDetailsViewerProps) {
    const [showRawData, setShowRawData] = useState(false)
    const [events, setEvents] = useState<IntegrationEvent[]>([])
    const [loadingEvents, setLoadingEvents] = useState(false)

    // Extract raw fields from card.marketing_data if available
    const marketingData = card?.marketing_data as Record<string, unknown> | null
    const rawFields = (marketingData?.raw_fields || {}) as Record<string, unknown>
    const unmappedFields = (marketingData?.unmapped_fields || {}) as Record<string, unknown>

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-'
        return new Date(dateStr).toLocaleDateString('pt-BR')
    }

    const formatDateTime = (dateStr: string | null) => {
        if (!dateStr) return '-'
        return new Date(dateStr).toLocaleString('pt-BR')
    }

    useEffect(() => {
        if (showRawData && events.length === 0) {
            fetchIntegrationEvents()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on showRawData toggle
    }, [showRawData])

    const fetchIntegrationEvents = async () => {
        setLoadingEvents(true)
        try {
            // Build query to find events related to this contact or card
            let query = supabase
                .from('integration_events')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10)

            const conditions = []

            // 1. Match by Contact External ID (if available)
            if (contact.external_id) {
                conditions.push(`external_id.eq.${contact.external_id} `)
            }

            // 2. Match by Card External ID (if available)
            if (card?.external_id) {
                conditions.push(`external_id.eq.${card.external_id} `)
            }

            // If we have conditions, apply them with OR
            if (conditions.length > 0) {
                query = query.or(conditions.join(','))

                const { data, error } = await query
                if (error) throw error
                setEvents(data || [])
            }
        } catch (err) {
            console.error('Failed to fetch integration events:', err)
        } finally {
            setLoadingEvents(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="flex items-start gap-4 pb-6 border-b border-gray-100">
                <div className="h-16 w-16 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 text-2xl font-semibold shadow-sm">
                    {contact.nome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-900">{contact.nome} {contact.sobrenome}</h2>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium uppercase tracking-wide">
                            {contact.tipo_pessoa || 'Adulto'}
                        </span>
                        {contact.external_source === 'active_campaign' && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-xs font-medium flex items-center gap-1">
                                <DatabaseIcon className="h-3 w-3" />
                                Active Campaign
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Contact Info */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        Dados Pessoais
                    </h3>

                    <div className="space-y-3 pl-6">
                        <div>
                            <label className="text-xs font-medium text-gray-500 uppercase block">Email</label>
                            <div className="flex items-center gap-2 text-sm text-gray-900">
                                <Mail className="h-3.5 w-3.5 text-gray-400" />
                                {contact.email || '-'}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-500 uppercase block">Telefone</label>
                            <div className="flex items-center gap-2 text-sm text-gray-900">
                                <Phone className="h-3.5 w-3.5 text-gray-400" />
                                {contact.telefone || '-'}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-500 uppercase block">CPF</label>
                            <div className="text-sm text-gray-900 font-mono">
                                {contact.cpf || '-'}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-500 uppercase block">Data de Nascimento</label>
                            <div className="flex items-center gap-2 text-sm text-gray-900">
                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                {formatDate(contact.data_nascimento)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Additional Info */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        Outros Detalhes
                    </h3>

                    <div className="space-y-3 pl-6">
                        <div>
                            <label className="text-xs font-medium text-gray-500 uppercase block">Passaporte</label>
                            <div className="text-sm text-gray-900 font-mono">
                                {contact.passaporte || '-'}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-500 uppercase block">Endereço</label>
                            <div className="text-sm text-gray-900">
                                {contact.endereco ? (() => {
                                    if (typeof contact.endereco === 'string') return contact.endereco
                                    const e = contact.endereco as Record<string, string>
                                    const parts: string[] = []
                                    if (e.rua) parts.push(e.rua + (e.numero ? `, ${e.numero}` : ''))
                                    if (e.complemento) parts.push(e.complemento)
                                    if (e.bairro) parts.push(e.bairro)
                                    const cidadeUf = [e.cidade, e.estado].filter(Boolean).join(' - ')
                                    if (cidadeUf) parts.push(cidadeUf)
                                    if (e.cep) parts.push(`CEP ${e.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2')}`)
                                    if (e.pais && e.pais.toLowerCase() !== 'brasil') parts.push(e.pais)
                                    return parts.join(', ') || '-'
                                })() : '-'}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-500 uppercase block">Tags</label>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {contact.tags && contact.tags.length > 0 ? (
                                    contact.tags.map((tag, idx) => (
                                        <span key={idx} className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs border border-gray-200 flex items-center gap-1">
                                            <Tag className="h-3 w-3 text-gray-400" />
                                            {tag}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-sm text-gray-400">-</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Observations */}
            {contact.observacoes && (
                <div className="pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Observações</h3>
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-700 whitespace-pre-wrap">
                        {contact.observacoes}
                    </div>
                </div>
            )}

            {/* Source Data Inspector (Active Campaign) */}
            <div className="pt-6 border-t border-gray-200">
                <button
                    onClick={() => setShowRawData(!showRawData)}
                    className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors group"
                >
                    <div className="flex items-center gap-2">
                        <DatabaseIcon className="h-4 w-4 text-slate-500 group-hover:text-indigo-600 transition-colors" />
                        <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-700">
                            Dados de Origem (Active Campaign)
                        </span>
                    </div>
                    {showRawData ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                </button>

                {showRawData && (
                    <div className="mt-2 space-y-6 animate-in slide-in-from-top-2 duration-200">
                        {/* 1. IDs Summary */}
                        <div className="grid grid-cols-2 gap-4 p-3 bg-white border border-slate-200 rounded-lg">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Contact External ID</label>
                                <div className="font-mono text-xs text-slate-700">{contact.external_id || '-'}</div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Card External ID</label>
                                <div className="font-mono text-xs text-slate-700">{card?.external_id || '-'}</div>
                            </div>
                        </div>

                        {/* 2. Integration Events History */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Histórico de Eventos (Últimos 10)</h4>
                                <button
                                    onClick={fetchIntegrationEvents}
                                    disabled={loadingEvents}
                                    className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                >
                                    <RefreshCw className={cn("h-3 w-3", loadingEvents && "animate-spin")} />
                                </button>
                            </div>

                            {loadingEvents ? (
                                <div className="p-4 text-center text-xs text-slate-400">Carregando eventos...</div>
                            ) : events.length > 0 ? (
                                <div className="space-y-3">
                                    {events.map((event) => (
                                        <div key={event.id} className="border border-slate-200 rounded-lg overflow-hidden">
                                            <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "w-2 h-2 rounded-full",
                                                        event.status === 'processed' ? "bg-green-500" :
                                                            event.status === 'failed' ? "bg-red-500" :
                                                                "bg-yellow-500"
                                                    )} />
                                                    <span className="text-xs font-medium text-slate-700">{event.event_type}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono">({event.entity_type})</span>
                                                </div>
                                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                                    <Clock className="h-3 w-3" />
                                                    {formatDateTime(event.created_at)}
                                                </div>
                                            </div>
                                            <div className="bg-slate-900 p-3 overflow-x-auto">
                                                <pre className="text-[10px] font-mono text-slate-300">
                                                    {JSON.stringify(event.payload, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-400">
                                    Nenhum evento de integração encontrado para este contato/card.
                                </div>
                            )}
                        </div>

                        {/* 3. Mapped Marketing Fields + Legacy Raw */}
                        {marketingData && (() => {
                            // Campos mapeados com valor (exclui metadados internos e objetos)
                            const internalKeys = new Set(['source', 'active_campaign_id', 'raw_fields', 'unmapped_fields']);
                            const mappedEntries = Object.entries(marketingData)
                                .filter(([k, v]) => !internalKeys.has(k) && v !== null && v !== undefined && v !== '' && typeof v !== 'object');

                            // raw_fields e unmapped_fields filtrados (só não-vazios)
                            const nonEmptyRaw = Object.entries(rawFields).filter(([, v]) => v !== '' && v !== null && v !== undefined);
                            const nonEmptyUnmapped = Object.entries(unmappedFields).filter(([, v]) => v !== '' && v !== null && v !== undefined);

                            const humanLabel = (key: string) => key
                                .replace(/^mkt_/, '')
                                .replace(/_/g, ' ')
                                .replace(/\b\w/g, l => l.toUpperCase());

                            return (
                                <div className="space-y-4">
                                    {mappedEntries.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Dados do Active Campaign</h4>
                                            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                                                {mappedEntries.map(([key, value]) => (
                                                    <div key={key} className="flex items-start gap-3 px-3 py-2">
                                                        <span className="text-[11px] font-medium text-slate-500 min-w-[140px] shrink-0 pt-0.5">{humanLabel(key)}</span>
                                                        <span className="text-xs text-slate-800 break-all">{String(value)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {(nonEmptyRaw.length > 0 || nonEmptyUnmapped.length > 0) && (
                                        <div className="opacity-60">
                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Campos Não Mapeados ({nonEmptyRaw.length + nonEmptyUnmapped.length})</h4>
                                            <pre className="p-3 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-mono overflow-x-auto max-h-[150px]">
                                                {JSON.stringify(
                                                    {
                                                        ...(nonEmptyRaw.length > 0 ? { raw_fields: Object.fromEntries(nonEmptyRaw) } : {}),
                                                        ...(nonEmptyUnmapped.length > 0 ? { unmapped_fields: Object.fromEntries(nonEmptyUnmapped) } : {})
                                                    },
                                                    null, 2
                                                )}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
        </div>
    )
}
