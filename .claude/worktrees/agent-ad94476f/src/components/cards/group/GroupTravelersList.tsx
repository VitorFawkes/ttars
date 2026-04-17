import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { ExternalLink, Plus, Search, Filter, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/Table";
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Database } from '../../../database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface GroupTravelersListProps {
    parentId: string;
}

export function GroupTravelersList({ parentId }: GroupTravelersListProps) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [children, setChildren] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');



    const fetchChildren = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('cards')
                .select('*')
                .eq('parent_card_id', parentId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setChildren(data || []);
        } catch (error) {
            console.error('Error fetching group children:', error);
        } finally {
            setLoading(false);
        }
    }, [parentId]);

    useEffect(() => {
        fetchChildren();
    }, [fetchChildren]);

    const filteredChildren = children.filter(child =>
        child.titulo?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Viagens</h3>
                    <p className="text-gray-500 text-sm">
                        Gerencie as viagens individuais vinculadas a este grupo.
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar viajante..."
                            className="pl-9 h-9 w-[200px] bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:bg-white transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" size="sm" className="h-9 border-gray-200 text-gray-700 hover:bg-gray-50">
                        <Filter className="h-4 w-4 mr-2" />
                        Filtros
                    </Button>
                    <Button size="sm" className="h-9 bg-primary-600 hover:bg-primary-700 text-white border-none">
                        <Plus className="h-4 w-4 mr-2" />
                        Novo
                    </Button>
                </div>
            </div>

            <div className="rounded-lg border border-gray-200 overflow-hidden">
                <Table>
                    <TableHeader className="bg-gray-50">
                        <TableRow className="border-gray-200 hover:bg-gray-50">
                            <TableHead className="text-gray-500 font-medium">Viajante / Título</TableHead>
                            <TableHead className="text-gray-500 font-medium">Status</TableHead>
                            <TableHead className="text-gray-500 font-medium">Valor</TableHead>
                            <TableHead className="text-right text-gray-500 font-medium">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                                    Carregando viajantes...
                                </TableCell>
                            </TableRow>
                        ) : filteredChildren.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                                    Nenhum viajante encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredChildren.map((child) => (
                                <TableRow
                                    key={child.id}
                                    className="border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer group"
                                    onClick={() => navigate(`/cards/${child.id}`)}
                                >
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200 text-gray-600 text-xs font-medium">
                                                {child.titulo?.substring(0, 2).toUpperCase()}
                                            </div>
                                            <span className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
                                                {child.titulo}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200">
                                            {child.status_comercial || 'Novo'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-gray-600 font-medium">
                                        {formatCurrency(child.valor_final || 0)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 hover:bg-red-50"
                                                title="Remover do Grupo"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Tem certeza que deseja remover este viajante do grupo? O card não será excluído, apenas desvinculado.')) {
                                                        await supabase.from('cards').update({ parent_card_id: null }).eq('id', child.id);
                                                        fetchChildren();
                                                        queryClient.invalidateQueries({ queryKey: ['card-detail', parentId] });
                                                        queryClient.invalidateQueries({ queryKey: ['groups-gallery'] });
                                                    }
                                                }}
                                            >
                                                <Unlink className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-900 hover:bg-gray-100"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/cards/${child.id}`);
                                                }}
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
