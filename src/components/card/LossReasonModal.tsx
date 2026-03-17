import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FutureOpportunityData {
    titulo: string;
    scheduledDate: string;
}

interface LossReasonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (motivoId: string, comentario: string, futureOpportunity?: FutureOpportunityData) => void;
    targetStageId: string;
    targetStageName: string;
    initialMotivoId?: string | null;
    initialComentario?: string | null;
    isEditing?: boolean;
}

export default function LossReasonModal({
    isOpen,
    onClose,
    onConfirm,
    targetStageId,
    targetStageName,
    initialMotivoId,
    initialComentario,
    isEditing = false
}: LossReasonModalProps) {
    const [motivoId, setMotivoId] = useState(initialMotivoId || '');
    const [comentario, setComentario] = useState(initialComentario || '');
    const [error, setError] = useState<string | null>(null);

    // Future opportunity fields
    const [futureTitle, setFutureTitle] = useState('');
    const [futureDate, setFutureDate] = useState('');

    // Reset or pre-fill state when modal opens
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (isOpen) {
            setMotivoId(initialMotivoId || '');
            setComentario(initialComentario || '');
            setFutureTitle('');
            setFutureDate('');
            setError(null);
        }
    }, [isOpen, initialMotivoId, initialComentario]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // 1. Get Governance Rules for this stage
    const { getFieldConfig } = useFieldConfig();

    // Check requirements
    const motivoConfig = getFieldConfig(targetStageId, 'motivo_perda_id');
    const comentarioConfig = getFieldConfig(targetStageId, 'motivo_perda_comentario');

    const isMotivoRequired = motivoConfig?.isRequired ?? false; // Default false if not configured
    const isComentarioRequired = comentarioConfig?.isRequired ?? false;

    // 2. Fetch Active Loss Reasons
    const { data: reasons, isLoading } = useQuery({
        queryKey: ['loss-reasons-active'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('motivos_perda')
                .select('id, nome')
                .eq('ativo', true)
                .order('nome');
            if (error) throw error;
            return data;
        },
        enabled: isOpen
    });

    // Detect if selected reason is "Oportunidade Futura"
    const isFutureOpportunity = useMemo(() => {
        if (!motivoId || !reasons) return false;
        const selected = reasons.find(r => r.id === motivoId);
        return selected?.nome?.toLowerCase().includes('oportunidade futura') ?? false;
    }, [motivoId, reasons]);

    // Min date = tomorrow
    const minDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    }, []);


    const handleConfirm = () => {
        setError(null);

        // Validation
        if (isMotivoRequired && !motivoId) {
            setError('Por favor, selecione um motivo de perda.');
            return;
        }

        if (isComentarioRequired && !comentario.trim()) {
            setError('Por favor, adicione um comentário justificando a perda.');
            return;
        }

        // Future opportunity validation
        if (isFutureOpportunity) {
            if (!futureTitle.trim()) {
                setError('Informe o título do card que será criado na data agendada.');
                return;
            }
            if (!futureDate) {
                setError('Informe a data de retorno para a oportunidade futura.');
                return;
            }
        }

        const futureData = isFutureOpportunity
            ? { titulo: futureTitle.trim(), scheduledDate: futureDate }
            : undefined;

        onConfirm(motivoId, comentario, futureData);
    };

    const reasonOptions = reasons?.map(r => ({ value: r.id, label: r.nome })) || [];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="w-5 h-5" />
                        {isEditing ? 'Editar Motivo de Perda' : 'Negócio Perdido'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? 'Atualize o motivo e comentário sobre a perda deste negócio.'
                            : <>Você está movendo este card para <strong>{targetStageName}</strong>. Por favor, informe o motivo da perda para nossos relatórios.</>
                        }
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md border border-red-100 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {/* Motivo Selector */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            Motivo Principal
                            {isMotivoRequired && <span className="text-red-500">*</span>}
                        </Label>
                        {isLoading ? (
                            <div className="h-10 w-full bg-slate-100 animate-pulse rounded-md" />
                        ) : (
                            <Select
                                value={motivoId}
                                onChange={setMotivoId}
                                options={[
                                    { value: '', label: 'Selecione um motivo...' },
                                    ...reasonOptions
                                ]}
                                className={cn(
                                    "w-full",
                                    error && !motivoId && isMotivoRequired && "border-red-300 ring-red-100"
                                )}
                            />
                        )}
                    </div>

                    {/* Future Opportunity Fields — conditional */}
                    {isFutureOpportunity && (
                        <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center gap-2 text-blue-700">
                                <CalendarClock className="w-4 h-4" />
                                <span className="text-sm font-medium">
                                    Este card será reaberto automaticamente na data agendada
                                </span>
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-1 text-blue-900">
                                    Título do card futuro <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    type="text"
                                    value={futureTitle}
                                    onChange={(e) => setFutureTitle(e.target.value)}
                                    placeholder="Ex: Retomar viagem Europa — Família Silva"
                                    className={cn(
                                        "bg-white",
                                        error && !futureTitle.trim() && "border-red-300"
                                    )}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-1 text-blue-900">
                                    Data de retorno <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    type="date"
                                    value={futureDate}
                                    onChange={(e) => setFutureDate(e.target.value)}
                                    min={minDate}
                                    className={cn(
                                        "bg-white",
                                        error && !futureDate && "border-red-300"
                                    )}
                                />
                            </div>
                        </div>
                    )}

                    {/* Comentario Textarea */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            Comentário / Detalhes
                            {isComentarioRequired && <span className="text-red-500">*</span>}
                        </Label>
                        <Textarea
                            value={comentario}
                            onChange={(e) => setComentario(e.target.value)}
                            placeholder="Descreva o que aconteceu..."
                            className={cn(
                                "min-h-[100px]",
                                error && !comentario.trim() && isComentarioRequired && "border-red-300 ring-red-100"
                            )}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className={cn(
                            "text-white border-transparent",
                            isFutureOpportunity
                                ? "bg-blue-600 hover:bg-blue-700"
                                : "bg-red-600 hover:bg-red-700"
                        )}
                    >
                        {isEditing
                            ? 'Salvar Alterações'
                            : isFutureOpportunity
                                ? 'Confirmar e Agendar Retorno'
                                : 'Confirmar Perda'
                        }
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
