import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTeams, type UpdateTeamData, type Team } from '../../../hooks/useTeams';
import { usePipelinePhases } from '../../../hooks/usePipelinePhases';
import { useCurrentProductMeta } from '../../../hooks/useCurrentProductMeta';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Textarea } from '../../ui/textarea';
import { Select } from '../../ui/Select';
import { Loader2 } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';

interface EditTeamModalProps {
    isOpen: boolean;
    onClose: () => void;
    team: Team | null;
}

const TEAM_COLOR_OPTIONS = [
    { value: 'bg-blue-100 text-blue-800', label: 'Azul' },
    { value: 'bg-green-100 text-green-800', label: 'Verde' },
    { value: 'bg-purple-100 text-purple-800', label: 'Roxo' },
    { value: 'bg-yellow-100 text-yellow-800', label: 'Amarelo' },
    { value: 'bg-red-100 text-red-800', label: 'Vermelho' },
    { value: 'bg-pink-100 text-pink-800', label: 'Rosa' },
    { value: 'bg-indigo-100 text-indigo-800', label: 'Índigo' },
    { value: 'bg-slate-100 text-slate-800', label: 'Cinza' },
];

export function EditTeamModal({ isOpen, onClose, team }: EditTeamModalProps) {
    const { updateTeam } = useTeams();
    const { pipelineId } = useCurrentProductMeta();
    const { data: phases } = usePipelinePhases(pipelineId);
    const { toast } = useToast();
    const { register, handleSubmit, reset, control, formState: { errors } } = useForm<UpdateTeamData>();

    const phaseOptions = [
        { value: '', label: 'Nenhuma (time genérico)' },
        ...(phases?.map(p => ({ value: p.id, label: p.label || p.name })) || [])
    ];

    useEffect(() => {
        if (team && isOpen) {
            reset({
                name: team.name,
                description: team.description || '',
                phase_id: team.phase_id || '',
                color: team.color || 'bg-blue-100 text-blue-800',
                is_active: team.is_active
            });
        }
    }, [team, isOpen, reset]);

    const onSubmit = async (data: UpdateTeamData) => {
        if (!team) return;
        try {
            // Assuming updateTeam.mutateAsync expects { id, ...data }
            await updateTeam.mutateAsync({ ...data, id: team.id });
            toast({ title: 'Sucesso', description: 'Time atualizado com sucesso!', type: 'success' });
            onClose();
        } catch (error) {
            console.error('Error updating team:', error);
            toast({ title: 'Erro', description: 'Erro ao atualizar time.', type: 'error' });
        }
    };

    if (!team) return null; // Keep this check

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]"> {/* Adjusted max-width */}
                <DialogHeader>
                    <DialogTitle>Editar Time</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4"> {/* Adjusted spacing */}
                    <div className="space-y-2"> {/* Adjusted spacing */}
                        <label className="text-sm font-medium">Nome do Time</label>
                        <Input
                            {...register('name', { required: 'Nome é obrigatório' })}
                            placeholder="Ex: Comercial, Marketing"
                        />
                        {errors.name && (
                            <span className="text-xs text-red-500">{errors.name.message}</span>
                        )}
                    </div>

                    <div className="space-y-2"> {/* Adjusted spacing */}
                        <label className="text-sm font-medium">Descrição</label>
                        <Textarea
                            {...register('description')}
                            placeholder="Descrição das responsabilidades do time"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Fase do Pipeline</label>
                        <Controller
                            name="phase_id"
                            control={control}
                            render={({ field }) => (
                                <Select
                                    value={field.value || ''}
                                    onChange={field.onChange}
                                    options={phaseOptions}
                                    placeholder="Selecione a fase..."
                                />
                            )}
                        />
                        <p className="text-xs text-muted-foreground">
                            Define em qual seção do pipeline este time opera
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Cor</label>
                        <Controller
                            name="color"
                            control={control}
                            render={({ field }) => (
                                <div className="flex items-center gap-2">
                                    <span className={`w-8 h-8 rounded-md border border-slate-200 shrink-0 ${(field.value || 'bg-blue-100').split(' ')[0]}`} />
                                    <Select
                                        value={field.value || 'bg-blue-100 text-blue-800'}
                                        onChange={field.onChange}
                                        options={TEAM_COLOR_OPTIONS}
                                        placeholder="Selecione a cor..."
                                        className="flex-1"
                                    />
                                </div>
                            )}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            {...register('is_active')}
                            id="is_active"
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="is_active" className="text-sm font-medium">
                            Time Ativo
                        </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-4"> {/* Adjusted spacing and variant */}
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={updateTeam.isPending}> {/* Changed isUpdating to updateTeam.isPending */}
                            {updateTeam.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                'Salvar Alterações'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
