import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
    MessageSquare,
    Settings,
    ExternalLink,
    Copy,
    Check,
    Inbox,
    GitBranch,
    RefreshCw,
    AlertCircle,
    Shield,
    Link2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { WhatsAppPayloadExplorer } from './WhatsAppPayloadExplorer';
import { WhatsAppFieldMapping } from './WhatsAppFieldMapping';
import { WhatsAppGovernanceTab } from './WhatsAppGovernanceTab';
import { PhaseInstanceMappingTab } from './PhaseInstanceMappingTab';

interface Platform {
    id: string;
    name: string;
    provider: 'chatpro' | 'echo';
    dashboard_url_template: string | null;
    is_active: boolean;
    last_event_at?: string | null;
    config?: Record<string, unknown>;
}

interface EventStats {
    platform_id: string;
    total: number;
    pending: number;
    processed: number;
    failed: number;
}

export function WhatsAppPage() {
    const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const queryClient = useQueryClient();

    // Fetch platforms
    const { data: platforms, isLoading } = useQuery({
        queryKey: ['whatsapp-platforms'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('whatsapp_platforms')
                .select('*')
                .order('name');
            if (error) throw error;
            return data as Platform[];
        }
    });

    // Fetch event stats
    const { data: eventStats } = useQuery({
        queryKey: ['whatsapp-event-stats'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('whatsapp_raw_events')
                .select('platform_id, status');

            if (error) throw error;

            // Aggregate stats
            const stats: Record<string, EventStats> = {};
            for (const event of data || []) {
                if (!event.platform_id) continue;
                if (!stats[event.platform_id]) {
                    stats[event.platform_id] = {
                        platform_id: event.platform_id,
                        total: 0,
                        pending: 0,
                        processed: 0,
                        failed: 0
                    };
                }
                stats[event.platform_id].total++;
                if (event.status === 'pending') stats[event.platform_id].pending++;
                if (event.status === 'processed') stats[event.platform_id].processed++;
                if (event.status === 'failed') stats[event.platform_id].failed++;
            }
            return stats;
        }
    });

    // Toggle platform active status
    const toggleActiveMutation = useMutation({
        mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
            const { error } = await supabase
                .from('whatsapp_platforms')
                .update({ is_active })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['whatsapp-platforms'] });
            toast.success('Status atualizado');
        },
        onError: (e) => toast.error(`Erro: ${e.message}`)
    });

    const getWebhookUrl = (provider: string) => {
        const baseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jfkxqvkhsygzslnafgmk.supabase.co';
        return `${baseUrl}/functions/v1/whatsapp-webhook?provider=${provider}`;
    };

    const copyToClipboard = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        toast.success('URL copiada!');
        setTimeout(() => setCopiedId(null), 2000);
    };

    const getProviderColor = (provider: string) => {
        switch (provider) {
            case 'chatpro': return 'bg-green-500/10 text-green-600 border-green-200';
            case 'echo': return 'bg-purple-500/10 text-purple-600 border-purple-200';
            default: return 'bg-gray-500/10 text-gray-600 border-gray-200';
        }
    };

    if (selectedPlatform) {
        const platform = platforms?.find(p => p.id === selectedPlatform);
        if (!platform) return null;

        return (
            <div className="h-full p-6 space-y-6 pb-20">
                <div className="flex items-center gap-4 border-b pb-4">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedPlatform(null)}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Button>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">{platform.name}</h1>
                            <Badge className={getProviderColor(platform.provider)}>{platform.provider}</Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">Gerencie webhooks e mapeamentos de campos</p>
                    </div>
                </div>

                <Tabs defaultValue="mapping" className="space-y-6">
                    <TabsList>
                        <TabsTrigger value="mapping" className="gap-2">
                            <GitBranch className="w-4 h-4" />
                            Mapeamento
                        </TabsTrigger>
                        <TabsTrigger value="explorer" className="gap-2">
                            <Inbox className="w-4 h-4" />
                            Histórico
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="gap-2">
                            <Settings className="w-4 h-4" />
                            Configurações
                        </TabsTrigger>
                        <TabsTrigger value="governance" className="gap-2">
                            <Shield className="w-4 h-4" />
                            Governança
                        </TabsTrigger>
                        <TabsTrigger value="routing" className="gap-2">
                            <Link2 className="w-4 h-4" />
                            Roteamento
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="explorer">
                        <WhatsAppPayloadExplorer platformId={platform.id} />
                    </TabsContent>

                    <TabsContent value="mapping">
                        <WhatsAppFieldMapping platformId={platform.id} />
                    </TabsContent>

                    <TabsContent value="settings">
                        <Card>
                            <CardHeader>
                                <CardTitle>Configurações da Plataforma</CardTitle>
                                <CardDescription>Configure a integração com {platform.name}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Webhook URL */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        URL do Webhook
                                    </label>
                                    <p className="text-xs text-muted-foreground mb-2">
                                        Configure esta URL no {platform.name} para receber eventos
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 px-3 py-2 bg-muted rounded-md text-sm font-mono break-all">
                                            {getWebhookUrl(platform.provider)}
                                        </code>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => copyToClipboard(getWebhookUrl(platform.provider), platform.id)}
                                        >
                                            {copiedId === platform.id ? (
                                                <Check className="w-4 h-4 text-green-600" />
                                            ) : (
                                                <Copy className="w-4 h-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                {/* Dashboard URL Template */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        URL do Dashboard (Template)
                                    </label>
                                    <p className="text-xs text-muted-foreground mb-2">
                                        URL para abrir conversas. Use {'{conversation_id}'} como placeholder.
                                    </p>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-input rounded-md bg-background"
                                        placeholder="https://app.chatpro.com/chat/{conversation_id}"
                                        defaultValue={platform.dashboard_url_template || ''}
                                    />
                                </div>

                                {/* Status Toggle */}
                                <div className="flex items-center justify-between pt-4 border-t">
                                    <div>
                                        <h4 className="font-medium">Status da Integração</h4>
                                        <p className="text-sm text-muted-foreground">
                                            {platform.is_active ? 'Recebendo webhooks' : 'Webhooks desativados'}
                                        </p>
                                    </div>
                                    <Button
                                        variant={platform.is_active ? "destructive" : "default"}
                                        onClick={() => toggleActiveMutation.mutate({
                                            id: platform.id,
                                            is_active: !platform.is_active
                                        })}
                                    >
                                        {platform.is_active ? 'Desativar' : 'Ativar'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="governance">
                        <WhatsAppGovernanceTab />
                    </TabsContent>

                    <TabsContent value="routing">
                        <PhaseInstanceMappingTab />
                    </TabsContent>
                </Tabs>
            </div>
        );
    }

    return (
        <div className="h-full p-6 space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <MessageSquare className="w-6 h-6" />
                        Integrações WhatsApp
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Gerencie conexões com Echo e outras plataformas
                    </p>
                </div>
                <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['whatsapp-platforms'] })}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Atualizar
                </Button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : platforms?.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">Nenhuma plataforma configurada</h3>
                        <p className="text-muted-foreground text-sm">
                            Execute a migration do banco de dados para criar as plataformas padrão.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {platforms?.map((platform) => {
                        const stats = eventStats?.[platform.id];
                        return (
                            <Card
                                key={platform.id}
                                className={`cursor-pointer transition-all hover:shadow-md ${platform.is_active
                                    ? 'border-green-200 bg-green-500/5 hover:bg-green-500/10'
                                    : 'border-gray-200 bg-gray-500/5 opacity-60'
                                    }`}
                                onClick={() => setSelectedPlatform(platform.id)}
                            >
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="flex items-center gap-2">
                                            <MessageSquare className="w-5 h-5" />
                                            {platform.name}
                                        </CardTitle>
                                        <Badge className={getProviderColor(platform.provider)}>
                                            {platform.provider}
                                        </Badge>
                                    </div>
                                    <CardDescription>
                                        {platform.is_active ? (
                                            <span className="text-green-600 flex items-center gap-1">
                                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                                Ativo
                                            </span>
                                        ) : (
                                            <span className="text-gray-500">Inativo</span>
                                        )}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 text-sm">
                                        {/* Stats */}
                                        {stats && (
                                            <div className="flex gap-4 text-xs">
                                                <span className="text-muted-foreground">
                                                    Total: <strong>{stats.total}</strong>
                                                </span>
                                                {stats.pending > 0 && (
                                                    <span className="text-yellow-600">
                                                        Pendente: <strong>{stats.pending}</strong>
                                                    </span>
                                                )}
                                                {stats.failed > 0 && (
                                                    <span className="text-red-600">
                                                        Falhou: <strong>{stats.failed}</strong>
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Last event */}
                                        {platform.last_event_at && (
                                            <p className="text-xs text-muted-foreground">
                                                Último evento: {formatDistanceToNow(new Date(platform.last_event_at), {
                                                    addSuffix: true,
                                                    locale: ptBR
                                                })}
                                            </p>
                                        )}

                                        <div className="flex items-center gap-2 pt-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="flex-1"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyToClipboard(getWebhookUrl(platform.provider), platform.id);
                                                }}
                                            >
                                                {copiedId === platform.id ? (
                                                    <Check className="w-3 h-3 mr-1" />
                                                ) : (
                                                    <Copy className="w-3 h-3 mr-1" />
                                                )}
                                                Copiar URL
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedPlatform(platform.id);
                                                }}
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
