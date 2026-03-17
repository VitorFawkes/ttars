import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Download, Search, ExternalLink } from 'lucide-react';
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

interface RoomingListProps {
    parentId: string;
}

interface RoomingItem {
    contactId: string;
    name: string;
    email: string | null;
    phone: string | null;
    type: string | null; // adulto, crianca
    cardId: string;
    cardTitle: string | null;
}

export function GroupRoomingList({ parentId }: RoomingListProps) {
    const [items, setItems] = useState<RoomingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();



    const fetchRoomingList = useCallback(async () => {
        try {
            // Fetch all child cards and their linked contacts
            const { data, error } = await supabase
                .from('cards')
                .select(`
                    id,
                    titulo,
                    cards_contatos(
                        contato: contatos(
                            id,
                            nome,
                            email,
                            telefone,
                            tipo_pessoa
                        )
                    )
                `)
                .eq('parent_card_id', parentId);

            if (error) throw error;

            // Flatten the data
            const flattened: RoomingItem[] = [];
            data?.forEach((card: any) => {
                card.cards_contatos?.forEach((cc: any) => {
                    if (cc.contato) {
                        flattened.push({
                            contactId: cc.contato.id,
                            name: cc.contato.nome,
                            email: cc.contato.email,
                            phone: cc.contato.telefone,
                            type: cc.contato.tipo_pessoa,
                            cardId: card.id,
                            cardTitle: card.titulo
                        });
                    }
                });
            });

            setItems(flattened);
        } catch (error) {
            console.error('Error fetching rooming list:', error);
        } finally {
            setLoading(false);
        }
    }, [parentId]);

    useEffect(() => {
        fetchRoomingList();
    }, [fetchRoomingList]);

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.cardTitle?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleExport = () => {
        const headers = ['Nome', 'Tipo', 'Email', 'Telefone', 'Vinculado a'];
        const csvContent = [
            headers.join(','),
            ...filteredItems.map(item => [
                `"${item.name}"`,
                `"${item.type === 'crianca' ? 'Não Adulto' : 'Adulto'}"`,
                `"${item.email || ''}"`,
                `"${item.phone || ''}"`,
                `"${item.cardTitle || ''}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `lista_passageiros_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Lista de Passageiros</h3>
                    <p className="text-gray-500 text-sm">
                        Lista consolidada de todos os passageiros deste grupo.
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar passageiro..."
                            className="pl-9 h-9 w-[200px] bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:bg-white transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" size="sm" className="h-9 border-gray-200 text-gray-700 hover:bg-gray-50" onClick={handleExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Exportar CSV
                    </Button>
                </div>
            </div>

            <div className="rounded-lg border border-gray-200 overflow-hidden">
                <Table>
                    <TableHeader className="bg-gray-50">
                        <TableRow className="border-gray-200 hover:bg-gray-50">
                            <TableHead className="px-6 py-3 text-gray-500 font-medium">Nome</TableHead>
                            <TableHead className="px-6 py-3 text-gray-500 font-medium">Tipo</TableHead>
                            <TableHead className="px-6 py-3 text-gray-500 font-medium">Contato</TableHead>
                            <TableHead className="px-6 py-3 text-gray-500 font-medium">Vinculado a</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                                    Carregando lista de passageiros...
                                </TableCell>
                            </TableRow>
                        ) : filteredItems.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                                    Nenhum passageiro encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredItems.map((item, index) => (
                                <TableRow
                                    key={`${item.cardId}-${index}`}
                                    className="border-gray-100 hover:bg-gray-50/50 transition-colors"
                                >
                                    <TableCell className="px-6 py-4 font-medium text-gray-900">
                                        {item.name || 'Nome não informado'}
                                    </TableCell>
                                    <TableCell className="px-6 py-4">
                                        <Badge variant="outline" className={`border-0 ${item.type === 'crianca'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            {item.type === 'crianca' ? 'Não Adulto' : 'Adulto'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-gray-600">
                                        {item.email || item.phone || '-'}
                                    </TableCell>
                                    <TableCell className="px-6 py-4">
                                        <div
                                            className="flex items-center gap-2 text-primary-600 hover:text-primary-700 cursor-pointer font-medium"
                                            onClick={() => navigate(`/cards/${item.cardId}`)}
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            {item.cardTitle}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-xs text-gray-500 flex justify-between rounded-b-lg">
                <span>Total de Passageiros: {filteredItems.length}</span>
                <span>
                    {filteredItems.filter(i => i.type === 'adulto').length} Adultos, {filteredItems.filter(i => i.type === 'crianca').length} Não Adultos
                </span>
            </div>
        </div>
    );
}
