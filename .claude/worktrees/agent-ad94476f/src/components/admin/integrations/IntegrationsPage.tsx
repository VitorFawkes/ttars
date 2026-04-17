import { useState } from 'react';

import { IntegrationList } from './IntegrationList';
import { IntegrationBuilder } from './IntegrationBuilder';
import { IntegrationFieldExplorer } from './IntegrationFieldExplorer';
import { IntegrationSettings } from './IntegrationSettings';
import { OutboundLogsTab } from './OutboundLogsTab';
import { IntegrationLogs } from './IntegrationLogs';

// Unified components
import { IntegrationOverviewTab } from './IntegrationOverviewTab';
import { UnifiedMappingTab } from './UnifiedMappingTab';
import { UnifiedRulesTab } from './UnifiedRulesTab';

import type { IntegrationType } from '@/lib/integrations';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from '@/components/ui/Button';
import {
    ArrowLeft,
    ArrowDownLeft,
    ArrowUpRight,
    LayoutDashboard,
    Settings,
    Zap,
    Map
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const AC_INTEGRATION_ID = 'a2141b92-561f-4514-92b4-9412a068d236';

export function IntegrationsPage() {
    const [view, setView] = useState<'list' | 'builder' | 'explorer' | 'active_campaign'>('list');

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<IntegrationType>('input');

    const handleSelect = (id: string | null, type?: IntegrationType) => {
        if (id === 'new') {
            setSelectedId('new');
            if (type) setSelectedType(type);
            setView('builder');
        } else if (id === 'active_campaign') {
            setView('active_campaign');
        } else if (id) {
            setSelectedId(id);
            setView('builder');
        }
    };

    // --- Active Campaign Dashboard (Redesigned) ---
    if (view === 'active_campaign') {
        return (
            <div className="h-full p-6 space-y-6 pb-20 overflow-y-auto">
                {/* Header */}
                <div className="flex items-center gap-4 border-b border-slate-200 pb-4">
                    <Button variant="ghost" size="icon" onClick={() => setView('list')}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                            Integração ActiveCampaign
                        </h1>
                        <p className="text-slate-500 text-sm">
                            Gerencie a sincronização bidirecional de deals em uma única central de controle.
                        </p>
                    </div>
                </div>

                {/* Main Tabs - Simplified to 4 + Settings */}
                <Tabs defaultValue="overview" className="space-y-6">
                    <TabsList className="bg-slate-100 p-1 rounded-lg">
                        <TabsTrigger
                            value="overview"
                            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                        >
                            <LayoutDashboard className="w-4 h-4" />
                            Visão Geral
                        </TabsTrigger>
                        <TabsTrigger
                            value="mapping"
                            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                        >
                            <Map className="w-4 h-4" />
                            Mapeamentos
                        </TabsTrigger>
                        <TabsTrigger
                            value="rules"
                            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                        >
                            <Zap className="w-4 h-4" />
                            Regras
                        </TabsTrigger>
                        <TabsTrigger
                            value="inbound"
                            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                        >
                            <ArrowDownLeft className="w-4 h-4" />
                            Entrada (AC → CRM)
                        </TabsTrigger>
                        <TabsTrigger
                            value="outbound"
                            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                        >
                            <ArrowUpRight className="w-4 h-4" />
                            Saída (CRM → AC)
                        </TabsTrigger>
                        <TabsTrigger
                            value="settings"
                            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2"
                        >
                            <Settings className="w-4 h-4" />
                            Configurações
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Overview (Dashboard + Sync + Recent Events) */}
                    <TabsContent value="overview" className="space-y-6">
                        <IntegrationOverviewTab integrationId={AC_INTEGRATION_ID} />
                    </TabsContent>

                    {/* Tab 2: Unified Mapping (Structure + Fields) */}
                    <TabsContent value="mapping">
                        <UnifiedMappingTab integrationId={AC_INTEGRATION_ID} />
                    </TabsContent>

                    {/* Tab 3: Unified Rules (Inbound + Outbound in one place) */}
                    <TabsContent value="rules">
                        <UnifiedRulesTab integrationId={AC_INTEGRATION_ID} />
                    </TabsContent>

                    {/* Tab 4: Inbound Events (AC → CRM) */}
                    <TabsContent value="inbound">
                        <IntegrationLogs mode="inbox" />
                    </TabsContent>

                    {/* Tab 5: Outbound Queue (CRM → AC) */}
                    <TabsContent value="outbound">
                        <OutboundLogsTab integrationId={AC_INTEGRATION_ID} />
                    </TabsContent>

                    {/* Tab 6: Settings */}
                    <TabsContent value="settings">
                        <IntegrationSettings />
                    </TabsContent>
                </Tabs>
            </div>
        );
    }

    // --- Main List View ---
    return (
        <div className="h-full p-6 space-y-6">
            {view === 'builder' && selectedId ? (
                <IntegrationBuilder
                    integrationId={selectedId}
                    initialType={selectedType}
                    onBack={() => {
                        setView('list');
                        setSelectedId(null);
                    }}
                    onDraftCreated={(newId) => {
                        setSelectedId(newId);
                    }}
                />
            ) : view === 'explorer' ? (
                <IntegrationFieldExplorer onBack={() => setView('list')} />
            ) : (
                <div className="space-y-6">
                    {/* System Integrations Section */}
                    <div>
                        <h2 className="text-lg font-semibold mb-4 text-slate-900">Integrações de Sistema</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <Card
                                className="hover:bg-blue-50/50 transition-all duration-200 cursor-pointer border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 shadow-sm hover:shadow-md"
                                onClick={() => handleSelect('active_campaign')}
                            >
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-slate-900">
                                        <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                                            <Zap className="w-4 h-4 text-white" />
                                        </div>
                                        ActiveCampaign
                                    </CardTitle>
                                    <CardDescription className="text-slate-500">
                                        Sincronização oficial de Deals e Contatos.
                                        <br />
                                        <span className="text-xs text-blue-600 font-medium">Pipeline TRIPS • Bidirecional</span>
                                    </CardDescription>
                                </CardHeader>
                            </Card>
                        </div>
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                        <h2 className="text-lg font-semibold mb-4 text-slate-900">Webhooks Genéricos</h2>
                        <IntegrationList
                            onSelect={handleSelect}
                            onExploreFields={() => setView('explorer')}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
