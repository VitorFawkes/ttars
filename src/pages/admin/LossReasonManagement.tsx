import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/contexts/OrgContext';
import { toast } from 'sonner';
import {
    XCircle,
    Plus,
    Trash2,
    Eye,
    EyeOff,
    Loader2,
    AlertTriangle,
    Pencil,
    Check
} from 'lucide-react';
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

export default function LossReasonManagement() {
    const queryClient = useQueryClient();
    const { org } = useOrg();
    const activeOrgId = org?.id;
    const [newReason, setNewReason] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    // Fetch Loss Reasons (isolado por workspace)
    const { data: reasons, isLoading } = useQuery({
        queryKey: ['loss-reasons', activeOrgId],
        queryFn: async () => {
            if (!activeOrgId) return [];
            const { data, error } = await supabase
                .from('motivos_perda')
                .select('*')
                .eq('org_id', activeOrgId)
                .order('nome');
            if (error) throw error;
            return data;
        },
        enabled: !!activeOrgId,
    });

    // Create Mutation
    const createMutation = useMutation({
        mutationFn: async (nome: string) => {
            if (!nome.trim()) throw new Error("O nome não pode estar vazio");
            if (!activeOrgId) throw new Error("Workspace ativo não encontrado");

            const { error } = await supabase
                .from('motivos_perda')
                .insert([{
                    org_id: activeOrgId,
                    nome: nome.trim(),
                    ativo: true
                }]);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Motivo adicionado com sucesso!");
            setNewReason('');
            queryClient.invalidateQueries({ queryKey: ['loss-reasons'] });
        },
        onError: (error: Error) => {
            toast.error(`Erro ao criar: ${error.message}`);
        }
    });

    // Toggle Active Mutation
    const toggleActiveMutation = useMutation({
        mutationFn: async ({ id, ativo }: { id: string, ativo: boolean }) => {
            const { error } = await supabase
                .from('motivos_perda')
                .update({ ativo })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Status atualizado!");
            queryClient.invalidateQueries({ queryKey: ['loss-reasons'] });
        },
        onError: (error: Error) => {
            toast.error(`Erro ao atualizar: ${error.message}`);
        }
    });

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('motivos_perda')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Motivo removido!");
            queryClient.invalidateQueries({ queryKey: ['loss-reasons'] });
        },
        onError: (error: Error) => {
            toast.error(`Erro ao remover: ${error.message}`);
        }
    });

    // Rename Mutation
    const renameMutation = useMutation({
        mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
            if (!nome.trim()) throw new Error("O nome não pode estar vazio");
            const { error } = await supabase
                .from('motivos_perda')
                .update({ nome: nome.trim() })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Motivo renomeado!");
            setEditingId(null);
            setEditingName('');
            queryClient.invalidateQueries({ queryKey: ['loss-reasons'] });
        },
        onError: (error: Error) => {
            toast.error(`Erro ao renomear: ${error.message}`);
        }
    });

    const startEditing = (reason: { id: string; nome: string }) => {
        setEditingId(reason.id);
        setEditingName(reason.nome);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditingName('');
    };

    const saveEditing = () => {
        if (editingId && editingName.trim()) {
            renameMutation.mutate({ id: editingId, nome: editingName });
        }
    };

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(newReason);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-8">
            <AdminPageHeader
                title="Motivos de Perda"
                subtitle="Gerencie as opções disponíveis quando um negócio é marcado como perdido."
                icon={<XCircle className="w-6 h-6 text-red-500" />}
                actions={null}
                stats={[]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main List */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-slate-200 shadow-sm bg-white/80 backdrop-blur-sm">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <XCircle className="w-5 h-5 text-slate-500" />
                                Lista de Motivos
                            </CardTitle>
                            <CardDescription>
                                Estes motivos aparecerão no dropdown quando um card for movido para "Perdido".
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {/* Add New Form */}
                            <form onSubmit={handleAdd} className="flex gap-3 mb-8">
                                <Input
                                    placeholder="Ex: Preço muito alto"
                                    value={newReason}
                                    onChange={(e) => setNewReason(e.target.value)}
                                    className="flex-1 bg-white"
                                />
                                <Button
                                    type="submit"
                                    disabled={!newReason.trim() || createMutation.isPending}
                                    className="bg-slate-900 hover:bg-slate-800 text-white"
                                >
                                    {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                    Adicionar
                                </Button>
                            </form>

                            {/* List */}
                            <div className="space-y-2">
                                {reasons?.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                        Nenhum motivo cadastrado ainda.
                                    </div>
                                ) : (
                                    reasons?.map((reason) => (
                                        <div
                                            key={reason.id}
                                            className={cn(
                                                "group flex items-center justify-between p-3 rounded-lg border transition-all duration-200",
                                                reason.ativo
                                                    ? "bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm"
                                                    : "bg-slate-50 border-slate-100 opacity-60"
                                            )}
                                        >
                                            {editingId === reason.id ? (
                                                <>
                                                    <div className="flex items-center gap-2 flex-1 mr-2">
                                                        <Input
                                                            value={editingName}
                                                            onChange={(e) => setEditingName(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') saveEditing();
                                                                if (e.key === 'Escape') cancelEditing();
                                                            }}
                                                            className="h-8 text-sm bg-white"
                                                            autoFocus
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={saveEditing}
                                                            disabled={!editingName.trim() || renameMutation.isPending}
                                                            title="Salvar"
                                                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                        >
                                                            {renameMutation.isPending
                                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                                : <Check className="w-4 h-4" />}
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={cancelEditing}
                                                            title="Cancelar"
                                                            className="h-8 w-8 text-slate-400 hover:text-slate-700"
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-3">
                                                        <span className={cn(
                                                            "font-medium text-sm",
                                                            reason.ativo ? "text-slate-700" : "text-slate-400 line-through"
                                                        )}>
                                                            {reason.nome}
                                                        </span>
                                                        {!reason.ativo && (
                                                            <Badge variant="outline" className="text-xs text-slate-400 border-slate-200">
                                                                Inativo
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => startEditing(reason)}
                                                            title="Renomear"
                                                            className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => toggleActiveMutation.mutate({ id: reason.id, ativo: !reason.ativo })}
                                                            title={reason.ativo ? "Desativar" : "Ativar"}
                                                            className="h-8 w-8 text-slate-400 hover:text-slate-700"
                                                        >
                                                            {reason.ativo ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => {
                                                                if (confirm('Tem certeza que deseja excluir este motivo?')) {
                                                                    deleteMutation.mutate(reason.id);
                                                                }
                                                            }}
                                                            title="Excluir permanentemente"
                                                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-6">
                    <Card className="bg-blue-50/50 border-blue-100 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base text-blue-900 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                Regras e Obrigatoriedade
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-blue-800 space-y-3">
                            <p>
                                Para definir se o <strong>Motivo</strong> ou o <strong>Comentário</strong> são obrigatórios, acesse as configurações de pipeline.
                            </p>
                            <p>
                                Vá em <strong>Configurações {'>'} Customização {'>'} Regras de Dados</strong> e selecione a etapa "Perdido".
                            </p>
                            <Button
                                variant="outline"
                                className="w-full bg-white border-blue-200 text-blue-700 hover:bg-blue-50 mt-2"
                                onClick={() => window.location.href = '/settings/customization/data-rules'}
                            >
                                Ir para Regras de Dados
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
