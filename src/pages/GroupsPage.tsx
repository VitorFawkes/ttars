import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { GroupSummaryCard } from '../components/cards/group/GroupSummaryCard';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Search, Plus, Users, Filter, Plane } from 'lucide-react';
import CreateGroupModal from '../components/cards/group/CreateGroupModal';
import type { Database } from '../database.types';

type Card = Database['public']['Tables']['cards']['Row'];

export default function GroupsPage() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);

    const { data: groups, isLoading } = useQuery({
        queryKey: ['groups-gallery'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('*')
                .eq('is_group_parent', true)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as Card[];
        }
    });

    const filteredGroups = groups?.filter(group =>
        group.titulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.origem?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    return (
        <div className="h-full flex flex-col bg-gray-50/50 relative overflow-hidden">
            {/* Background Decoration */}
            {/* Header */}
            <div className="flex-none p-8 pb-6 relative z-10">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
                            <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm">
                                <Plane className="h-6 w-6 text-indigo-600" />
                            </div>
                            Galeria de Grupos
                        </h1>
                        <p className="text-slate-500 mt-2 ml-[3.5rem] max-w-2xl text-base font-medium">
                            Gerencie suas excursões e grupos de viagem com uma visão panorâmica.
                        </p>
                    </div>
                    <Button
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm h-10 px-6 text-sm font-medium rounded-lg transition-all"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Novo Grupo
                    </Button>
                </div>

                {/* Filters Bar */}
                <div className="flex items-center gap-4 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm max-w-4xl">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por nome, origem ou destino..."
                            className="pl-10 bg-slate-50 border-transparent focus:border-indigo-500 focus:bg-white transition-all h-10 text-sm rounded-lg"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="h-6 w-px bg-slate-200" />
                    <Button variant="ghost" className="text-slate-600 hover:bg-slate-50 hover:text-indigo-600 h-10 px-4 rounded-lg font-medium text-sm">
                        <Filter className="h-4 w-4 mr-2" />
                        Filtros
                    </Button>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-8 pt-2 relative z-10 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <div key={i} className="h-80 bg-white/40 rounded-3xl animate-pulse border border-white/20" />
                        ))}
                    </div>
                ) : filteredGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                        <div className="p-8 bg-white/50 backdrop-blur-md rounded-full mb-6 shadow-sm border border-white/20">
                            <Users className="h-16 w-16 text-gray-300" />
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Nenhum grupo encontrado</h3>
                        <p className="text-gray-500 max-w-md text-lg">
                            Não encontramos nenhum grupo com os termos pesquisados. Tente ajustar sua busca ou crie um novo grupo.
                        </p>
                        <Button variant="outline" className="mt-8 h-12 px-8 text-base rounded-xl border-gray-200 hover:bg-white/50" onClick={() => setSearchTerm('')}>
                            Limpar Filtros
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pb-20">
                        {filteredGroups.map((group) => (
                            <GroupSummaryCard key={group.id} group={group} />
                        ))}
                    </div>
                )}
            </div>

            <CreateGroupModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSuccess={(groupId) => navigate(`/cards/${groupId}`)}
            />
        </div>
    );
}
