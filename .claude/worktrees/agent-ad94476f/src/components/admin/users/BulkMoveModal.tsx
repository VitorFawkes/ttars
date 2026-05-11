import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { Label } from '../../ui/label';
import { useToast } from '../../../contexts/ToastContext';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '../../ui/dialog';
import type { Database } from '../../../database.types';

type Team = Database['public']['Tables']['teams']['Row'];

interface BulkMoveModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedUserIds: string[];
    teams: Team[];
    onSuccess?: () => void;
}

export function BulkMoveModal({ isOpen, onClose, selectedUserIds, teams, onSuccess }: BulkMoveModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isLoading, setIsLoading] = useState(false);
    const [targetTeamId, setTargetTeamId] = useState<string>('');

    const bulkUpdateMutation = useMutation({
        mutationFn: async ({ userIds, teamId }: { userIds: string[]; teamId: string }) => {
            const { error } = await supabase
                .from('profiles')
                .update({ team_id: teamId } as any)
                .in('id', userIds);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['team-hierarchy'] }); // Also update the hierarchy view
            toast({
                title: 'Movimentação concluída',
                description: `${selectedUserIds.length} usuários foram movidos com sucesso.`,
                type: 'success'
            });
            if (onSuccess) onSuccess();
            onClose();
            setTargetTeamId('');
        },
        onError: (error: any) => {
            toast({
                title: 'Erro na movimentação',
                description: error.message || 'Ocorreu um erro ao mover os usuários.',
                type: 'error'
            });
        }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetTeamId) {
            toast({
                title: 'Selecione um time',
                description: 'Você precisa escolher um time de destino.',
                type: 'error'
            });
            return;
        }

        setIsLoading(true);
        try {
            await bulkUpdateMutation.mutateAsync({
                userIds: selectedUserIds,
                teamId: targetTeamId
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>Mover Usuários em Massa</DialogTitle>
                    <DialogDescription>
                        Você está movendo <strong>{selectedUserIds.length}</strong> usuários. Selecione o time de destino.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="target-team">Time de Destino</Label>
                        <Select
                            value={targetTeamId}
                            onChange={setTargetTeamId}
                            options={teams.map(t => ({ value: t.id, label: t.name }))}
                            placeholder="Selecione o novo time..."
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'Movendo...' : 'Confirmar Movimentação'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
