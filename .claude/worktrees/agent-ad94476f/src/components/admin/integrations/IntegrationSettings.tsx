import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, Shield, Zap, Key, Eye, EyeOff, Save, TestTube, CheckCircle, ArrowUpRight, Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Setting {
    key: string;
    value: string;
    description: string;
}

export function IntegrationSettings() {
    const queryClient = useQueryClient();
    const [showApiKey, setShowApiKey] = useState(false);
    const [credentials, setCredentials] = useState({
        apiUrl: '',
        apiKey: ''
    });
    const [credentialsLoaded, setCredentialsLoaded] = useState(false);
    const [ownerId, setOwnerId] = useState('');
    const [dispatching, setDispatching] = useState(false);

    const { data: settings, isLoading } = useQuery({
        queryKey: ['integration-settings'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_settings')
                .select('*');

            if (error) throw error;

            // Load credentials into state
            const settingsMap = (data as Setting[]).reduce((acc, s) => {
                acc[s.key] = s.value;
                return acc;
            }, {} as Record<string, string>);

            if (!credentialsLoaded) {
                setCredentials({
                    apiUrl: settingsMap['ACTIVECAMPAIGN_API_URL'] || '',
                    apiKey: settingsMap['ACTIVECAMPAIGN_API_KEY'] || ''
                });
                setCredentialsLoaded(true);
            }

            return data as Setting[];
        }
    });

    const updateSetting = useMutation({
        mutationFn: async ({ key, value }: { key: string; value: string }) => {
            // Try update first
            const { data: existing } = await supabase
                .from('integration_settings')
                .select('key')
                .eq('key', key)
                .single();

            if (existing) {
                const { error } = await supabase
                    .from('integration_settings')
                    .update({ value })
                    .eq('key', key);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('integration_settings')
                    .insert({ key, value, description: '' });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['integration-settings'] });
            toast.success('Configuração atualizada com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao atualizar configuração: ' + error.message);
        }
    });

    const getSetting = (key: string) => settings?.find(s => s.key === key)?.value === 'true';

    const handleToggle = (key: string, currentValue: boolean) => {
        // Safety checks
        if (key === 'WRITE_MODE_ENABLED' && !currentValue) {
            // Enabling write mode
            if (getSetting('SHADOW_MODE_ENABLED')) {
                toast.error('Você deve desativar o Shadow Mode antes de habilitar a escrita.');
                return;
            }
            const confirm = window.confirm('PERIGO: Você está prestes a habilitar a escrita real no banco de dados. Isso pode alterar dados de clientes e negócios. Tem certeza?');
            if (!confirm) return;
        }

        updateSetting.mutate({ key, value: String(!currentValue) });
    };

    const saveCredentials = async () => {
        try {
            await updateSetting.mutateAsync({ key: 'ACTIVECAMPAIGN_API_URL', value: credentials.apiUrl });
            await updateSetting.mutateAsync({ key: 'ACTIVECAMPAIGN_API_KEY', value: credentials.apiKey });
            toast.success('Credenciais salvas com sucesso!');
        } catch (error) {
            // Error already handled in mutation
        }
    };

    const testConnection = async () => {
        if (!credentials.apiUrl || !credentials.apiKey) {
            toast.error('Preencha a URL e API Key antes de testar');
            return;
        }

        toast.info('Testando conexão...');

        try {
            // Call the sync-catalog edge function to test
            const { error } = await supabase.functions.invoke('integration-sync-catalog', {
                body: { test_only: true }
            });

            if (error) throw error;
            toast.success('Conexão estabelecida com sucesso!');
        } catch (error: any) {
            toast.error('Falha na conexão: ' + (error.message || 'Erro desconhecido'));
        }
    };

    if (isLoading) return <div className="p-4 text-muted-foreground">Carregando configurações...</div>;

    const inboundEnabled = getSetting('INBOUND_INGEST_ENABLED');
    const shadowModeEnabled = getSetting('SHADOW_MODE_ENABLED');
    const writeModeEnabled = getSetting('WRITE_MODE_ENABLED');
    const outboundEnabled = getSetting('OUTBOUND_SYNC_ENABLED');
    const outboundShadowMode = getSetting('OUTBOUND_SHADOW_MODE');
    const hasCredentials = credentials.apiUrl && credentials.apiKey;

    // Outbound dispatch mutation
    const handleDispatchOutbound = async () => {
        setDispatching(true);
        const toastId = toast.loading('Processando fila de eventos outbound...');
        try {
            const { data, error } = await supabase.functions.invoke('integration-dispatch');
            if (error) throw error;

            const sent = data?.sent || 0;
            const failed = data?.failed || 0;
            const processed = data?.processed || 0;

            if (processed === 0) {
                toast.info('Nenhum evento pendente na fila.', { id: toastId });
            } else {
                toast.success(`✅ ${sent} eventos enviados, ${failed} falhas`, { id: toastId });
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
            toast.error('Erro ao processar: ' + errorMessage, { id: toastId });
        } finally {
            setDispatching(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl">
            {/* API Credentials */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Key className="w-5 h-5 text-orange-500" />
                        Credenciais ActiveCampaign
                    </CardTitle>
                    <CardDescription>
                        Configure a conexão com a API do ActiveCampaign.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">API URL</label>
                        <Input
                            value={credentials.apiUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCredentials(prev => ({ ...prev, apiUrl: e.target.value }))}
                            placeholder="https://sua-conta.api-us1.com"
                        />
                        <p className="text-xs text-muted-foreground">
                            Encontre em ActiveCampaign → Settings → Developer
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                            API Key
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => setShowApiKey(!showApiKey)}
                            >
                                {showApiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </Button>
                        </label>
                        <Input
                            type={showApiKey ? 'text' : 'password'}
                            value={credentials.apiKey}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCredentials(prev => ({ ...prev, apiKey: e.target.value }))}
                            placeholder="Sua API Key do ActiveCampaign"
                        />
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <Button onClick={saveCredentials} disabled={updateSetting.isPending}>
                            <Save className="w-4 h-4 mr-1" />
                            Salvar
                        </Button>
                        <Button variant="outline" onClick={testConnection} disabled={!hasCredentials}>
                            <TestTube className="w-4 h-4 mr-1" />
                            Testar Conexão
                        </Button>
                        {hasCredentials && (
                            <Badge variant="outline" className="text-green-600 border-green-200">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Configurado
                            </Badge>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Inbound Control */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <Zap className="w-5 h-5 text-blue-500" />
                                Ingestão de Dados (Inbound)
                            </CardTitle>
                            <CardDescription>
                                Controla se o sistema aceita novos webhooks do ActiveCampaign.
                            </CardDescription>
                        </div>
                        <Switch
                            checked={inboundEnabled}
                            onCheckedChange={() => handleToggle('INBOUND_INGEST_ENABLED', inboundEnabled)}
                        />
                    </div>
                </CardHeader>
            </Card>

            {/* Shadow Mode Control */}
            <Card className={cn("transition-colors", shadowModeEnabled ? "bg-purple-50 border-purple-200" : "")}>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <Shield className={cn("w-5 h-5", shadowModeEnabled ? "text-purple-600" : "text-muted-foreground")} />
                                Shadow Mode (Modo Sombra)
                            </CardTitle>
                            <CardDescription>
                                Quando ativo, o sistema processa eventos e simula alterações, mas <strong>NÃO</strong> grava no banco de dados principal.
                            </CardDescription>
                        </div>
                        <Switch
                            checked={shadowModeEnabled}
                            onCheckedChange={() => handleToggle('SHADOW_MODE_ENABLED', shadowModeEnabled)}
                        />
                    </div>
                </CardHeader>
            </Card>

            {/* Danger Zone */}
            <Card className={cn("transition-colors", writeModeEnabled ? "bg-red-50 border-red-200" : "")}>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2 text-red-600">
                                <AlertTriangle className="w-5 h-5" />
                                Write Mode (Modo de Escrita)
                            </CardTitle>
                            <CardDescription className="text-red-600/80">
                                <strong>PERIGO:</strong> Habilita a escrita real nas tabelas do CRM (Cards, Contatos, etc).
                                <br />
                                Requer que o Shadow Mode esteja desligado.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-4">
                            {writeModeEnabled && <Badge variant="destructive" className="animate-pulse">ATIVO</Badge>}
                            <Switch
                                checked={writeModeEnabled}
                                onCheckedChange={() => handleToggle('WRITE_MODE_ENABLED', writeModeEnabled)}
                                disabled={shadowModeEnabled} // Cannot enable write if shadow is on (UI enforcement)
                            />
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Divider */}
            <div className="border-t border-slate-300 pt-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <ArrowUpRight className="w-5 h-5 text-emerald-600" />
                    Sincronização de Saída (CRM → ActiveCampaign)
                </h2>
            </div>

            {/* Outbound Sync Control */}
            <Card className={cn("transition-colors", outboundEnabled ? "bg-emerald-50 border-emerald-200" : "")}>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <ArrowUpRight className={cn("w-5 h-5", outboundEnabled ? "text-emerald-600" : "text-muted-foreground")} />
                                Sincronização Outbound
                            </CardTitle>
                            <CardDescription>
                                Quando ativo, mudanças em Cards (etapa, status ganho/perdido, campos mapeados) são enviadas de volta para o ActiveCampaign.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-4">
                            {outboundEnabled && <Badge className="bg-emerald-100 text-emerald-700">ATIVO</Badge>}
                            <Switch
                                checked={outboundEnabled}
                                onCheckedChange={() => handleToggle('OUTBOUND_SYNC_ENABLED', outboundEnabled)}
                            />
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Outbound Shadow Mode */}
            <Card className={cn("transition-colors", outboundShadowMode ? "bg-amber-50 border-amber-200" : "")}>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <Shield className={cn("w-5 h-5", outboundShadowMode ? "text-amber-600" : "text-muted-foreground")} />
                                Shadow Mode (Outbound)
                            </CardTitle>
                            <CardDescription>
                                Quando ativo, eventos são registrados na fila mas <strong>NÃO</strong> são enviados para o ActiveCampaign.
                                <br />
                                Use para testar o mapeamento antes de ativar a sincronização real.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-4">
                            {outboundShadowMode && <Badge className="bg-amber-100 text-amber-700">MODO TESTE</Badge>}
                            <Switch
                                checked={outboundShadowMode}
                                onCheckedChange={() => handleToggle('OUTBOUND_SHADOW_MODE', outboundShadowMode)}
                            />
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Outbound Dispatch Manual */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <Play className="w-5 h-5 text-blue-500" />
                                Processar Fila Outbound
                            </CardTitle>
                            <CardDescription>
                                Processa manualmente os eventos pendentes na fila de saída.
                                {outboundShadowMode && (
                                    <span className="block text-amber-600 mt-1">
                                        ⚠️ Shadow Mode ativo - eventos NÃO serão enviados para o AC.
                                    </span>
                                )}
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleDispatchOutbound}
                            disabled={dispatching || !outboundEnabled}
                        >
                            {dispatching ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Play className="w-4 h-4 mr-2" />
                            )}
                            {dispatching ? 'Processando...' : 'Processar Agora'}
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            {/* Sync Operations */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <Zap className="w-5 h-5 text-yellow-500" />
                                Sincronização Manual
                            </CardTitle>
                            <CardDescription>
                                Force a sincronização de dados do ActiveCampaign.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="flex-1 max-w-xs">
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                Filtrar por Dono (ID do Usuário AC)
                            </label>
                            <Input
                                placeholder="Ex: 1"
                                value={ownerId}
                                onChange={(e) => setOwnerId(e.target.value)}
                                className="h-9"
                            />
                        </div>
                        <Button
                            variant="outline"
                            className="mt-5"
                            onClick={async () => {
                                const confirm = window.confirm(`Isso irá buscar ${ownerId ? `apenas negócios do dono ${ownerId}` : 'TODOS os negócios'} do ActiveCampaign e atualizar o CRM. Pode levar alguns minutos. Deseja continuar?`);
                                if (!confirm) return;

                                const toastId = toast.loading('Sincronizando dados do ActiveCampaign...');
                                try {
                                    const { data, error } = await supabase.functions.invoke('integration-sync-deals', {
                                        body: {
                                            force_update: true,
                                            owner_id: ownerId || undefined
                                        }
                                    });
                                    if (error) throw error;

                                    const fetched = data?.deals_fetched || 0;
                                    const processed = data?.events_processed || 0;
                                    const processError = data?.process_error;

                                    if (fetched === 0) {
                                        toast.info('Nenhum deal encontrado para sincronizar.', { id: toastId });
                                    } else if (processError) {
                                        toast.warning(`${fetched} deals encontrados, mas houve erro no processamento: ${processError}`, { id: toastId });
                                    } else {
                                        toast.success(`✅ ${fetched} deals encontrados, ${processed} atualizados no CRM!`, { id: toastId });
                                    }
                                } catch (err: any) {
                                    toast.error('Erro ao sincronizar: ' + err.message, { id: toastId });
                                }
                            }}
                        >
                            <Zap className="w-4 h-4 mr-2" />
                            Forçar Sincronização {ownerId ? 'Filtrada' : 'Completa'}
                        </Button>
                        <p className="text-sm text-muted-foreground mt-5">
                            Use isso se perceber que dados estão desatualizados.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

