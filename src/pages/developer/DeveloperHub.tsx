import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { ApiKeysManagement } from '@/components/admin/integrations/ApiKeysManagement';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import {
    Code,
    Key,
    Webhook,
    BookOpen,
    Copy,
    ExternalLink,
    BarChart3,
    Terminal
} from 'lucide-react';
import { toast } from 'sonner';
import { useApiKeyStats } from '@/hooks/useApiKeys';

export default function DeveloperHub() {
    const [activeTab, setActiveTab] = useState('overview');
    const { data: stats } = useApiKeyStats();

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`;
    const specUrl = `${apiUrl}/openapi.json`;

    const copyUrl = (url: string) => {
        navigator.clipboard.writeText(url);
        toast.success('URL copiada!');
    };

    return (
        <div className="h-full flex flex-col space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <Terminal className="w-6 h-6 text-primary" />
                        Developer Platform
                    </h2>
                    <p className="text-muted-foreground">
                        Central unificada para chaves de API, documentação e webhooks.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" asChild className="gap-2">
                        <a href={specUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                            Spec JSON
                        </a>
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto space-x-6">
                    <TabsTrigger
                        value="overview"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
                    >
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Visão Geral
                        </div>
                    </TabsTrigger>
                    <TabsTrigger
                        value="keys"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
                    >
                        <div className="flex items-center gap-2">
                            <Key className="w-4 h-4" />
                            Chaves de API
                        </div>
                    </TabsTrigger>
                    <TabsTrigger
                        value="docs"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
                    >
                        <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            Documentação
                        </div>
                    </TabsTrigger>
                    <TabsTrigger
                        value="webhooks"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
                    >
                        <div className="flex items-center gap-2">
                            <Webhook className="w-4 h-4" />
                            Webhooks
                        </div>
                    </TabsTrigger>
                </TabsList>

                <div className="flex-1 mt-6">
                    {/* OVERVIEW TAB */}
                    <TabsContent value="overview" className="space-y-6 m-0">
                        {/* Quick Start */}
                        <Card className="bg-slate-950 border-slate-800 text-slate-50">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Code className="w-5 h-5 text-blue-400" />
                                    Quick Start
                                </CardTitle>
                                <CardDescription className="text-slate-400">
                                    Faça sua primeira requisição em segundos.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-mono text-slate-400 uppercase">Base URL</label>
                                    <div className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-800">
                                        <code className="flex-1 font-mono text-sm text-blue-300">{apiUrl}</code>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => copyUrl(apiUrl)}>
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-mono text-slate-400 uppercase">Exemplo (cURL)</label>
                                    <div className="bg-slate-900 p-4 rounded border border-slate-800 font-mono text-sm overflow-x-auto">
                                        <span className="text-purple-400">curl</span> <span className="text-green-400">-X</span> GET \<br />
                                        &nbsp;&nbsp;<span className="text-blue-300">"{apiUrl}/health"</span> \<br />
                                        &nbsp;&nbsp;<span className="text-green-400">-H</span> <span className="text-yellow-300">"X-API-Key: SUA_CHAVE_AQUI"</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Stats Summary */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Total de Requisições (24h)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{stats?.totalRequests || 0}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Sucesso (2xx)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-green-600">{stats?.successfulRequests || 0}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Erros (4xx/5xx)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-red-600">{stats?.failedRequests || 0}</div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* KEYS TAB */}
                    <TabsContent value="keys" className="h-full m-0">
                        <div className="h-full border rounded-lg bg-card p-4">
                            {/* We pass a dummy onBack since we are inside tabs now */}
                            <ApiKeysManagement hideHeader={true} />
                        </div>
                    </TabsContent>

                    {/* DOCS TAB */}
                    <TabsContent value="docs" className="h-full m-0">
                        <div className="rounded-lg border bg-white overflow-hidden shadow-sm">
                            <SwaggerUI
                                url={specUrl}
                                docExpansion="list"
                                persistAuthorization={true}
                            />
                        </div>
                    </TabsContent>

                    {/* WEBHOOKS TAB */}
                    <TabsContent value="webhooks" className="m-0">
                        <Card className="border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                                <div className="p-4 rounded-full bg-muted">
                                    <Webhook className="w-8 h-8 text-muted-foreground" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold">Webhooks em Breve</h3>
                                    <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                                        Em breve você poderá configurar webhooks para receber notificações de eventos do CRM em tempo real.
                                    </p>
                                </div>
                                <Button variant="outline" disabled>
                                    Notifique-me quando lançar
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
