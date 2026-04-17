import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import { Settings, Save, TestTube, Eye, EyeOff, ExternalLink, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Platform {
    id: string;
    name: string;
    provider: string;
    instance_label: string | null;
    api_base_url: string | null;
    api_key_encrypted: string | null;
    dashboard_url_template: string | null;
    capabilities: {
        has_direct_link?: boolean;
        requires_instance?: boolean;
        supports_user_mapping?: boolean;
    } | null;
    is_active: boolean;
    last_event_at: string | null;
}

export function WhatsAppPlatformEditor() {
    const queryClient = useQueryClient();
    const [editingPlatform, setEditingPlatform] = useState<string | null>(null);
    const [editedValues, setEditedValues] = useState<Record<string, Partial<Platform>>>({});
    const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});

    // Fetch platforms
    const { data: platforms = [], isLoading } = useQuery({
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

    // Update platform mutation
    const updatePlatform = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<Platform> }) => {
            const { error } = await supabase
                .from('whatsapp_platforms')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['whatsapp-platforms'] });
            toast.success('Plataforma atualizada com sucesso');
            setEditingPlatform(null);
            setEditedValues({});
        },
        onError: (error) => {
            toast.error('Erro ao atualizar: ' + error.message);
        }
    });

    const handleEdit = (platform: Platform) => {
        setEditingPlatform(platform.id);
        setEditedValues({
            [platform.id]: {
                api_base_url: platform.api_base_url || '',
                api_key_encrypted: platform.api_key_encrypted || '',
                dashboard_url_template: platform.dashboard_url_template || '',
                capabilities: platform.capabilities || { has_direct_link: true, requires_instance: true }
            }
        });
    };

    const handleSave = (platformId: string) => {
        const updates = editedValues[platformId];
        if (!updates) return;

        updatePlatform.mutate({ id: platformId, updates });
    };

    const handleCancel = () => {
        setEditingPlatform(null);
        setEditedValues({});
    };

    const updateValue = (platformId: string, field: keyof Platform, value: unknown) => {
        setEditedValues(prev => ({
            ...prev,
            [platformId]: {
                ...prev[platformId],
                [field]: value
            }
        }));
    };

    const updateCapability = (platformId: string, capability: string, value: boolean) => {
        const current = editedValues[platformId]?.capabilities || {};
        updateValue(platformId, 'capabilities', {
            ...current,
            [capability]: value
        });
    };

    const testConnection = async (platform: Platform) => {
        const apiUrl = editedValues[platform.id]?.api_base_url || platform.api_base_url;
        const apiKey = editedValues[platform.id]?.api_key_encrypted || platform.api_key_encrypted;

        if (!apiUrl || !apiKey) {
            toast.error('Configure a URL e API Key antes de testar');
            return;
        }

        toast.info('Testando conexão...');

        // For now, just simulate a test
        // In production, you'd call an edge function to test the API
        setTimeout(() => {
            toast.success('Configuração válida (teste simulado)');
        }, 1000);
    };

    if (isLoading) {
        return (
            <div className="p-6 text-muted-foreground">
                Carregando plataformas...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Instâncias WhatsApp</h2>
                    <p className="text-sm text-muted-foreground">
                        Configure as credenciais e URLs de cada plataforma.
                    </p>
                </div>
            </div>

            <div className="grid gap-4">
                {platforms.map((platform) => {
                    const isEditing = editingPlatform === platform.id;
                    const values = isEditing ? editedValues[platform.id] : platform;
                    const showKey = showApiKeys[platform.id];

                    return (
                        <Card
                            key={platform.id}
                            className={cn(
                                "transition-all duration-200",
                                isEditing && "ring-2 ring-primary/20 shadow-md"
                            )}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <CardTitle className="text-base">{platform.name}</CardTitle>
                                        <Badge variant={platform.is_active ? "default" : "secondary"}>
                                            {platform.is_active ? 'Ativo' : 'Inativo'}
                                        </Badge>
                                        {platform.instance_label && (
                                            <Badge variant="outline">{platform.instance_label}</Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isEditing ? (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={handleCancel}
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSave(platform.id)}
                                                    disabled={updatePlatform.isPending}
                                                >
                                                    <Save className="w-4 h-4 mr-1" />
                                                    Salvar
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleEdit(platform)}
                                            >
                                                <Settings className="w-4 h-4 mr-1" />
                                                Configurar
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <CardDescription className="flex items-center gap-2">
                                    Provider: {platform.provider}
                                    {platform.last_event_at && (
                                        <span className="text-xs">
                                            • Último evento: {new Date(platform.last_event_at).toLocaleDateString('pt-BR')}
                                        </span>
                                    )}
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                {/* API Base URL */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">
                                        API Base URL
                                    </label>
                                    {isEditing ? (
                                        <Input
                                            value={(values as Partial<Platform>).api_base_url || ''}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateValue(platform.id, 'api_base_url', e.target.value)}
                                            placeholder="https://api.chatpro.com.br/..."
                                        />
                                    ) : (
                                        <p className="text-sm">
                                            {platform.api_base_url || <span className="text-muted-foreground italic">Não configurado</span>}
                                        </p>
                                    )}
                                </div>

                                {/* API Key */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        API Key
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0"
                                            onClick={() => setShowApiKeys(prev => ({ ...prev, [platform.id]: !prev[platform.id] }))}
                                        >
                                            {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                        </Button>
                                    </label>
                                    {isEditing ? (
                                        <Input
                                            type={showKey ? 'text' : 'password'}
                                            value={(values as Partial<Platform>).api_key_encrypted || ''}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateValue(platform.id, 'api_key_encrypted', e.target.value)}
                                            placeholder="sk-..."
                                        />
                                    ) : (
                                        <p className="text-sm font-mono">
                                            {platform.api_key_encrypted
                                                ? (showKey ? platform.api_key_encrypted : '••••••••••••••••')
                                                : <span className="text-muted-foreground italic">Não configurado</span>
                                            }
                                        </p>
                                    )}
                                </div>

                                {/* Dashboard URL Template */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">
                                        URL do Dashboard (Template)
                                    </label>
                                    {isEditing ? (
                                        <Input
                                            value={(values as Partial<Platform>).dashboard_url_template || ''}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateValue(platform.id, 'dashboard_url_template', e.target.value)}
                                            placeholder="https://app.chatpro.com.br/chat/{conversation_id}"
                                        />
                                    ) : (
                                        <p className="text-sm flex items-center gap-2">
                                            {platform.dashboard_url_template ? (
                                                <>
                                                    <span className="truncate max-w-md">{platform.dashboard_url_template}</span>
                                                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                                </>
                                            ) : (
                                                <span className="text-muted-foreground italic">Não configurado</span>
                                            )}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        Use <code className="bg-muted px-1 rounded">{'{conversation_id}'}</code> como placeholder para o ID da conversa.
                                    </p>
                                </div>

                                {/* Capabilities */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">
                                        Capacidades
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge
                                            variant={((values as Partial<Platform>).capabilities?.has_direct_link ?? platform.capabilities?.has_direct_link) ? "default" : "secondary"}
                                            className={cn("cursor-pointer transition-colors", isEditing && "hover:bg-primary/80")}
                                            onClick={() => isEditing && updateCapability(
                                                platform.id,
                                                'has_direct_link',
                                                !((values as Partial<Platform>).capabilities?.has_direct_link)
                                            )}
                                        >
                                            {((values as Partial<Platform>).capabilities?.has_direct_link ?? platform.capabilities?.has_direct_link) ? (
                                                <><Check className="w-3 h-3 mr-1" /> Deep Link</>
                                            ) : (
                                                <><X className="w-3 h-3 mr-1" /> Deep Link</>
                                            )}
                                        </Badge>
                                        <Badge
                                            variant={((values as Partial<Platform>).capabilities?.requires_instance ?? platform.capabilities?.requires_instance) ? "default" : "secondary"}
                                            className={cn("cursor-pointer transition-colors", isEditing && "hover:bg-primary/80")}
                                            onClick={() => isEditing && updateCapability(
                                                platform.id,
                                                'requires_instance',
                                                !((values as Partial<Platform>).capabilities?.requires_instance)
                                            )}
                                        >
                                            {((values as Partial<Platform>).capabilities?.requires_instance ?? platform.capabilities?.requires_instance) ? (
                                                <><Check className="w-3 h-3 mr-1" /> Multi-Instância</>
                                            ) : (
                                                <><X className="w-3 h-3 mr-1" /> Multi-Instância</>
                                            )}
                                        </Badge>
                                    </div>
                                </div>

                                {/* Test Connection Button */}
                                {isEditing && (
                                    <div className="pt-2 border-t">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => testConnection(platform)}
                                        >
                                            <TestTube className="w-4 h-4 mr-1" />
                                            Testar Conexão
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
