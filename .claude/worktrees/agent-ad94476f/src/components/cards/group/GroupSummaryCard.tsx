import { useNavigate } from 'react-router-dom';
import type { Database } from '../../../database.types';
import { Calendar, MapPin, ArrowRight, Plane, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Card = Database['public']['Tables']['cards']['Row'];

interface GroupSummaryCardProps {
    group: Card;
}

export function GroupSummaryCard({ group }: GroupSummaryCardProps) {
    const navigate = useNavigate();

    // Status Mapping Logic
    const getStatusLabel = (status: string | null) => {
        if (!status) return null;
        const normalized = status.toLowerCase();
        if (normalized === 'em_andamento' || normalized === 'em_aberto') return 'Em Aberto';
        if (normalized === 'concluido' || normalized === 'encerrado') return 'Encerrado';
        if (normalized === 'cancelado') return 'Cancelado';
        return status.replace(/_/g, ' ');
    };

    const getStatusColor = (status: string | null) => {
        if (!status) return 'bg-slate-100 text-slate-600 border-slate-200';
        const normalized = status.toLowerCase();

        if (normalized === 'em_andamento' || normalized === 'em_aberto') {
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        }
        if (normalized === 'concluido' || normalized === 'encerrado') {
            return 'bg-blue-50 text-blue-700 border-blue-200';
        }
        if (normalized === 'cancelado') {
            return 'bg-red-50 text-red-700 border-red-200';
        }
        return 'bg-slate-100 text-slate-600 border-slate-200';
    };

    const statusLabel = getStatusLabel(group.status_comercial);
    const statusColor = getStatusColor(group.status_comercial);

    // Format dates safely
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return null;
        try {
            return format(new Date(dateStr), "dd MMM, yyyy", { locale: ptBR });
        } catch (e) {
            return null;
        }
    };

    const startDate = formatDate(group.data_viagem_inicio);
    const endDate = formatDate(group.data_viagem_fim);

    // Occupancy Logic
    const capacity = group.group_capacity || 0;
    const pax = group.group_total_pax || 0;
    const occupancyRate = capacity > 0 ? (pax / capacity) * 100 : 0;

    return (
        <div
            onClick={() => navigate(`/cards/${group.id}`)}
            className="group flex flex-col bg-white border border-slate-200 shadow-sm rounded-xl hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer overflow-hidden h-full"
        >
            {/* Header Section */}
            <div className="p-5 pb-4">
                <div className="flex items-start justify-between mb-4">
                    <div className="p-2.5 bg-indigo-50 rounded-lg border border-indigo-100 group-hover:bg-indigo-100 transition-colors">
                        <Plane className="h-5 w-5 text-indigo-600" />
                    </div>
                    {statusLabel && (
                        <span className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide rounded-full border ${statusColor}`}>
                            {statusLabel}
                        </span>
                    )}
                </div>

                <h3 className="font-semibold text-slate-900 text-lg leading-tight mb-3 group-hover:text-indigo-600 transition-colors line-clamp-2 min-h-[3.5rem]">
                    {group.titulo}
                </h3>

                <div className="space-y-2">
                    {group.origem && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                            <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="truncate">
                                {group.origem}
                                {(group.produto_data as any)?.destinos?.length > 0
                                    ? ` → ${(group.produto_data as any).destinos[0]}`
                                    : ''}
                            </span>
                        </div>
                    )}

                    {(startDate || endDate) && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                            <span>{startDate || '?'} - {endDate || '?'}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-slate-100 w-full" />

            {/* Footer / Occupancy Section */}
            <div className="p-5 pt-4 mt-auto bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        <Users className="h-3.5 w-3.5" />
                        <span>Ocupação</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-700">
                        {pax} <span className="text-slate-400 font-normal">/ {capacity || '∞'}</span>
                    </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mb-4">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${occupancyRate >= 100 ? 'bg-red-500' :
                            occupancyRate >= 80 ? 'bg-amber-500' :
                                'bg-indigo-500'
                            }`}
                        style={{ width: `${Math.min(occupancyRate, 100)}%` }}
                    />
                </div>

                <div className="flex items-center justify-end">
                    <div className="flex items-center gap-1 text-indigo-600 font-medium text-sm opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                        <span>Gerenciar Grupo</span>
                        <ArrowRight className="h-4 w-4" />
                    </div>
                </div>
            </div>
        </div>
    );
}
