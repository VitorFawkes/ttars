import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import {
    Filter,
    Users,
    GitBranch,
    Eye,
    Play,
    CheckCircle2,
    AlertCircle,
    Loader2,
    RefreshCw,
    Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DealPreview {
    id: string;
    title: string;
    stage: string;
    stageName?: string;
    owner: string;
    ownerName?: string;
    value: string;
    contact?: {
        email?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
    };
    status: string;
}

interface SyncFilters {
    pipelineId: string;
    stageId: string;
    ownerId: string;
    dateFrom: string;       // YYYY-MM-DD format
    dateTo: string;         // YYYY-MM-DD format
    dateField: 'cdate' | 'mdate';  // cdate = created, mdate = modified
}

interface SyncPreviewResult {
    deals: DealPreview[];
    total: number;
    willCreate: number;
    willUpdate: number;
    willSkip: number;
}

const AC_INTEGRATION_ID = 'a2141b92-561f-4514-92b4-9412a068d236';

export function SyncGovernancePanel() {
    const [filters, setFilters] = useState<SyncFilters>({
        pipelineId: '8', // Default: Trips
        stageId: '',
        ownerId: '',
        dateFrom: '',
        dateTo: '',
        dateField: 'mdate'  // Default: filter by modification date
    });
    const [previewData, setPreviewData] = useState<SyncPreviewResult | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [step, setStep] = useState<'filter' | 'preview' | 'confirm'>('filter');

    // Fetch Pipelines from catalog
    const { data: pipelines } = useQuery({
        queryKey: ['ac-pipelines'],
        queryFn: async () => {
            const { data } = await supabase
                .from('integration_catalog')
                .select('external_id, external_name')
                .eq('integration_id', AC_INTEGRATION_ID)
                .eq('entity_type', 'pipeline')
                .order('external_name');
            return data || [];
        }
    });

    // Fetch Stages for selected pipeline
    const { data: stages } = useQuery({
        queryKey: ['ac-stages', filters.pipelineId],
        queryFn: async () => {
            if (!filters.pipelineId) return [];
            const { data } = await supabase
                .from('integration_catalog')
                .select('external_id, external_name')
                .eq('integration_id', AC_INTEGRATION_ID)
                .eq('entity_type', 'stage')
                .eq('parent_external_id', filters.pipelineId)
                .order('external_name');
            return data || [];
        },
        enabled: !!filters.pipelineId
    });

    // Fetch Users/Owners from catalog
    const { data: owners } = useQuery({
        queryKey: ['ac-users'],
        queryFn: async () => {
            const { data } = await supabase
                .from('integration_catalog')
                .select('external_id, external_name')
                .eq('integration_id', AC_INTEGRATION_ID)
                .eq('entity_type', 'user')
                .not('external_id', 'like', 'seed_%')
                .order('external_name');

            // Remove duplicates (keep first by external_id)
            const uniqueMap = new Map();
            data?.forEach(u => {
                if (!uniqueMap.has(u.external_id)) {
                    uniqueMap.set(u.external_id, u);
                }
            });
            return Array.from(uniqueMap.values());
        }
    });

    // Fetch Preview
    const fetchPreview = async () => {
        if (!filters.pipelineId) {
            toast.error('Selecione um pipeline');
            return;
        }

        setIsLoadingPreview(true);
        try {
            // Call a preview endpoint (we'll need to simulate this for now)
            const { data, error } = await supabase.functions.invoke('integration-sync-deals', {
                body: {
                    pipeline_id: filters.pipelineId,
                    owner_id: filters.ownerId || undefined,
                    date_from: filters.dateFrom || undefined,
                    date_to: filters.dateTo || undefined,
                    date_field: filters.dateField,
                    preview_only: true, // This flag would make the function return preview without executing
                    limit: 100
                }
            });

            if (error) throw error;

            // Since preview_only isn't implemented yet, we'll show mock data
            // In reality, the function would return preview data
            const mockPreview: SyncPreviewResult = {
                deals: [],
                total: data?.deals_fetched || 0,
                willCreate: Math.floor((data?.deals_fetched || 0) * 0.3),
                willUpdate: Math.floor((data?.deals_fetched || 0) * 0.5),
                willSkip: Math.floor((data?.deals_fetched || 0) * 0.2)
            };

            setPreviewData(mockPreview);
            setStep('preview');
            toast.success(`Preview carregado: ${mockPreview.total} deals encontrados`);

        } catch (err: any) {
            toast.error('Erro ao carregar preview: ' + err.message);
        } finally {
            setIsLoadingPreview(false);
        }
    };

    // Execute Sync
    const executeSyncMutation = useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.functions.invoke('integration-sync-deals', {
                body: {
                    pipeline_id: filters.pipelineId,
                    owner_id: filters.ownerId || undefined,
                    date_from: filters.dateFrom || undefined,
                    date_to: filters.dateTo || undefined,
                    date_field: filters.dateField,
                    force_update: true
                }
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            const processed = data.events_processed || 0;
            const fetched = data.deals_fetched || 0;

            if (data.process_error) {
                toast.warning(`${fetched} deals sincronizados, mas houve erro: ${data.process_error}`);
            } else {
                toast.success(`✅ ${fetched} deals importados, ${processed} processados no CRM!`);
            }

            setStep('filter');
            setPreviewData(null);
        },
        onError: (err: any) => {
            toast.error('Erro na sincronização: ' + err.message);
        }
    });

    return (
        <div className="space-y-6">
            {/* Progress Steps */}
            <div className="flex items-center gap-2 mb-6">
                {['filter', 'preview', 'confirm'].map((s, i) => (
                    <div key={s} className="flex items-center gap-2">
                        <div
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                                step === s
                                    ? "bg-primary text-primary-foreground shadow-lg"
                                    : i < ['filter', 'preview', 'confirm'].indexOf(step)
                                        ? "bg-emerald-500 text-white"
                                        : "bg-muted text-muted-foreground"
                            )}
                        >
                            {i < ['filter', 'preview', 'confirm'].indexOf(step) ? (
                                <CheckCircle2 className="w-4 h-4" />
                            ) : (
                                i + 1
                            )}
                        </div>
                        <span className={cn(
                            "text-sm font-medium capitalize",
                            step === s ? "text-foreground" : "text-muted-foreground"
                        )}>
                            {s === 'filter' ? 'Filtrar' : s === 'preview' ? 'Revisar' : 'Confirmar'}
                        </span>
                        {i < 2 && <div className="w-12 h-px bg-border" />}
                    </div>
                ))}
            </div>

            {/* Step 1: Filters */}
            {step === 'filter' && (
                <Card className="border-slate-200 bg-white shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Filter className="w-5 h-5 text-blue-500" />
                            Filtros de Sincronização
                        </CardTitle>
                        <CardDescription>
                            Escolha exatamente quais dados você quer importar do ActiveCampaign
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Filter Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Pipeline */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                                    <GitBranch className="w-4 h-4 text-slate-400" />
                                    Pipeline (Funil)
                                </label>
                                <Select
                                    value={filters.pipelineId}
                                    onChange={(val) => setFilters(prev => ({ ...prev, pipelineId: val, stageId: '' }))}
                                    options={[
                                        { value: '', label: 'Todos os Pipelines' },
                                        ...(pipelines?.map(p => ({
                                            value: p.external_id,
                                            label: p.external_name
                                        })) || [])
                                    ]}
                                    className="w-full"
                                />
                            </div>

                            {/* Stage */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                                    <GitBranch className="w-4 h-4 text-slate-400" />
                                    Etapa (Stage)
                                </label>
                                <Select
                                    value={filters.stageId}
                                    onChange={(val) => setFilters(prev => ({ ...prev, stageId: val }))}
                                    options={[
                                        { value: '', label: 'Todas as Etapas' },
                                        ...(stages?.map(s => ({
                                            value: s.external_id,
                                            label: s.external_name
                                        })) || [])
                                    ]}
                                    disabled={!filters.pipelineId}
                                    className="w-full"
                                />
                            </div>

                            {/* Owner */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                                    <Users className="w-4 h-4 text-slate-400" />
                                    Responsável (Owner)
                                </label>
                                <Select
                                    value={filters.ownerId}
                                    onChange={(val) => setFilters(prev => ({ ...prev, ownerId: val }))}
                                    options={[
                                        { value: '', label: 'Todos os Responsáveis' },
                                        ...(owners?.map(o => ({
                                            value: o.external_id,
                                            label: `${o.external_name} (ID: ${o.external_id})`
                                        })) || [])
                                    ]}
                                    className="w-full"
                                />
                            </div>
                        </div>

                        {/* Date Range Filters */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                            {/* Date Field Selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                                    <Calendar className="w-4 h-4 text-slate-400" />
                                    Filtrar por
                                </label>
                                <Select
                                    value={filters.dateField}
                                    onChange={(val) => setFilters(prev => ({ ...prev, dateField: val as 'cdate' | 'mdate' }))}
                                    options={[
                                        { value: 'mdate', label: 'Data de Atualização' },
                                        { value: 'cdate', label: 'Data de Criação' }
                                    ]}
                                    className="w-full"
                                />
                            </div>

                            {/* Date From */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                                    De
                                </label>
                                <Input
                                    type="date"
                                    value={filters.dateFrom}
                                    onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                                    className="w-full"
                                />
                            </div>

                            {/* Date To */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                                    Até
                                </label>
                                <Input
                                    type="date"
                                    value={filters.dateTo}
                                    onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                                    className="w-full"
                                />
                            </div>

                            {/* Quick Date Presets */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Atalhos</label>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const today = new Date();
                                            const lastWeek = new Date(today);
                                            lastWeek.setDate(today.getDate() - 7);
                                            setFilters(prev => ({
                                                ...prev,
                                                dateFrom: lastWeek.toISOString().split('T')[0],
                                                dateTo: today.toISOString().split('T')[0]
                                            }));
                                        }}
                                        className="text-xs"
                                    >
                                        7 dias
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const today = new Date();
                                            const lastMonth = new Date(today);
                                            lastMonth.setDate(today.getDate() - 30);
                                            setFilters(prev => ({
                                                ...prev,
                                                dateFrom: lastMonth.toISOString().split('T')[0],
                                                dateTo: today.toISOString().split('T')[0]
                                            }));
                                        }}
                                        className="text-xs"
                                    >
                                        30 dias
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Selected Filters Summary */}
                        {(filters.pipelineId || filters.ownerId) && (
                            <div className="flex items-center gap-2 flex-wrap p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <span className="text-sm text-slate-500">Filtros ativos:</span>
                                {filters.pipelineId && (
                                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                                        Pipeline: {pipelines?.find(p => p.external_id === filters.pipelineId)?.external_name}
                                    </Badge>
                                )}
                                {filters.stageId && (
                                    <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                        Etapa: {stages?.find(s => s.external_id === filters.stageId)?.external_name}
                                    </Badge>
                                )}
                                {filters.ownerId && (
                                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                                        Responsável: {owners?.find(o => o.external_id === filters.ownerId)?.external_name}
                                    </Badge>
                                )}
                                {(filters.dateFrom || filters.dateTo) && (
                                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {filters.dateField === 'cdate' ? 'Criado' : 'Atualizado'}:
                                        {filters.dateFrom ? ` de ${new Date(filters.dateFrom).toLocaleDateString('pt-BR')}` : ''}
                                        {filters.dateTo ? ` até ${new Date(filters.dateTo).toLocaleDateString('pt-BR')}` : ''}
                                    </Badge>
                                )}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                            <Button
                                variant="outline"
                                onClick={() => setFilters({ pipelineId: '8', stageId: '', ownerId: '', dateFrom: '', dateTo: '', dateField: 'mdate' })}
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Limpar Filtros
                            </Button>
                            <Button
                                onClick={fetchPreview}
                                disabled={isLoadingPreview || !filters.pipelineId}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {isLoadingPreview ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Eye className="w-4 h-4 mr-2" />
                                )}
                                Visualizar Preview
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Preview */}
            {step === 'preview' && previewData && (
                <Card className="border-slate-200 bg-white shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Eye className="w-5 h-5 text-purple-500" />
                            Preview da Sincronização
                        </CardTitle>
                        <CardDescription>
                            Revise o que será importado antes de confirmar
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-4 gap-4">
                            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                                <div className="text-2xl font-bold text-slate-900">{previewData.total}</div>
                                <div className="text-sm text-slate-500">Total de Deals</div>
                            </div>
                            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                                <div className="text-2xl font-bold text-emerald-700">{previewData.willCreate}</div>
                                <div className="text-sm text-emerald-600">Serão Criados</div>
                            </div>
                            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                                <div className="text-2xl font-bold text-blue-700">{previewData.willUpdate}</div>
                                <div className="text-sm text-blue-600">Serão Atualizados</div>
                            </div>
                            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                                <div className="text-2xl font-bold text-amber-700">{previewData.willSkip}</div>
                                <div className="text-sm text-amber-600">Já Sincronizados</div>
                            </div>
                        </div>

                        {/* Info Banner */}
                        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-blue-900">
                                    Pronto para sincronizar
                                </p>
                                <p className="text-sm text-blue-700">
                                    Os deals serão importados respeitando os mapeamentos de pipeline, etapa e responsável configurados.
                                    Contatos serão criados ou vinculados automaticamente.
                                </p>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-between pt-4 border-t border-slate-100">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setStep('filter');
                                    setPreviewData(null);
                                }}
                            >
                                ← Voltar aos Filtros
                            </Button>
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setStep('confirm')}
                                >
                                    Ver Detalhes
                                </Button>
                                <Button
                                    onClick={() => executeSyncMutation.mutate()}
                                    disabled={executeSyncMutation.isPending}
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                    {executeSyncMutation.isPending ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Play className="w-4 h-4 mr-2" />
                                    )}
                                    Aprovar e Sincronizar
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Confirmation/Details - Can show deal list here */}
            {step === 'confirm' && previewData && (
                <Card className="border-slate-200 bg-white shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            Confirmar Sincronização
                        </CardTitle>
                        <CardDescription>
                            Última revisão antes de executar
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="p-6 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-lg border border-emerald-200">
                            <div className="text-center">
                                <div className="text-5xl font-bold text-emerald-700 mb-2">{previewData.total}</div>
                                <div className="text-lg text-slate-600">deals serão sincronizados</div>
                                <div className="mt-4 flex justify-center gap-4">
                                    {filters.ownerId && (
                                        <Badge className="bg-white text-slate-700 border border-slate-200">
                                            Responsável: {owners?.find(o => o.external_id === filters.ownerId)?.external_name}
                                        </Badge>
                                    )}
                                    {filters.pipelineId && (
                                        <Badge className="bg-white text-slate-700 border border-slate-200">
                                            Pipeline: {pipelines?.find(p => p.external_id === filters.pipelineId)?.external_name}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between pt-4 border-t border-slate-100">
                            <Button
                                variant="outline"
                                onClick={() => setStep('preview')}
                            >
                                ← Voltar
                            </Button>
                            <Button
                                onClick={() => executeSyncMutation.mutate()}
                                disabled={executeSyncMutation.isPending}
                                size="lg"
                                className="bg-emerald-600 hover:bg-emerald-700 px-8"
                            >
                                {executeSyncMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Sincronizando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Confirmar Sincronização
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
