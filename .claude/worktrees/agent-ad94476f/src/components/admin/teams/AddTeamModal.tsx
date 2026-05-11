import { useForm, Controller } from 'react-hook-form';
import { useTeams, type CreateTeamData } from '../../../hooks/useTeams';
import { usePipelinePhases } from '../../../hooks/usePipelinePhases';
import { useCurrentProductMeta } from '../../../hooks/useCurrentProductMeta';
import { useToast } from '../../../contexts/ToastContext';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Textarea } from '../../ui/textarea';
import { Select } from '../../ui/Select';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';

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

interface AddTeamModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AddTeamModal({ isOpen, onClose }: AddTeamModalProps) {
    const { createTeam } = useTeams();
    const { pipelineId } = useCurrentProductMeta();
    const { data: phases } = usePipelinePhases(pipelineId);
    const { toast } = useToast();
    const { register, handleSubmit, reset, control, formState: { errors } } = useForm<CreateTeamData>();

    const phaseOptions = [
        { value: '', label: 'Nenhuma (time genérico)' },
        ...(phases?.map(p => ({ value: p.id, label: p.label || p.name })) || [])
    ];

    const onSubmit = async (data: CreateTeamData) => {
        try {
            await createTeam.mutateAsync(data);
            toast({ title: 'Sucesso', description: 'Time criado com sucesso!', type: 'success' });
            reset();
            onClose();
        } catch (error) {
            console.error('Error creating team:', error);
            toast({ title: 'Erro', description: 'Erro ao criar time. Tente novamente.', type: 'error' });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Criar Novo Time</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nome do Time</label>
                        <Input
                            {...register('name', { required: 'Nome é obrigatório' })}
                            placeholder="Ex: Comercial, Marketing"
                        />
                        {errors.name && (
                            <span className="text-xs text-red-500">{errors.name.message}</span>
                        )}
                    </div>

                    <div className="space-y-2">
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
                            Define em qual seção do pipeline este time opera (SDR, Planner, Pós-venda)
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Cor</label>
                        <Controller
                            name="color"
                            control={control}
                            defaultValue="bg-blue-100 text-blue-800"
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

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={createTeam.isPending}>
                            {createTeam.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Criando...
                                </>
                            ) : (
                                'Criar Time'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
