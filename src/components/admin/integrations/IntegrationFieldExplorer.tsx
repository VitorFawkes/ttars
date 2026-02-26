import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Search, Copy, Database, Layers, Code, BookOpen, Printer } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CORE_FIELDS, SECTIONS_MAP, type DocField } from '@/lib/integration-docs';

interface SystemField {
    id: string;
    key: string;
    label: string;
    type: string;
    section: string;
    active: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic field options
    options?: any;
}

export function IntegrationFieldExplorer({ onBack }: { onBack: () => void }) {
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'explorer' | 'docs'>('explorer');

    const { data: systemFields, isLoading } = useQuery({
        queryKey: ['system-fields-explorer'],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types
            const { data, error } = await (supabase as any)
                .from('system_fields')
                .select('*')
                .order('section')
                .order('label');

            if (error) throw error;
            return data as unknown as SystemField[];
        }
    });

    // Merge Core Fields + System Fields
    const allFields = useMemo(() => {
        const dynamicFields: DocField[] = (systemFields || []).map(f => ({
            key: f.key,
            label: f.label,
            type: f.type,
            section: f.section,
            description: `Campo personalizado do sistema (${f.section}).`,
            example: f.options ? `Um dos valores: ${JSON.stringify(f.options).slice(0, 20)}...` : 'Texto livre',
            required: false
        }));
        return [...CORE_FIELDS, ...dynamicFields];
    }, [systemFields]);

    // Group fields by section
    const groupedFields = useMemo(() => {
        return allFields.reduce((acc, field) => {
            const sectionName = SECTIONS_MAP[field.section] || field.section;
            if (!acc[sectionName]) acc[sectionName] = [];
            acc[sectionName].push(field);
            return acc;
        }, {} as Record<string, DocField[]>);
    }, [allFields]);

    const filteredSections = useMemo(() => {
        return Object.entries(groupedFields).reduce((acc, [section, sectionFields]) => {
            const filtered = sectionFields.filter(f =>
                f.label.toLowerCase().includes(search.toLowerCase()) ||
                f.key.toLowerCase().includes(search.toLowerCase()) ||
                section.toLowerCase().includes(search.toLowerCase())
            );
            if (filtered.length > 0) {
                acc[section] = filtered;
            }
            return acc;
        }, {} as Record<string, DocField[]>);
    }, [groupedFields, search]);

    const { data: kanbanStages } = useQuery({
        queryKey: ['kanban-stages-docs'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipeline_stages')
                .select('id, nome, pipeline_id, ordem, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)')
                .eq('ativo', true)
                .order('ordem');

            if (error) throw error;
            // Sort by phase order_index then stage ordem
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return ((data || []) as any[]).sort((a, b) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            }) as { id: string, nome: string, pipeline_id: string }[];
        }
    });

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Código copiado!');
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between print:hidden">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground">
                        <Database className="w-6 h-6 text-primary" />
                        Central de Integração
                    </h2>
                    <p className="text-muted-foreground">
                        Documentação completa e referência de campos para desenvolvedores.
                    </p>
                </div>
                <div className="flex gap-2">
                    {activeTab === 'docs' && (
                        <Button variant="outline" onClick={handlePrint} className="border-border text-foreground hover:bg-muted hover:text-foreground">
                            <Printer className="w-4 h-4 mr-2" />
                            Imprimir / PDF
                        </Button>
                    )}
                    <Button variant="outline" onClick={onBack} className="border-border text-foreground hover:bg-muted hover:text-foreground">
                        Voltar
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'explorer' | 'docs')} className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between border-b border-border pb-2 mb-4 print:hidden">
                    <TabsList className="bg-card border border-border">
                        <TabsTrigger value="explorer" className="gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                            <Search className="w-4 h-4" />
                            Explorador Rápido
                        </TabsTrigger>
                        <TabsTrigger value="docs" className="gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                            <BookOpen className="w-4 h-4" />
                            Documentação Técnica
                        </TabsTrigger>
                    </TabsList>

                    {activeTab === 'explorer' && (
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar campos..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-10 h-9 bg-card border-border text-foreground placeholder:text-muted-foreground focus:bg-muted/50"
                            />
                        </div>
                    )}
                </div>

                {/* --- EXPLORER TAB --- */}
                <TabsContent value="explorer" className="flex-1 min-h-0">
                    <ScrollArea className="h-full pr-4">
                        {isLoading ? (
                            <div className="text-center py-10 text-slate-400">Carregando campos...</div>
                        ) : (
                            <div className="space-y-8 pb-10">
                                {Object.entries(filteredSections).map(([section, sectionFields]) => (
                                    <div key={section} className="space-y-3">
                                        <div className="flex items-center gap-2 pb-2 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10 py-2">
                                            <Layers className="w-4 h-4 text-primary" />
                                            <h3 className="text-lg font-semibold text-foreground">
                                                {section}
                                            </h3>
                                            <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                                                {sectionFields.length}
                                            </Badge>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {sectionFields.map((field) => (
                                                <Card key={field.key} className="bg-card border-border shadow-none hover:bg-muted/50 transition-all group">
                                                    <CardContent className="p-4 space-y-3">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <h4 className="font-medium text-sm text-foreground">{field.label}</h4>
                                                                <div className="flex items-center gap-1 mt-1">
                                                                    <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-primary font-mono border border-border">
                                                                        {field.key}
                                                                    </code>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                                                        onClick={() => copyToClipboard(field.key)}
                                                                    >
                                                                        <Copy className="w-3 h-3" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                            <Badge variant="outline" className="text-[10px] h-5 border-border text-muted-foreground">
                                                                {field.type}
                                                            </Badge>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </TabsContent>

                {/* --- DOCS TAB --- */}
                <TabsContent value="docs" className="flex-1 min-h-0 bg-card rounded-lg border border-border shadow-none overflow-hidden backdrop-blur-xl">
                    <ScrollArea className="h-full">
                        <div className="p-8 max-w-4xl mx-auto space-y-10 print:p-0 print:shadow-none print:border-none">

                            {/* Docs Header */}
                            <div className="space-y-4 border-b border-border pb-8">
                                <h1 className="text-4xl font-bold text-foreground">Documentação de Integração</h1>
                                <p className="text-lg text-muted-foreground leading-relaxed">
                                    Este guia descreve a estrutura de dados do CRM para desenvolvedores e integradores.
                                    Utilize as chaves abaixo para mapear campos em Webhooks de Entrada (Typeform, WordPress)
                                    ou para configurar Disparos de Saída (Zapier, n8n).
                                </p>
                                <div className="flex gap-4 pt-2">
                                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg flex-1">
                                        <h3 className="font-semibold text-blue-600 mb-1 flex items-center gap-2">
                                            <Code className="w-4 h-4" /> Formato JSON
                                        </h3>
                                        <p className="text-sm text-blue-700">
                                            Todos os payloads devem ser enviados/recebidos em formato JSON plano ou aninhado.
                                            O sistema aceita notação de ponto (ex: <code>deal.titulo</code>) para mapeamento.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Kanban Stages Section */}
                            <div className="break-inside-avoid">
                                <h3 className="text-2xl font-bold text-foreground mb-4 pb-2 border-b border-border">
                                    Pipeline & Estágios (Kanban)
                                </h3>
                                <p className="text-muted-foreground mb-4">
                                    Utilize os IDs abaixo para mover cards entre as etapas do funil via API.
                                </p>
                                <div className="border border-border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border">
                                            <tr>
                                                <th className="px-4 py-3 w-1/3">Nome da Etapa</th>
                                                <th className="px-4 py-3 w-1/3">ID da Etapa (Código)</th>
                                                <th className="px-4 py-3">Pipeline</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border bg-transparent">
                                            {kanbanStages?.map((stage) => (
                                                <tr key={stage.id} className="hover:bg-muted/50">
                                                    <td className="px-4 py-3 font-medium text-foreground">
                                                        {stage.nome}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <code className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded font-mono border border-primary/20 flex items-center justify-between w-fit gap-2">
                                                            {stage.id}
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-4 w-4 text-primary hover:text-primary/80 p-0"
                                                                onClick={() => copyToClipboard(stage.id)}
                                                            >
                                                                <Copy className="w-3 h-3" />
                                                            </Button>
                                                        </code>
                                                    </td>
                                                    <td className="px-4 py-3 text-muted-foreground text-xs">
                                                        {stage.pipeline_id}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Fields Table */}
                            <div className="space-y-8">
                                {Object.entries(groupedFields).map(([section, sectionFields]) => (
                                    <div key={section} className="break-inside-avoid">
                                        <h3 className="text-2xl font-bold text-foreground mb-4 pb-2 border-b border-border">
                                            {section}
                                        </h3>
                                        <div className="border border-border rounded-lg overflow-hidden">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border">
                                                    <tr>
                                                        <th className="px-4 py-3 w-1/4">Campo / Chave</th>
                                                        <th className="px-4 py-3 w-1/6">Tipo</th>
                                                        <th className="px-4 py-3">Descrição & Exemplo</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border bg-transparent">
                                                    {sectionFields.map((field) => (
                                                        <tr key={field.key} className="hover:bg-muted/50">
                                                            <td className="px-4 py-3 align-top">
                                                                <div className="font-medium text-foreground">{field.label}</div>
                                                                <code className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded mt-1 inline-block font-mono border border-primary/20">
                                                                    {field.key}
                                                                </code>
                                                                {field.required && (
                                                                    <span className="ml-2 text-[10px] font-bold text-red-500 uppercase tracking-wide">Obrigatório</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 align-top">
                                                                <Badge variant="outline" className="font-mono text-xs text-muted-foreground border-border">
                                                                    {field.type}
                                                                </Badge>
                                                            </td>
                                                            <td className="px-4 py-3 align-top text-muted-foreground">
                                                                <p className="mb-1">{field.description}</p>
                                                                <div className="text-xs text-muted-foreground font-mono bg-muted/50 p-1.5 rounded border border-border inline-block">
                                                                    Ex: {field.example}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-10 border-t border-border text-center text-sm text-muted-foreground">
                                <p>Gerado automaticamente pelo WelcomeCRM • {new Date().toLocaleDateString()}</p>
                            </div>
                        </div>
                    </ScrollArea>
                </TabsContent>
            </Tabs>
        </div>
    );
}
