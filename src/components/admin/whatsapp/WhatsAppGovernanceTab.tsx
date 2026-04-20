import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
    Save,
    Settings,
    AlertCircle,
    Phone,
    CheckCircle2,
    XCircle,
    Info,
    RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider,
} from '@/components/ui/tooltip';
import { usePipelinePhases } from '@/hooks/usePipelinePhases';
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta';
import { LineKindBadge } from '@/components/admin/whatsapp/LineKindBadge';

// Line config from whatsapp_linha_config
interface LinhaConfig {
    id: string;
    phone_number_label: string;
    phone_number_id: string | null;
    ativo: boolean;
    produto: string | null;
    phase_id: string | null;
    criar_card: boolean | null;
    criar_contato: boolean | null;
}

const TOGGLE_DEFINITIONS = [
    {
        key: 'WHATSAPP_PROCESS_ENABLED',
        label: 'Processar mensagens automaticamente',
        tooltip: 'Se desligado, apenas armazena o raw event sem criar mensagem no CRM'
    },
    {
        key: 'WHATSAPP_CREATE_CONTACT',
        label: 'Criar contato para números novos',
        tooltip: 'Se desligado, mensagens de desconhecidos ficam órfãs'
    },
    {
        key: 'WHATSAPP_LINK_TO_CARD',
        label: 'Vincular mensagem ao card ativo',
        tooltip: 'Associa a mensagem à viagem em andamento do contato'
    },
    {
        key: 'WHATSAPP_CREATE_CARD',
        label: 'Criar card para contatos sem viagem ativa',
        tooltip: 'Se habilitado, cria automaticamente um card quando uma mensagem chega de um contato sem card ativo'
    },
    {
        key: 'WHATSAPP_UPDATE_CONTACT',
        label: 'Atualizar dados do contato',
        tooltip: 'Atualiza nome se vier diferente do Ecko'
    },
];

const PRODUTOS = [
    { value: 'TRIPS', label: 'Trips' },
    { value: 'WEDDING', label: 'Wedding' },
    { value: 'CORP', label: 'Corp' },
    { value: 'MARKETING', label: 'Marketing' },
];


