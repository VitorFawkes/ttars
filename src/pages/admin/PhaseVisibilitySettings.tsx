import { Loader2, Eye } from 'lucide-react';
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { usePipelinePhases } from '@/hooks/usePipelinePhases';
import { usePhaseVisibilityRules } from '@/hooks/usePhaseVisibilityRules';
import { useProductContext } from '@/hooks/useProductContext';
import { PRODUCT_PIPELINE_MAP } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function PhaseVisibilitySettings() {
    const { currentProduct } = useProductContext();
    const pipelineId = PRODUCT_PIPELINE_MAP[currentProduct];
    const { data: phases, isLoading: phasesLoading } = usePipelinePhases(pipelineId);
    const { rules, isLoading: rulesLoading, addRule, removeRule } = usePhaseVisibilityRules();

    const isLoading = phasesLoading || rulesLoading;

    const hasRule = (sourceId: string, targetId: string) =>
        rules.some(r => r.source_phase_id === sourceId && r.target_phase_id === targetId);

    const toggleRule = async (sourceId: string, targetId: string) => {
        try {
            if (hasRule(sourceId, targetId)) {
                await removeRule.mutateAsync({ sourcePhaseId: sourceId, targetPhaseId: targetId });
                toast.success('Regra removida');
            } else {
                await addRule.mutateAsync({ sourcePhaseId: sourceId, targetPhaseId: targetId });
                toast.success('Regra adicionada');
            }
        } catch {
            toast.error('Erro ao atualizar regra de visibilidade');
        }
    };

    return (
        <div className="space-y-6">
            <AdminPageHeader
                icon={<Eye className="h-5 w-5" />}
                title="Visibilidade de Fases"
                subtitle="Configure quais fases cada seção do pipeline pode visualizar além da própria"
            />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Matriz de Visibilidade</CardTitle>
                    <CardDescription>
                        Cada linha define quais fases adicionais os membros daquela fase podem ver no Pipeline.
                        Admins sempre veem todas as fases.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : !phases?.length ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            Nenhuma fase encontrada para este produto.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4 min-w-[180px]">
                                            Fase (origem)
                                        </th>
                                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4" colSpan={phases.length}>
                                            Pode ver também...
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {phases.map(sourcePhase => (
                                        <tr key={sourcePhase.id} className="border-b border-slate-100 last:border-0">
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "w-2.5 h-2.5 rounded-full",
                                                        sourcePhase.color?.replace('bg-', 'bg-') || 'bg-gray-400'
                                                    )} />
                                                    <span className="text-sm font-medium text-slate-900">
                                                        {sourcePhase.label || sourcePhase.name}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex flex-wrap gap-3">
                                                    {phases
                                                        .filter(p => p.id !== sourcePhase.id)
                                                        .map(targetPhase => {
                                                            const active = hasRule(sourcePhase.id, targetPhase.id);
                                                            const pending = addRule.isPending || removeRule.isPending;
                                                            return (
                                                                <label
                                                                    key={targetPhase.id}
                                                                    className={cn(
                                                                        "flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all text-sm",
                                                                        active
                                                                            ? "bg-primary/10 border-primary/30 text-primary font-medium"
                                                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50",
                                                                        pending && "opacity-50 pointer-events-none"
                                                                    )}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={active}
                                                                        onChange={() => toggleRule(sourcePhase.id, targetPhase.id)}
                                                                        className="rounded border-slate-300 text-primary focus:ring-primary/20 h-3.5 w-3.5"
                                                                    />
                                                                    <span className={cn(
                                                                        "w-2 h-2 rounded-full",
                                                                        targetPhase.color?.replace('bg-', 'bg-') || 'bg-gray-400'
                                                                    )} />
                                                                    {targetPhase.label || targetPhase.name}
                                                                </label>
                                                            );
                                                        })}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
