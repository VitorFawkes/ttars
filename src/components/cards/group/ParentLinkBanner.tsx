import { useEffect, useState } from 'react';
import type { Database } from '@/database.types';
import { supabase } from '@/lib/supabase';
import { Users, ArrowUpRight, Unlink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Card = Database['public']['Tables']['cards']['Row'];

interface ParentLinkBannerProps {
    parentId: string;
    cardId: string;
    onUnlinked?: () => void;
}

export function ParentLinkBanner({ parentId, cardId, onUnlinked }: ParentLinkBannerProps) {
    const navigate = useNavigate();
    const [parent, setParent] = useState<Card | null>(null);
    const [unlinking, setUnlinking] = useState(false);

    useEffect(() => {
        const fetchParent = async () => {
            const { data } = await supabase
                .from('cards')
                .select('*')
                .eq('id', parentId)
                .single();

            if (data) setParent(data as Card);
        };
        fetchParent();
    }, [parentId]);

    if (!parent) return null;

    const handleUnlink = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Tem certeza que deseja desvincular este card do grupo? O card não será excluído.')) return;

        setUnlinking(true);
        await supabase.from('cards').update({ parent_card_id: null }).eq('id', cardId);
        setUnlinking(false);
        onUnlinked?.();
    };

    return (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-6 flex items-center justify-between group">
            <div
                className="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => navigate(`/cards/${parent.id}`)}
            >
                <div className="p-2 bg-indigo-100 rounded-full">
                    <Users className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                    <div className="text-xs text-indigo-600 font-medium uppercase tracking-wider">
                        Parte do Grupo
                    </div>
                    <div className="text-slate-900 font-medium flex items-center gap-2">
                        {parent.titulo}
                        <ArrowUpRight className="w-4 h-4 text-indigo-400" />
                    </div>
                </div>
            </div>
            <button
                onClick={handleUnlink}
                disabled={unlinking}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                title="Desvincular do grupo"
            >
                <Unlink className="w-4 h-4" />
            </button>
        </div>
    );
}
