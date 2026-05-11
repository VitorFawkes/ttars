import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/Badge';
import { ArrowDownLeft, ArrowUpRight, Zap, Info } from 'lucide-react';
import { InboundTriggerRulesTab } from './InboundTriggerRulesTab';
import { OutboundTriggerRulesTab } from './OutboundTriggerRulesTab';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface UnifiedRulesTabProps {
    integrationId: string;
}

interface RuleStats {
    inbound: { active: number; total: number };
    outbound: { active: number; total: number };
}

export function UnifiedRulesTab({ integrationId }: UnifiedRulesTabProps) {
    const [activeTab, setActiveTab] = useState<'inbound' | 'outbound'>('inbound');

    // Fetch rule counts for visual feedback
    const { data: ruleStats } = useQuery({
        queryKey: ['rule-stats', integrationId],
        queryFn: async (): Promise<RuleStats> => {
            const [inboundRes, outboundRes] = await Promise.all([
                supabase
                    .from('integration_inbound_triggers')
                    .select('id, is_active')
                    .eq('integration_id', integrationId),
                supabase
                    .from('integration_outbound_triggers')
                    .select('id, is_active')
                    .eq('integration_id', integrationId)
            ]);

            return {
                inbound: {
                    total: inboundRes.data?.length || 0,
                    active: inboundRes.data?.filter(r => r.is_active).length || 0
                },
                outbound: {
                    total: outboundRes.data?.length || 0,
                    active: outboundRes.data?.filter(r => r.is_active).length || 0
                }
            };
        }
    });

    return (
        <div className="space-y-6">
            {/* Header explicativo */}
            <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-slate-800">
                        <Zap className="w-5 h-5 text-blue-600" />
                        Central de Regras de Sincronização
                    </CardTitle>
                    <CardDescription className="text-slate-600">
                        Configure quando e como os dados devem ser sincronizados entre ActiveCampaign e WelcomeCRM.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="flex items-start gap-3 p-3 bg-white/60 rounded-lg border border-blue-100">
                        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <div className="text-sm text-slate-600">
                            <strong>Dica:</strong> Campos vazios significam "qualquer valor".
                            Por exemplo, deixar "Pipeline" vazio significa que a regra se aplica a todos os pipelines.
                            Use isso para criar regras amplas ou específicas conforme necessário.
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tabs principais */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'inbound' | 'outbound')} className="space-y-4">
                <TabsList className="grid w-full grid-cols-2 h-auto p-1 bg-slate-100 rounded-lg">
                    {/* Inbound Tab */}
                    <TabsTrigger
                        value="inbound"
                        className="flex items-center gap-3 p-4 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md transition-all"
                    >
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-100">
                            <ArrowDownLeft className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="text-left">
                            <div className="font-semibold text-slate-900">Entrada</div>
                            <div className="text-xs text-slate-500">ActiveCampaign → CRM</div>
                        </div>
                        <Badge
                            variant="secondary"
                            className={
                                ruleStats?.inbound.active
                                    ? 'bg-green-100 text-green-700 ml-auto'
                                    : 'bg-slate-200 text-slate-500 ml-auto'
                            }
                        >
                            {ruleStats?.inbound.active || 0} ativas
                        </Badge>
                    </TabsTrigger>

                    {/* Outbound Tab */}
                    <TabsTrigger
                        value="outbound"
                        className="flex items-center gap-3 p-4 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md transition-all"
                    >
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100">
                            <ArrowUpRight className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="text-left">
                            <div className="font-semibold text-slate-900">Saída</div>
                            <div className="text-xs text-slate-500">CRM → ActiveCampaign</div>
                        </div>
                        <Badge
                            variant="secondary"
                            className={
                                ruleStats?.outbound.active
                                    ? 'bg-blue-100 text-blue-700 ml-auto'
                                    : 'bg-slate-200 text-slate-500 ml-auto'
                            }
                        >
                            {ruleStats?.outbound.active || 0} ativas
                        </Badge>
                    </TabsTrigger>
                </TabsList>

                {/* Inbound Content */}
                <TabsContent value="inbound" className="mt-6">
                    <InboundTriggerRulesTab integrationId={integrationId} />
                </TabsContent>

                {/* Outbound Content */}
                <TabsContent value="outbound" className="mt-6">
                    <OutboundTriggerRulesTab integrationId={integrationId} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
