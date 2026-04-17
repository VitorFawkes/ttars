import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { toast } from 'sonner';
import { readFileText } from '@/lib/readFileText';
import { Plus, RefreshCw, Trash2, Database, Loader2, Search, Upload, FileSpreadsheet, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ACField {
    id: string;
    external_id: string;
    external_name: string;
    parent_external_id: string | null;
    metadata: Record<string, unknown>;
}

interface ACPipeline {
    external_id: string;
    external_name: string;
}

interface NewFieldRow {
    id: string;
    name: string;
    code: string;
    perstag: string;
    pipeline_id: string;
}

interface ACFieldManagerProps {
    integrationId: string;
}

export function ACFieldManager({ integrationId }: ACFieldManagerProps) {
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [syncingAC, setSyncingAC] = useState(false);
    const [showBulkAdd, setShowBulkAdd] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPipeline, setFilterPipeline] = useState<string>('');
    const [savingBulk, setSavingBulk] = useState(false);

    // Multi-row manual entry state
    const [bulkRows, setBulkRows] = useState<NewFieldRow[]>([
        { id: crypto.randomUUID(), name: '', code: '', perstag: '', pipeline_id: '' }
    ]);

    // Fetch AC fields
    const { data: acFields = [], isLoading: loadingFields } = useQuery({
        queryKey: ['ac-fields', integrationId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_catalog')
                .select('id, external_id, external_name, parent_external_id, metadata')
                .eq('integration_id', integrationId)
                .eq('entity_type', 'field')
                .order('external_name');
            if (error) throw error;
            return data as ACField[];
        }
    });

    // Fetch AC pipelines
    const { data: acPipelines = [] } = useQuery({
        queryKey: ['ac-pipelines', integrationId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_catalog')
                .select('external_id, external_name')
                .eq('integration_id', integrationId)
                .eq('entity_type', 'pipeline')
                .order('external_name');
            if (error) throw error;
            return data as ACPipeline[];
        }
    });

    // Bulk sync from AC API
    const handleBulkSync = async () => {
        setSyncingAC(true);
        try {
            const { data, error } = await supabase.functions.invoke('integration-sync-catalog', {
                body: { integration_id: integrationId }
            });
            if (error) throw error;

            toast.success(`Sincronizado: ${data.fields_synced || 0} campos, ${data.pipelines_scanned || 0} pipelines`);
            queryClient.invalidateQueries({ queryKey: ['ac-fields'] });
            queryClient.invalidateQueries({ queryKey: ['ac-pipelines'] });
        } catch (e: any) {
            toast.error(`Erro ao sincronizar: ${e.message}`);
        } finally {
            setSyncingAC(false);
        }
    };

    // Add row to bulk entry
    const addBulkRow = () => {
        setBulkRows(prev => [...prev, {
            id: crypto.randomUUID(),
            name: '',
            code: '',
            perstag: '',
            pipeline_id: ''
        }]);
    };

    // Remove row from bulk entry
    const removeBulkRow = (id: string) => {
        if (bulkRows.length > 1) {
            setBulkRows(prev => prev.filter(r => r.id !== id));
        }
    };

    // Update bulk row
    const updateBulkRow = (id: string, field: keyof NewFieldRow, value: string) => {
        setBulkRows(prev => prev.map(r =>
            r.id === id ? { ...r, [field]: value } : r
        ));
    };

    // Save all bulk rows
    const saveBulkRows = async () => {
        const validRows = bulkRows.filter(r => r.name && r.code);
        if (validRows.length === 0) {
            toast.error('Preencha pelo menos um campo com Nome e Código');
            return;
        }

        setSavingBulk(true);
        try {
            const fieldsToInsert = validRows.map(row => ({
                integration_id: integrationId,
                entity_type: 'field',
                external_id: row.code,
                external_name: row.name,
                parent_external_id: row.pipeline_id || '',
                metadata: {
                    perstag: row.perstag || row.code.toUpperCase(),
                    source: 'manual',
                    pipeline_id: row.pipeline_id || null
                }
            }));

            const { error } = await supabase
                .from('integration_catalog')
                .upsert(fieldsToInsert, {
                    onConflict: 'integration_id,entity_type,external_id,parent_external_id'
                });

            if (error) throw error;

            toast.success(`${validRows.length} campos adicionados com sucesso`);
            queryClient.invalidateQueries({ queryKey: ['ac-fields'] });
            setShowBulkAdd(false);
            setBulkRows([{ id: crypto.randomUUID(), name: '', code: '', perstag: '', pipeline_id: '' }]);
        } catch (e: any) {
            toast.error(`Erro: ${e.message}`);
        } finally {
            setSavingBulk(false);
        }
    };

    // Handle CSV upload
    const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await readFileText(file);
            const lines = text.split('\n').filter(line => line.trim());

            // Skip header if it looks like a header
            const startIndex = lines[0].toLowerCase().includes('nome') ||
                lines[0].toLowerCase().includes('name') ||
                lines[0].toLowerCase().includes('code') ? 1 : 0;

            const parsedRows: NewFieldRow[] = [];

            for (let i = startIndex; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
                if (cols.length >= 2 && cols[0] && cols[1]) {
                    parsedRows.push({
                        id: crypto.randomUUID(),
                        name: cols[0],        // Column 1: Nome
                        code: cols[1],        // Column 2: Código
                        perstag: cols[2] || '', // Column 3: PERSTAG (optional)
                        pipeline_id: cols[3] || '' // Column 4: Pipeline ID (optional)
                    });
                }
            }

            if (parsedRows.length === 0) {
                toast.error('Nenhum campo válido encontrado no CSV. Formato: nome,codigo,perstag,pipeline_id');
                return;
            }

            setBulkRows(parsedRows);
            setShowBulkAdd(true);
            toast.success(`${parsedRows.length} campos carregados do CSV. Revise e clique em "Salvar Todos".`);
        } catch (e: any) {
            toast.error(`Erro ao ler CSV: ${e.message}`);
        }

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Delete field mutation
    const deleteFieldMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('integration_catalog')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Campo removido');
            queryClient.invalidateQueries({ queryKey: ['ac-fields'] });
        },
        onError: (e) => toast.error(`Erro: ${e.message}`)
    });

    // Filter fields
    const filteredFields = acFields.filter(field => {
        const matchesSearch = !searchTerm ||
            field.external_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            field.external_id?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesPipeline = !filterPipeline ||
            field.parent_external_id === filterPipeline ||
            (field.metadata as any)?.pipeline_id === filterPipeline;

        return matchesSearch && matchesPipeline;
    });

    // Get pipeline name helper
    const getPipelineName = (pipelineId: string | null) => {
        if (!pipelineId) return 'Global';
        const pipeline = acPipelines.find(p => p.external_id === pipelineId);
        return pipeline?.external_name || pipelineId;
    };

    // Count valid rows
    const validRowsCount = bulkRows.filter(r => r.name && r.code).length;

    return (
        <div className="space-y-6">
            {/* Hidden file input for CSV */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleCSVUpload}
                className="hidden"
            />

            {/* Header Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="w-5 h-5" />
                                Campos do ActiveCampaign
                            </CardTitle>
                            <CardDescription>
                                Cadastre os campos customizados do ActiveCampaign para usar no mapeamento de sincronização.
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={handleBulkSync}
                                disabled={syncingAC}
                                title="Busca automaticamente os campos customizados da sua conta do AC via API"
                            >
                                {syncingAC ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                )}
                                Buscar do AC
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                                title="Importar campos de um arquivo CSV"
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                Importar CSV
                            </Button>
                            <Button
                                onClick={() => setShowBulkAdd(true)}
                                title="Adicionar campos manualmente"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Adicionar
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Bulk Add Card */}
            {showBulkAdd && (
                <Card className="border-2 border-primary/20 bg-primary/5">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <FileSpreadsheet className="w-5 h-5" />
                                    Adicionar Campos em Lote
                                </CardTitle>
                                <CardDescription>
                                    Adicione múltiplos campos de uma vez. Preencha as linhas e clique em "Salvar Todos".
                                </CardDescription>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowBulkAdd(false)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {/* Table header */}
                        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_40px] gap-2 mb-2 text-xs font-medium text-muted-foreground">
                            <div>Nome do Campo *</div>
                            <div>Código/ID *</div>
                            <div>PERSTAG</div>
                            <div>Pipeline</div>
                            <div></div>
                        </div>

                        {/* Rows */}
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {bulkRows.map((row) => (
                                <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_40px] gap-2 items-center">
                                    <Input
                                        value={row.name}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            updateBulkRow(row.id, 'name', e.target.value)}
                                        placeholder="Ex: Data Viagem"
                                        className="h-9 text-sm"
                                    />
                                    <Input
                                        value={row.code}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            updateBulkRow(row.id, 'code', e.target.value)}
                                        placeholder="Ex: 42"
                                        className="h-9 text-sm"
                                    />
                                    <Input
                                        value={row.perstag}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            updateBulkRow(row.id, 'perstag', e.target.value)}
                                        placeholder="DATA_VIAGEM"
                                        className="h-9 text-sm"
                                    />
                                    <Select
                                        value={row.pipeline_id}
                                        onChange={(val) => updateBulkRow(row.id, 'pipeline_id', val)}
                                        options={[
                                            { value: '', label: 'Global' },
                                            ...acPipelines.map(p => ({
                                                value: p.external_id,
                                                label: p.external_name
                                            }))
                                        ]}
                                        placeholder="Pipeline..."
                                        className="h-9 text-sm"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 text-muted-foreground hover:text-red-500"
                                        onClick={() => removeBulkRow(row.id)}
                                        disabled={bulkRows.length === 1}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                            <Button variant="outline" size="sm" onClick={addBulkRow}>
                                <Plus className="w-4 h-4 mr-1" />
                                Adicionar Linha
                            </Button>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-muted-foreground">
                                    {validRowsCount} campo{validRowsCount !== 1 ? 's' : ''} válido{validRowsCount !== 1 ? 's' : ''}
                                </span>
                                <Button
                                    onClick={saveBulkRows}
                                    disabled={savingBulk || validRowsCount === 0}
                                >
                                    {savingBulk && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Salvar Todos
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Filters */}
            <Card>
                <CardContent className="py-4">
                    <div className="flex gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                value={searchTerm}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                                placeholder="Buscar por nome ou código..."
                                className="pl-10"
                            />
                        </div>
                        <div className="w-64">
                            <Select
                                value={filterPipeline}
                                onChange={setFilterPipeline}
                                options={[
                                    { value: '', label: 'Todos os Pipelines' },
                                    ...acPipelines.map(p => ({
                                        value: p.external_id,
                                        label: p.external_name
                                    }))
                                ]}
                                placeholder="Filtrar por pipeline..."
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Fields List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                            Campos Cadastrados
                        </CardTitle>
                        <Badge variant="outline">
                            {filteredFields.length} de {acFields.length} campos
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    {loadingFields ? (
                        <div className="flex items-center justify-center h-32">
                            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : acFields.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Database className="w-12 h-12 mx-auto mb-4 opacity-30" />
                            <h3 className="font-medium mb-1">Nenhum campo cadastrado</h3>
                            <p className="text-sm">
                                Use os botões acima para adicionar campos.
                            </p>
                        </div>
                    ) : filteredFields.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <p>Nenhum campo corresponde aos filtros.</p>
                        </div>
                    ) : (
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                                            Nome
                                        </th>
                                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                                            Código
                                        </th>
                                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                                            PERSTAG
                                        </th>
                                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                                            Pipeline
                                        </th>
                                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                                            Origem
                                        </th>
                                        <th className="w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredFields.map(field => {
                                        const metadata = field.metadata as any;
                                        const isManual = metadata?.source === 'manual';
                                        const pipelineId = field.parent_external_id || metadata?.pipeline_id;

                                        return (
                                            <tr key={field.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className="font-medium text-sm">
                                                        {field.external_name}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <code className="text-xs bg-muted px-2 py-1 rounded">
                                                        {field.external_id}
                                                    </code>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-xs text-muted-foreground">
                                                        {metadata?.perstag || '-'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Badge variant="outline" className="text-xs">
                                                        {getPipelineName(pipelineId)}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Badge
                                                        variant={isManual ? "secondary" : "default"}
                                                        className={cn(
                                                            "text-xs",
                                                            !isManual && "bg-blue-600"
                                                        )}
                                                    >
                                                        {isManual ? 'Manual' : 'API'}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-500/10"
                                                        onClick={() => {
                                                            if (confirm('Remover este campo?')) {
                                                                deleteFieldMutation.mutate(field.id);
                                                            }
                                                        }}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Help */}
            <Card className="bg-blue-50/50 border-blue-200">
                <CardContent className="py-4">
                    <h4 className="font-medium text-sm text-blue-700 mb-3">
                        🔧 Como usar
                    </h4>
                    <div className="grid grid-cols-3 gap-4 text-xs text-blue-600/80">
                        <div>
                            <strong className="block mb-1">Buscar do AC</strong>
                            Conecta na API do ActiveCampaign e importa automaticamente todos os campos customizados de Deals.
                        </div>
                        <div>
                            <strong className="block mb-1">Importar CSV</strong>
                            Upload de arquivo CSV com formato:<br />
                            <code className="text-[10px] bg-blue-100 px-1 rounded">nome,codigo,perstag,pipeline_id</code>
                        </div>
                        <div>
                            <strong className="block mb-1">Adicionar</strong>
                            Adicione manualmente um ou mais campos de uma vez. Preencha as linhas e clique em "Salvar Todos".
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
