import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '../../ui/Table';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Loader2, Trash2, RefreshCw, Copy, Check, Plane, Heart, Building2 } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../../lib/utils';

const PRODUCT_BADGES: Record<string, { label: string; icon: React.ElementType; className: string }> = {
    TRIPS:   { label: 'Trips',   icon: Plane,     className: 'bg-teal-50 text-teal-700 border border-teal-200' },
    WEDDING: { label: 'Wedding', icon: Heart,     className: 'bg-rose-50 text-rose-700 border border-rose-200' },
    CORP:    { label: 'Corp',    icon: Building2, className: 'bg-purple-50 text-purple-700 border border-purple-200' },
};

interface Invite {
    id: string;
    email: string;
    role: string;
    token: string;
    created_at: string;
    expires_at: string;
    used_at: string | null;
    created_by: string;
    produtos: string[] | null;
}

export default function InviteManager() {
    const { toast } = useToast();
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const fetchInvites = useCallback(async () => {
        setLoading(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any)
                .from('invitations')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setInvites((data as unknown as Invite[]) || []);
        } catch (error) {
            console.error('Error fetching invites:', error);
            toast({ title: 'Erro', description: 'Falha ao carregar convites.', type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchInvites();
    }, [fetchInvites]);

    const handleRevoke = async (id: string) => {
        if (!confirm('Tem certeza que deseja revogar este convite?')) return;

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
                .from('invitations')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast({ title: 'Sucesso', description: 'Convite revogado.', type: 'success' });
            fetchInvites();
        } catch {
            toast({ title: 'Erro', description: 'Falha ao revogar convite.', type: 'error' });
        }
    };

    const copyLink = (token: string, id: string) => {
        const link = `${window.location.origin}/invite/${token}`;
        navigator.clipboard.writeText(link);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-foreground">Convites Pendentes</h3>
                <Button variant="outline" size="sm" onClick={fetchInvites} className="border-border text-foreground hover:bg-muted hover:text-foreground">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Atualizar
                </Button>
            </div>

            <div className="bg-card backdrop-blur-xl rounded-xl border border-border overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-muted/50">
                            <TableHead className="text-muted-foreground">Email</TableHead>
                            <TableHead className="text-muted-foreground">Papel</TableHead>
                            <TableHead className="text-muted-foreground">Produtos</TableHead>
                            <TableHead className="text-muted-foreground">Criado em</TableHead>
                            <TableHead className="text-muted-foreground">Expira em</TableHead>
                            <TableHead className="text-muted-foreground">Status</TableHead>
                            <TableHead className="text-right text-muted-foreground">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow className="border-border hover:bg-muted/50">
                                <TableCell colSpan={7} className="text-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                                </TableCell>
                            </TableRow>
                        ) : invites.length === 0 ? (
                            <TableRow className="border-border hover:bg-muted/50">
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                    Nenhum convite encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            invites.map(invite => {
                                const isExpired = new Date(invite.expires_at) < new Date();
                                const isUsed = !!invite.used_at;

                                return (
                                    <TableRow key={invite.id} className="border-border hover:bg-muted/50">
                                        <TableCell className="font-medium text-foreground">
                                            {invite.email}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="capitalize bg-muted text-muted-foreground hover:bg-muted/80 border-border">
                                                {invite.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {invite.produtos?.length
                                                    ? invite.produtos.map(p => {
                                                        const badge = PRODUCT_BADGES[p];
                                                        if (!badge) return null;
                                                        const Icon = badge.icon;
                                                        return (
                                                            <span key={p} className={cn('inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium', badge.className)}>
                                                                <Icon className="w-3 h-3" />
                                                                {badge.label}
                                                            </span>
                                                        );
                                                    })
                                                    : <span className="text-xs text-slate-400">Todos</span>
                                                }
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {format(new Date(invite.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {format(new Date(invite.expires_at), "dd/MM/yy", { locale: ptBR })}
                                        </TableCell>
                                        <TableCell>
                                            {isUsed ? (
                                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Aceito</Badge>
                                            ) : isExpired ? (
                                                <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">Expirado</Badge>
                                            ) : (
                                                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pendente</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {!isUsed && (
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => copyLink(invite.token, invite.id)}
                                                        title="Copiar Link"
                                                        className="hover:bg-muted text-muted-foreground hover:text-foreground"
                                                    >
                                                        {copiedId === invite.id ? (
                                                            <Check className="w-4 h-4 text-emerald-600" />
                                                        ) : (
                                                            <Copy className="w-4 h-4" />
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleRevoke(invite.id)}
                                                        className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                                        title="Revogar"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
