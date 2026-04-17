import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { Users, DollarSign, Plus, Link as LinkIcon, ExternalLink, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import LinkExistingCardModal from './LinkExistingCardModal';
import CreateChildCardModal from './CreateChildCardModal';
import BulkAddTravelersModal from './BulkAddTravelersModal';
import type { Database } from '../../../database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface GroupDashboardProps {
    card: Card;
    onRefresh: () => void;
}

export function GroupDashboard({ card, onRefresh }: GroupDashboardProps) {
    // List logic moved to GroupTravelersList
    const [childCount, setChildCount] = useState(0);
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

    const [parentDetails, setParentDetails] = useState<{
        start: string | null;
        end: string | null;
        origin: string | null;
    }>({ start: null, end: null, origin: null });

    const fetchParentDetails = async () => {
        const { data } = await supabase
            .from('cards')
            .select('data_viagem_inicio, data_viagem_fim, origem')
            .eq('id', card.id!)
            .single();

        if (data) {
            setParentDetails({
                start: data.data_viagem_inicio,
                end: data.data_viagem_fim,
                origin: data.origem
            });
        }
    };

    const fetchChildCount = async () => {
        const { count } = await supabase
            .from('cards')
            .select('*', { count: 'exact', head: true })
            .eq('parent_card_id', card.id!);
        setChildCount(count || 0);
    };

    useEffect(() => {
        if (card.id) {
            fetchChildCount();
            fetchParentDetails();
        }
    }, [card.id]);

    const totalRevenue = card.group_total_revenue || 0;
    const totalPax = card.group_total_pax || 0;
    const capacity = card.group_capacity || 0;
    const occupancyRate = capacity > 0 ? (totalPax / capacity) * 100 : 0;

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary-500" />
                        Painel da Excursão
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">
                        Gerencie os viajantes e acompanhe o progresso do grupo.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        className="border-gray-200 hover:bg-gray-50 text-gray-700"
                        onClick={() => setIsLinkModalOpen(true)}
                    >
                        <LinkIcon className="w-4 h-4 mr-2" />
                        Vincular Existente
                    </Button>
                    <Button
                        variant="outline"
                        className="border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700"
                        onClick={() => setIsBulkModalOpen(true)}
                    >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Adicionar em Massa
                    </Button>
                    <Button
                        className="bg-primary-600 hover:bg-primary-700 text-white border-none"
                        onClick={() => setIsCreateModalOpen(true)}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Novo Viajante
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {/* Stat Card: Revenue */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 transition-colors hover:bg-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-100 rounded-lg border border-emerald-200">
                            <DollarSign className="w-5 h-5 text-emerald-600" />
                        </div>
                        <span className="text-gray-500 text-sm font-medium">Receita Total</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                        {formatCurrency(totalRevenue)}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        Soma de {childCount} contratos
                    </div>
                </div>

                {/* Stat Card: Pax */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 transition-colors hover:bg-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-100 rounded-lg border border-blue-200">
                            <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="text-gray-500 text-sm font-medium">Passageiros</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                        {totalPax} <span className="text-lg text-gray-400 font-normal">/ {capacity || '∞'}</span>
                    </div>
                    <div className="w-full bg-gray-200 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div
                            className="bg-blue-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(occupancyRate, 100)}%` }}
                        />
                    </div>
                </div>

                {/* Stat Card: Status */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 transition-colors hover:bg-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-100 rounded-lg border border-purple-200">
                            <ExternalLink className="w-5 h-5 text-purple-600" />
                        </div>
                        <span className="text-gray-500 text-sm font-medium">Status do Grupo</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                        {occupancyRate >= 100 ? 'Lotado' : 'Aberto'}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        {capacity > 0 ? `${capacity - totalPax} vagas restantes` : 'Sem limite definido'}
                    </div>
                </div>
            </div>

            {/* Modals */}
            {card.id && (
                <>
                    <LinkExistingCardModal
                        isOpen={isLinkModalOpen}
                        onClose={() => setIsLinkModalOpen(false)}
                        parentCardId={card.id!}
                        onLinkSuccess={() => {
                            fetchChildCount()
                            onRefresh()
                        }}
                    />

                    <CreateChildCardModal
                        isOpen={isCreateModalOpen}
                        onClose={() => setIsCreateModalOpen(false)}
                        parentCardId={card.id!}
                        parentProduct={card.produto || 'TRIPS'}
                        parentTitle={card.titulo || ''}
                    />

                    <BulkAddTravelersModal
                        isOpen={isBulkModalOpen}
                        onClose={() => setIsBulkModalOpen(false)}
                        parentCardId={card.id!}
                        parentProduct={card.produto || 'TRIPS'}
                        parentTitle={card.titulo || ''}
                        parentDates={{
                            start: parentDetails.start || card.data_viagem_inicio,
                            end: parentDetails.end
                        }}
                        parentDestination={{
                            origin: parentDetails.origin || card.origem,
                            destination: null
                        }}
                    />
                </>
            )}

        </div>
    );
}
