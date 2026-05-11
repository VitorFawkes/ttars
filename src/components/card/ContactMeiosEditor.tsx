import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Phone, Mail, Check, Star, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ContatoMeio {
    id: string;
    contato_id: string;
    tipo: 'telefone' | 'email' | 'whatsapp';
    valor: string;
    valor_normalizado: string | null;
    is_principal: boolean;
    verificado: boolean;
    origem: string | null;
}

interface ContactMeiosEditorProps {
    contactId: string;
    readOnly?: boolean;
}

export function ContactMeiosEditor({ contactId, readOnly = false }: ContactMeiosEditorProps) {
    const queryClient = useQueryClient();
    const [newPhone, setNewPhone] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [isAddingPhone, setIsAddingPhone] = useState(false);
    const [isAddingEmail, setIsAddingEmail] = useState(false);

    // Fetch meios de contato
    const { data: meios, isLoading } = useQuery({
        queryKey: ['contato_meios', contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('contato_meios')
                .select('*')
                .eq('contato_id', contactId)
                .order('is_principal', { ascending: false })
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data as ContatoMeio[];
        },
        enabled: !!contactId
    });

    // Add meio mutation
    const addMutation = useMutation({
        mutationFn: async ({ tipo, valor }: { tipo: string; valor: string }) => {
            const { data, error } = await supabase
                .from('contato_meios')
                .insert({
                    contato_id: contactId,
                    tipo,
                    valor,
                    origem: 'manual',
                    is_principal: meios?.filter(m => m.tipo === tipo).length === 0
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            toast.success('Adicionado com sucesso!');
            queryClient.invalidateQueries({ queryKey: ['contato_meios', contactId] });
            setNewPhone('');
            setNewEmail('');
            setIsAddingPhone(false);
            setIsAddingEmail(false);
        },
        onError: (error: any) => {
            if (error.message?.includes('unique') || error.code === '23505') {
                toast.error('Este valor já está cadastrado');
            } else {
                toast.error('Erro ao adicionar: ' + error.message);
            }
        }
    });

    // Delete meio mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('contato_meios')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Removido com sucesso!');
            queryClient.invalidateQueries({ queryKey: ['contato_meios', contactId] });
        },
        onError: (error: any) => {
            toast.error('Erro ao remover: ' + error.message);
        }
    });

    // Set principal mutation
    const setPrincipalMutation = useMutation({
        mutationFn: async ({ id, tipo }: { id: string; tipo: string }) => {
            // First, unset all principal for this type
            await supabase
                .from('contato_meios')
                .update({ is_principal: false })
                .eq('contato_id', contactId)
                .eq('tipo', tipo);

            // Then set the new principal
            const { error } = await supabase
                .from('contato_meios')
                .update({ is_principal: true })
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Principal atualizado!');
            queryClient.invalidateQueries({ queryKey: ['contato_meios', contactId] });
        }
    });

    const telefones = meios?.filter(m => m.tipo === 'telefone' || m.tipo === 'whatsapp') || [];
    const emails = meios?.filter(m => m.tipo === 'email') || [];

    const handleAddPhone = () => {
        if (!newPhone.trim()) return;
        addMutation.mutate({ tipo: 'telefone', valor: newPhone.trim() });
    };

    const handleAddEmail = () => {
        if (!newEmail.trim()) return;
        addMutation.mutate({ tipo: 'email', valor: newEmail.trim() });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Telefones Section */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Telefones
                    </label>
                    {!readOnly && !isAddingPhone && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsAddingPhone(true)}
                            className="h-7 text-xs"
                        >
                            <Plus className="w-3 h-3 mr-1" />
                            Adicionar
                        </Button>
                    )}
                </div>

                <div className="space-y-2">
                    {telefones.map(tel => (
                        <div
                            key={tel.id}
                            className={cn(
                                "flex items-center justify-between p-2 rounded-lg border transition-colors",
                                tel.is_principal ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-slate-500" />
                                <span className="text-sm font-medium">{tel.valor}</span>
                                {tel.is_principal && (
                                    <Badge className="text-[10px] bg-indigo-100 text-indigo-700 border-indigo-200">
                                        <Star className="w-2.5 h-2.5 mr-0.5" />
                                        Principal
                                    </Badge>
                                )}
                                {tel.origem === 'whatsapp' && (
                                    <Badge variant="outline" className="text-[10px]">
                                        WhatsApp
                                    </Badge>
                                )}
                            </div>
                            {!readOnly && (
                                <div className="flex items-center gap-1">
                                    {!tel.is_principal && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setPrincipalMutation.mutate({ id: tel.id, tipo: tel.tipo })}
                                            className="h-7 w-7 p-0"
                                            title="Definir como principal"
                                        >
                                            <Star className="w-3.5 h-3.5" />
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => deleteMutation.mutate(tel.id)}
                                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                        disabled={deleteMutation.isPending}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}

                    {telefones.length === 0 && !isAddingPhone && (
                        <div className="text-sm text-muted-foreground p-2 bg-slate-50 rounded-lg border border-dashed">
                            Nenhum telefone cadastrado
                        </div>
                    )}

                    {isAddingPhone && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            <Input
                                type="tel"
                                placeholder="+55 11 99999-9999"
                                value={newPhone}
                                onChange={(e) => setNewPhone(e.target.value)}
                                className="flex-1"
                                autoFocus
                            />
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleAddPhone}
                                disabled={!newPhone.trim() || addMutation.isPending}
                            >
                                {addMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4" />
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setIsAddingPhone(false);
                                    setNewPhone('');
                                }}
                            >
                                Cancelar
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Emails Section */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Emails
                    </label>
                    {!readOnly && !isAddingEmail && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsAddingEmail(true)}
                            className="h-7 text-xs"
                        >
                            <Plus className="w-3 h-3 mr-1" />
                            Adicionar
                        </Button>
                    )}
                </div>

                <div className="space-y-2">
                    {emails.map(email => (
                        <div
                            key={email.id}
                            className={cn(
                                "flex items-center justify-between p-2 rounded-lg border transition-colors",
                                email.is_principal ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-slate-500" />
                                <span className="text-sm font-medium">{email.valor}</span>
                                {email.is_principal && (
                                    <Badge className="text-[10px] bg-indigo-100 text-indigo-700 border-indigo-200">
                                        <Star className="w-2.5 h-2.5 mr-0.5" />
                                        Principal
                                    </Badge>
                                )}
                            </div>
                            {!readOnly && (
                                <div className="flex items-center gap-1">
                                    {!email.is_principal && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setPrincipalMutation.mutate({ id: email.id, tipo: email.tipo })}
                                            className="h-7 w-7 p-0"
                                            title="Definir como principal"
                                        >
                                            <Star className="w-3.5 h-3.5" />
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => deleteMutation.mutate(email.id)}
                                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                        disabled={deleteMutation.isPending}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}

                    {emails.length === 0 && !isAddingEmail && (
                        <div className="text-sm text-muted-foreground p-2 bg-slate-50 rounded-lg border border-dashed">
                            Nenhum email cadastrado
                        </div>
                    )}

                    {isAddingEmail && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            <Input
                                type="email"
                                placeholder="email@exemplo.com"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                className="flex-1"
                                autoFocus
                            />
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleAddEmail}
                                disabled={!newEmail.trim() || addMutation.isPending}
                            >
                                {addMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4" />
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setIsAddingEmail(false);
                                    setNewEmail('');
                                }}
                            >
                                Cancelar
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