export function WhatsAppGovernanceTab() {
    const queryClient = useQueryClient();
    const { pipelineId } = useCurrentProductMeta();
    const [toggleOverrides, setToggleOverrides] = useState<Record<string, boolean> | null>(null);
    const [linhaOverrides, setLinhaOverrides] = useState<LinhaConfig[] | null>(null);
    const [hasChanges, setHasChanges] = useState(false);

    // Fetch pipeline phases for the fase dropdown
    const { data: phasesData } = usePipelinePhases(pipelineId);

    // Fetch Toggles from integration_settings
    const { data: togglesData, isLoading: isLoadingToggles } = useQuery({
        queryKey: ['whatsapp_toggles'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_settings')
                .select('key, value, description')
                .like('key', 'WHATSAPP_%');

            if (error) throw error;
            return data as { key: string; value: string; description: string }[];
        }
    });

    // Fetch Linhas from whatsapp_linha_config
    const { data: linhasData, isLoading: isLoadingLinhas } = useQuery({
        queryKey: ['whatsapp_linhas'],
        queryFn: async () => {
            const { data, error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('whatsapp_linha_config') as any)
                .select('id, phone_number_label, phone_number_id, ativo, produto, phase_id, criar_card, criar_contato')
                .order('phone_number_label');

            if (error) throw error;
            return data as LinhaConfig[];
        }
    });

    // Derive state from query data, with local overrides for unsaved changes
    const toggles = useMemo(() => {
        if (toggleOverrides) return toggleOverrides;
        const toggleMap: Record<string, boolean> = {};
        togglesData?.forEach(t => {
            toggleMap[t.key] = t.value === 'true';
        });
        return toggleMap;
    }, [togglesData, toggleOverrides]);

    const linhas = useMemo(() => {
        if (linhaOverrides) return linhaOverrides;
        return linhasData ?? [];
    }, [linhasData, linhaOverrides]);

    // Save toggles mutation
    const saveTogglesMutation = useMutation({
        mutationFn: async (newToggles: Record<string, boolean>) => {
            for (const [key, value] of Object.entries(newToggles)) {
                const { error } = await supabase
                    .from('integration_settings')
                    .update({ value: String(value), updated_at: new Date().toISOString() })
                    .eq('key', key);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            toast.success('Toggles salvos com sucesso!');
            setToggleOverrides(null);
            queryClient.invalidateQueries({ queryKey: ['whatsapp_toggles'] });
            setHasChanges(false);
        },
        onError: (error) => {
            toast.error('Erro ao salvar: ' + (error as Error).message);
        }
    });

    // Build phase options from fetched data
    const phaseOptions = useMemo(() => {
        return (phasesData || []).map(p => ({ value: p.id, label: p.label || p.name }));
    }, [phasesData]);

    // Save linha mutation
    const saveLinhaMutation = useMutation({
        mutationFn: async (linha: LinhaConfig) => {
            const { error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('whatsapp_linha_config') as any)
                .update({
                    ativo: linha.ativo,
                    produto: linha.produto,
                    phase_id: linha.phase_id,
                    criar_card: linha.criar_card,
                    criar_contato: linha.criar_contato,
                    updated_at: new Date().toISOString()
                })
                .eq('id', linha.id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Linha atualizada!');
            setLinhaOverrides(null);
            queryClient.invalidateQueries({ queryKey: ['whatsapp_linhas'] });
        },
        onError: (error) => {
            toast.error('Erro ao salvar linha: ' + (error as Error).message);
        }
    });

    const handleToggleChange = (key: string, value: boolean) => {
        setToggleOverrides(prev => ({ ...(prev ?? toggles), [key]: value }));
        setHasChanges(true);
    };

    const handleLinhaChange = (id: string, field: keyof LinhaConfig, value: string | boolean | null) => {
        setLinhaOverrides(prev => (prev ?? linhas).map(l => {
            if (l.id !== id) return l;
            return { ...l, [field]: value };
        }));
    };

    const handleSaveLinhas = async () => {
        for (const linha of linhas) {
            await saveLinhaMutation.mutateAsync(linha);
        }
    };

    if (isLoadingToggles || isLoadingLinhas) {
        return (
            <div className="flex items-center justify-center p-8">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Carregando configurações...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Governança WhatsApp</h2>
                    <p className="text-sm text-muted-foreground">
                        Configure o comportamento automático para mensagens do WhatsApp.
                    </p>
                </div>
                <Button
                    onClick={() => saveTogglesMutation.mutate(toggles)}
                    disabled={saveTogglesMutation.isPending || !hasChanges}
                >
                    <Save className="w-4 h-4 mr-2" />
                    {saveTogglesMutation.isPending ? 'Salvando...' : 'Salvar Toggles'}
                </Button>
            </div>

            {/* Toggles Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Comportamentos Automáticos
                    </CardTitle>
                    <CardDescription>
                        Defina quais ações devem ser executadas automaticamente.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {TOGGLE_DEFINITIONS.map(def => (
                        <div
                            key={def.key}
                            className="flex items-center justify-between p-4 border rounded-lg bg-white hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm font-medium">
                                            {def.label}
                                        </label>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger>
                                                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p className="max-w-xs">{def.tooltip}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                </div>
                            </div>
                            <Switch
                                checked={toggles[def.key] ?? false}
                                onCheckedChange={(checked) => handleToggleChange(def.key, checked)}
                            />
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Linhas Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Phone className="w-5 h-5" />
                                Linhas de WhatsApp
                            </CardTitle>
                            <CardDescription>
                                Configure cada linha (número) do WhatsApp individualmente.
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleSaveLinhas}
                            disabled={saveLinhaMutation.isPending}
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Salvar Linhas
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {linhas.length === 0 ? (
                        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground bg-muted/50 rounded-lg">
                            <AlertCircle className="w-4 h-4" />
                            Nenhuma linha configurada. Linhas aparecerão automaticamente quando recebermos mensagens.
                        </div>
                    ) : (
                        linhas.map(linha => (
                            <div
                                key={linha.id}
                                className={`p-4 border rounded-lg transition-all ${linha.ativo
                                    ? 'bg-white border-slate-200'
                                    : 'bg-slate-50 border-slate-200 opacity-75'
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <Phone className="w-5 h-5 text-green-600" />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-medium">{linha.phone_number_label}</h4>
                                                <LineKindBadge phoneNumberId={linha.phone_number_id} />
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                ID: {linha.phone_number_id || 'N/A'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {linha.ativo ? (
                                            <Badge className="bg-green-100 text-green-700 border-green-200">
                                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                                Ativo
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-slate-500">
                                                <XCircle className="w-3 h-3 mr-1" />
                                                Ignorar
                                            </Badge>
                                        )}
                                        <Switch
                                            checked={linha.ativo}
                                            onCheckedChange={(checked) =>
                                                handleLinhaChange(linha.id, 'ativo', checked)
                                            }
                                        />
                                    </div>
                                </div>

                                {linha.ativo && (
                                    <div className="pt-4 border-t animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-muted-foreground">
                                                    Produto (filtra qual card vincular)
                                                </label>
                                                <Select
                                                    value={linha.produto || ''}
                                                    onChange={(val) =>
                                                        handleLinhaChange(linha.id, 'produto', val || null)
                                                    }
                                                    options={PRODUTOS}
                                                    placeholder="Todos os produtos"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-1.5">
                                                    <label className="text-xs font-medium text-muted-foreground">
                                                        Fase de Atendimento
                                                    </label>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <Info className="w-3 h-3 text-muted-foreground" />
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p className="max-w-xs">Define qual fase do pipeline esta linha atende. Usado para direcionar o botão WhatsApp na fase correta.</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                                <Select
                                                    value={linha.phase_id || ''}
                                                    onChange={(val) => handleLinhaChange(linha.id, 'phase_id', val || null)}
                                                    options={phaseOptions}
                                                    placeholder="Selecionar fase"
                                                />
                                            </div>
                                        </div>

                                        {/* Per-line overrides */}
                                        <div className="mt-4 pt-3 border-t border-dashed border-slate-200 space-y-3">
                                            {/* Criar contato automaticamente */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <label className="text-xs font-medium text-muted-foreground">
                                                        Criar contato automaticamente
                                                    </label>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <Info className="w-3 h-3 text-muted-foreground" />
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p className="max-w-xs">
                                                                    Cria um contato quando um número desconhecido envia mensagem por esta linha.
                                                                    &quot;Herdar&quot; usa o toggle global ({toggles['WHATSAPP_CREATE_CONTACT'] ? 'ativado' : 'desativado'}).
                                                                </p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                                                    {([
                                                        { value: null, label: 'Herdar' },
                                                        { value: true, label: 'Sim' },
                                                        { value: false, label: 'Não' },
                                                    ] as const).map(opt => {
                                                        const isActive = linha.criar_contato === opt.value;
                                                        return (
                                                            <button
                                                                key={String(opt.value)}
                                                                type="button"
                                                                onClick={() => handleLinhaChange(linha.id, 'criar_contato', opt.value)}
                                                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                                                    isActive
                                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                                                }`}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            {linha.criar_contato === null && (
                                                <p className="text-[11px] text-slate-400 -mt-2">
                                                    Usando config global: {toggles['WHATSAPP_CREATE_CONTACT'] ? 'criar contato' : 'não criar contato'}
                                                </p>
                                            )}

                                            {/* Criar card automaticamente */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <label className="text-xs font-medium text-muted-foreground">
                                                        Criar card automaticamente
                                                    </label>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <Info className="w-3 h-3 text-muted-foreground" />
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p className="max-w-xs">
                                                                    Cria um card quando um contato sem viagem ativa envia mensagem por esta linha.
                                                                    &quot;Herdar&quot; usa o toggle global ({toggles['WHATSAPP_CREATE_CARD'] ? 'ativado' : 'desativado'}).
                                                                </p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                                                    {([
                                                        { value: null, label: 'Herdar' },
                                                        { value: true, label: 'Sim' },
                                                        { value: false, label: 'Não' },
                                                    ] as const).map(opt => {
                                                        const isActive = linha.criar_card === opt.value;
                                                        return (
                                                            <button
                                                                key={String(opt.value)}
                                                                type="button"
                                                                onClick={() => handleLinhaChange(linha.id, 'criar_card', opt.value)}
                                                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                                                    isActive
                                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                                                }`}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            {linha.criar_card === null && (
                                                <p className="text-[11px] text-slate-400 -mt-2">
                                                    Usando config global: {toggles['WHATSAPP_CREATE_CARD'] ? 'criar card' : 'não criar card'}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {!linha.ativo && (
                                    <div className="flex items-center gap-2 p-2 mt-2 text-xs text-amber-700 bg-amber-50 rounded border border-amber-100">
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        Mensagens desta linha serão ignoradas
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
