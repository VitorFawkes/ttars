import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
    ArrowLeft, Copy, Check, Zap, Loader2,
    ArrowRight as ArrowRightIcon, Plus, Trash2, History, Settings
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/textarea';
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { IntegrationLogs } from './IntegrationLogs';
import {
    type IntegrationType,
    validateConfig,
    type OutboundConfig,
    type HttpMethod
} from '@/lib/integrations';

// --- CRM SCHEMA (Simplified for brevity, ideally imported) ---
const CRM_FIELDS = [
    { label: 'Negócio: Título', value: 'deal.titulo' },
    { label: 'Negócio: Valor', value: 'deal.valor_estimado' },
    { label: 'Contato: Nome', value: 'contact.nome' },
    { label: 'Contato: Email', value: 'contact.email' },
    { label: 'Contato: Telefone', value: 'contact.telefone' },
];

interface IntegrationBuilderProps {
    integrationId: string | 'new';
    initialType?: IntegrationType;
    onBack: () => void;
    onDraftCreated?: (id: string) => void;
}

export function IntegrationBuilder({ integrationId: initialId, initialType = 'input', onBack, onDraftCreated }: IntegrationBuilderProps) {
    const queryClient = useQueryClient();
    const [currentId, setCurrentId] = useState<string>(initialId === 'new' ? '' : initialId);
    const [step, setStep] = useState<'config' | 'mapping' | 'test'>('config');
    const [isLoadingDraft, setIsLoadingDraft] = useState(initialId === 'new');
    const initializationRef = useRef(false);

    // --- State ---
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    // Inbound State
    const [capturedPayload, setCapturedPayload] = useState<any>(null);
    const [inboundMapping, setInboundMapping] = useState<Record<string, string>>({});
    const [storeRawPayload, setStoreRawPayload] = useState(false); // Phase 2

    // Outbound State
    const [outboundConfig, setOutboundConfig] = useState<OutboundConfig>({
        trigger_event: '',
        method: 'POST',
        url: '',
        headers: [],
        payload_mode: 'custom', // Phase 2
        body_template: '{\n  "event": "{{event}}",\n  "data": {\n    "id": "{{deal.id}}"\n  }\n}'
    });

    // --- 1. Draft Logic ---
    useEffect(() => {
        const createDraft = async () => {
            if (initialId === 'new' && !currentId && !initializationRef.current) {
                initializationRef.current = true;
                const { data, error } = await supabase
                    .from('integrations' as any)
                    .insert([{
                        name: 'Nova Integração (Rascunho)',
                        type: initialType,
                        provider: initialType === 'input' ? 'webhook-in' : 'webhook-out',
                        config: initialType === 'input' ? { mapping: {} } : {
                            trigger_event: '', method: 'POST', url: '', headers: []
                        },
                        is_active: true
                    }])
                    .select()
                    .single();

                if (error) {
                    toast.error('Erro ao inicializar.');
                    return;
                }
                const newIntegration = data as any;
                setCurrentId(newIntegration.id);
                setIsLoadingDraft(false);
                if (onDraftCreated) onDraftCreated(newIntegration.id);
            }
        };
        createDraft();
    }, [initialId, initialType, onDraftCreated, currentId]);

    // --- 2. Fetch Data ---
    useQuery({
        queryKey: ['integration', currentId],
        queryFn: async () => {
            if (!currentId) return null;
            const { data } = await supabase
                .from('integrations' as any)
                .select('*')
                .eq('id', currentId)
                .single();

            const integration = data as any;
            if (integration) {
                setName(integration.name.replace(' (Rascunho)', ''));
                setDescription(integration.description || '');

                if (integration.type === 'input') {
                    setInboundMapping(integration.config?.mapping || {});
                    setStoreRawPayload(integration.config?.store_raw_payload || false); // Phase 2
                    if (Object.keys(integration.config?.mapping || {}).length > 0) setStep('mapping');
                } else {
                    // Load outbound config
                    const config = integration.config || {};
                    setOutboundConfig({
                        trigger_event: config.trigger_event || '',
                        method: config.method || 'POST',
                        url: config.url || '',
                        headers: config.headers || [],
                        payload_mode: config.payload_mode || 'custom', // Phase 2
                        body_template: config.body_template || ''
                    });
                }
            }
            return integration;
        },
        enabled: !!currentId && initialId !== 'new'
    });

    // --- 3. Poll Events (Inbound Only) ---
    useQuery({
        queryKey: ['integration-events', currentId],
        queryFn: async () => {
            if (!currentId || initialType !== 'input') return null;
            const { data } = await supabase
                .from('integration_events' as any)
                .select('*')
                .eq('integration_id', currentId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (data) {
                const eventData = data as any;
                const payload = eventData.payload || eventData.body;
                if (!capturedPayload) {
                    setCapturedPayload(payload);
                    if (step === 'config') {
                        setStep('mapping');
                        toast.success('Payload recebido!');
                    }
                }
            }
            return data;
        },
        enabled: !!currentId && initialType === 'input',
        refetchInterval: 3000
    });

    // --- Mutations ---
    const saveMutation = useMutation({
        mutationFn: async () => {
            // Validate Config
            let config: any = {};
            if (initialType === 'input') {
                config = {
                    mapping: inboundMapping,
                    store_raw_payload: storeRawPayload // Phase 2
                };
            } else {
                config = outboundConfig;
            }

            const validation = validateConfig(initialType, config);
            if (!validation.success) {
                // Cast to any to avoid TS union issues with ZodError
                throw new Error((validation.error as any).errors[0].message);
            }

            const { error } = await supabase
                .from('integrations' as any)
                .update({
                    name: name || 'Integração Sem Nome',
                    description,
                    config,
                    is_active: true
                })
                .eq('id', currentId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['integrations'] });
            toast.success('Salvo com sucesso!');
            onBack();
        },
        onError: (e: any) => toast.error(e.message)
    });

    const deleteDraftMutation = useMutation({
        mutationFn: async () => {
            if (initialId === 'new' && currentId) {
                await supabase.from('integrations' as any).delete().eq('id', currentId);
            }
        },
        onSuccess: onBack
    });

    // --- Render Helpers ---
    const webhookUrl = currentId
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-ingest?id=${currentId}`
        : '...';

    if (isLoadingDraft) {
        return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="p-6 space-y-8 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => initialId === 'new' ? deleteDraftMutation.mutate() : onBack()}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {initialType === 'input' ? 'Receber Dados (Webhook)' : 'Enviar Dados (Disparo)'}
                        </h1>
                        <p className="text-muted-foreground text-sm">Configure como os dados fluem entre o CRM e suas ferramentas.</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => initialId === 'new' ? deleteDraftMutation.mutate() : onBack()}>
                        Cancelar
                    </Button>
                    <Button onClick={() => saveMutation.mutate()} disabled={!name}>
                        <Check className="w-4 h-4 mr-2" />
                        Salvar Integração
                    </Button>
                </div>
            </div>

            {/* --- TABS: Config + Logs --- */}
            <Tabs defaultValue="config" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="config" className="gap-2">
                        <Settings className="w-4 h-4" />
                        Configuração
                    </TabsTrigger>
                    {initialId !== 'new' && (
                        <TabsTrigger value="logs" className="gap-2">
                            <History className="w-4 h-4" />
                            Histórico
                        </TabsTrigger>
                    )}
                </TabsList>

                {/* --- CONFIG TAB --- */}
                <TabsContent value="config">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left Sidebar: Basic Info */}
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Informações Básicas</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Nome da Integração</Label>
                                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Leads do Facebook" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Descrição (Opcional)</Label>
                                        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Para que serve essa integração?" />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Status Card */}
                            <Card className="bg-muted/50">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <span className="text-sm font-medium">Status</span>
                                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                                        {initialId === 'new' ? 'Rascunho' : 'Ativo'}
                                    </Badge>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Right Content: The Builder */}
                        <div className="lg:col-span-2 space-y-6">

                            {/* --- INBOUND FLOW --- */}
                            {initialType === 'input' && (
                                <>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <Zap className="w-5 h-5 text-yellow-500" />
                                                1. Conexão Webhook
                                            </CardTitle>
                                            <CardDescription>Envie um POST para esta URL para iniciar.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="flex items-center gap-2 p-3 bg-muted rounded-md border font-mono text-sm">
                                                <span className="flex-1 truncate">{webhookUrl}</span>
                                                <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('Copiado!'); }}>
                                                    <Copy className="w-4 h-4" />
                                                </Button>
                                            </div>
                                            {!capturedPayload && (
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Aguardando primeiro evento...
                                                </div>
                                            )}
                                            {capturedPayload && (
                                                <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                                                    <Check className="w-4 h-4" />
                                                    Payload recebido com sucesso!
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    {capturedPayload && (
                                        <Card>
                                            <CardHeader>
                                                <CardTitle>2. Mapeamento de Campos</CardTitle>
                                                <CardDescription>Associe os dados recebidos aos campos do CRM.</CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-4">
                                                    {Object.keys(capturedPayload).map((key) => (
                                                        <div key={key} className="flex items-center gap-4">
                                                            <div className="flex-1 p-2 bg-muted rounded border text-sm font-mono truncate">
                                                                {key} <span className="text-muted-foreground opacity-50">({String(capturedPayload[key])})</span>
                                                            </div>
                                                            <ArrowRightIcon className="w-4 h-4 text-muted-foreground" />
                                                            <div className="flex-1">
                                                                <Select
                                                                    value={inboundMapping[key] || ''}
                                                                    onChange={(val) => setInboundMapping(prev => ({ ...prev, [key]: val }))}
                                                                    options={[
                                                                        { value: 'ignore', label: '-- Ignorar --' },
                                                                        ...CRM_FIELDS
                                                                    ]}
                                                                    placeholder="Selecionar campo..."
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Phase 2: Store Raw Payload Toggle */}
                                    <Card className="bg-blue-50/50 border-blue-200">
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="font-medium text-sm">Guardar Payload Completo</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Salva todos os dados recebidos, mesmo os não mapeados. Útil para auditoria.
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={storeRawPayload}
                                                    onCheckedChange={setStoreRawPayload}
                                                />
                                            </div>
                                        </CardContent>
                                    </Card>
                                </>
                            )}

                            {/* --- OUTBOUND FLOW --- */}
                            {initialType === 'output' && (
                                <>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>1. Gatilho (Trigger)</CardTitle>
                                            <CardDescription>Quando esta integração deve ser disparada?</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <Select
                                                value={outboundConfig.trigger_event}
                                                onChange={(val) => setOutboundConfig(prev => ({ ...prev, trigger_event: val }))}
                                                options={[
                                                    { value: 'deal.created', label: 'Negócio Criado' },
                                                    { value: 'deal.moved', label: 'Negócio Mudou de Fase' },
                                                    { value: 'deal.won', label: 'Negócio Ganho' },
                                                    { value: 'contact.created', label: 'Contato Criado' }
                                                ]}
                                                placeholder="Selecione um evento..."
                                            />
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle>2. Destino</CardTitle>
                                            <CardDescription>Para onde vamos enviar os dados?</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="flex gap-2">
                                                <div className="w-[120px]">
                                                    <Select
                                                        value={outboundConfig.method}
                                                        onChange={(val) => setOutboundConfig(prev => ({ ...prev, method: val as HttpMethod }))}
                                                        options={[
                                                            { value: 'POST', label: 'POST' },
                                                            { value: 'GET', label: 'GET' },
                                                            { value: 'PUT', label: 'PUT' }
                                                        ]}
                                                    />
                                                </div>
                                                <Input
                                                    placeholder="https://api.exemplo.com/v1/webhook"
                                                    value={outboundConfig.url}
                                                    onChange={e => setOutboundConfig(prev => ({ ...prev, url: e.target.value }))}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Headers (Opcional)</Label>
                                                {outboundConfig.headers.map((h, idx) => (
                                                    <div key={idx} className="flex gap-2">
                                                        <Input
                                                            placeholder="Key (ex: Authorization)"
                                                            value={h.key}
                                                            onChange={e => {
                                                                const newHeaders = [...outboundConfig.headers];
                                                                newHeaders[idx].key = e.target.value;
                                                                setOutboundConfig(prev => ({ ...prev, headers: newHeaders }));
                                                            }}
                                                        />
                                                        <Input
                                                            placeholder="Value"
                                                            value={h.value}
                                                            onChange={e => {
                                                                const newHeaders = [...outboundConfig.headers];
                                                                newHeaders[idx].value = e.target.value;
                                                                setOutboundConfig(prev => ({ ...prev, headers: newHeaders }));
                                                            }}
                                                        />
                                                        <Button variant="ghost" size="icon" onClick={() => {
                                                            const newHeaders = outboundConfig.headers.filter((_, i) => i !== idx);
                                                            setOutboundConfig(prev => ({ ...prev, headers: newHeaders }));
                                                        }}>
                                                            <Trash2 className="w-4 h-4 text-red-500" />
                                                        </Button>
                                                    </div>
                                                ))}
                                                <Button variant="outline" size="sm" onClick={() => setOutboundConfig(prev => ({ ...prev, headers: [...prev.headers, { key: '', value: '' }] }))}>
                                                    <Plus className="w-4 h-4 mr-2" /> Adicionar Header
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle>3. Corpo da Requisição</CardTitle>
                                            <CardDescription>Escolha como montar o corpo do JSON enviado.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {/* Phase 2: Payload Mode Selection */}
                                            <div className="flex gap-2">
                                                <Button
                                                    type="button"
                                                    variant={outboundConfig.payload_mode === 'full_object' ? 'default' : 'outline'}
                                                    className="flex-1"
                                                    onClick={() => setOutboundConfig(prev => ({ ...prev, payload_mode: 'full_object' as const }))}
                                                >
                                                    🚀 Enviar Objeto Completo
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant={outboundConfig.payload_mode === 'custom' ? 'default' : 'outline'}
                                                    className="flex-1"
                                                    onClick={() => setOutboundConfig(prev => ({ ...prev, payload_mode: 'custom' as const }))}
                                                >
                                                    ✏️ Personalizado
                                                </Button>
                                            </div>

                                            {outboundConfig.payload_mode === 'full_object' && (
                                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                                    <p className="text-sm font-medium text-green-700">Modo Objeto Completo</p>
                                                    <p className="text-xs text-green-600 mt-1">
                                                        Todos os dados do Negócio, Contato e Usuário serão enviados automaticamente em um JSON estruturado.
                                                    </p>
                                                    <pre className="mt-2 p-2 bg-white/50 rounded text-xs font-mono text-green-800 overflow-x-auto">
                                                        {`{
  "event": "deal.moved",
  "deal": { "id", "titulo", "valor_estimado", ... },
  "contact": { "nome", "email", "telefone", ... },
  "user": { "nome", "email", ... }
}`}
                                                    </pre>
                                                </div>
                                            )}

                                            {outboundConfig.payload_mode === 'custom' && (
                                                <>
                                                    <div className="flex gap-2 flex-wrap">
                                                        {CRM_FIELDS.map(f => (
                                                            <Badge
                                                                key={f.value}
                                                                variant="secondary"
                                                                className="cursor-pointer hover:bg-primary/20"
                                                                onClick={() => {
                                                                    setOutboundConfig(prev => ({
                                                                        ...prev,
                                                                        body_template: (prev.body_template || '') + ` {{${f.value}}}`
                                                                    }));
                                                                }}
                                                            >
                                                                {f.value}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                    <Textarea
                                                        className="font-mono h-[200px]"
                                                        value={outboundConfig.body_template || ''}
                                                        onChange={e => setOutboundConfig(prev => ({ ...prev, body_template: e.target.value }))}
                                                        placeholder="Digite o JSON com variáveis {{deal.id}}"
                                                    />
                                                </>
                                            )}
                                        </CardContent>
                                    </Card>
                                </>
                            )}
                        </div>
                    </div>
                </TabsContent>

                {/* --- LOGS TAB --- */}
                {initialId !== 'new' && currentId && (
                    <TabsContent value="logs">
                        <IntegrationLogs integrationId={currentId} />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
