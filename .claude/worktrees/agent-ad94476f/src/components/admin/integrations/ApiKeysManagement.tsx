import { useState } from 'react';
import { useApiKeys, useCreateApiKey, useRevokeApiKey, useDeleteApiKey, useApiKeyLogs, type ApiKey, type ApiKeyWithPlainText } from '@/hooks/useApiKeys';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
    Key, Plus, Copy, Check, Trash2, Eye, EyeOff, Shield, Clock,
    Activity, AlertTriangle, RefreshCw, BarChart3, ArrowLeft
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
    onBack?: () => void;
    hideHeader?: boolean;
}

export function ApiKeysManagement({ onBack, hideHeader = false }: Props) {
    const { data: apiKeys, isLoading, refetch } = useApiKeys();
    const createKeyMutation = useCreateApiKey();
    const revokeKeyMutation = useRevokeApiKey();
    const deleteKeyMutation = useDeleteApiKey();

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showLogsModal, setShowLogsModal] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [newKeyResult, setNewKeyResult] = useState<ApiKeyWithPlainText | null>(null);
    const [copiedKey, setCopiedKey] = useState(false);

    // Create form state
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyRead, setNewKeyRead] = useState(true);
    const [newKeyWrite, setNewKeyWrite] = useState(true);

    const handleCreateKey = async () => {
        if (!newKeyName.trim()) {
            toast.error('Nome é obrigatório');
            return;
        }

        try {
            const result = await createKeyMutation.mutateAsync({
                name: newKeyName.trim(),
                permissions: { read: newKeyRead, write: newKeyWrite }
            });
            setNewKeyResult(result);
            setNewKeyName('');
            toast.success('Chave criada com sucesso!');
        } catch (error) {
            toast.error('Erro ao criar chave: ' + (error as Error).message);
        }
    };

    const handleCopyKey = (key: string) => {
        navigator.clipboard.writeText(key);
        setCopiedKey(true);
        toast.success('Chave copiada!');
        setTimeout(() => setCopiedKey(false), 2000);
    };

    const handleRevokeKey = async (keyId: string) => {
        try {
            await revokeKeyMutation.mutateAsync(keyId);
            toast.success('Chave revogada com sucesso');
        } catch (error) {
            toast.error('Erro ao revogar chave');
        }
    };

    const handleDeleteKey = async (keyId: string) => {
        try {
            await deleteKeyMutation.mutateAsync(keyId);
            setShowDeleteConfirm(null);
            toast.success('Chave excluída permanentemente');
        } catch (error) {
            toast.error('Erro ao excluir chave');
        }
    };

    const activeKeys = apiKeys?.filter(k => k.is_active) || [];
    const revokedKeys = apiKeys?.filter(k => !k.is_active) || [];

    return (
        <div className="h-full flex flex-col space-y-6">
            {/* Header */}
            {!hideHeader && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {onBack && (
                            <Button variant="ghost" size="icon" onClick={onBack}>
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        )}
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground">
                                <Key className="w-6 h-6 text-primary" />
                                Chaves de API
                            </h2>
                            <p className="text-muted-foreground">
                                Gerencie credenciais de acesso para integrações externas.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={() => refetch()}>
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                            <Plus className="w-4 h-4" />
                            Nova Chave
                        </Button>
                    </div>
                </div>
            )}

            {/* Embedded Header Actions (if header is hidden) */}
            {hideHeader && (
                <div className="flex justify-end gap-2 mb-4">
                    <Button variant="outline" size="icon" onClick={() => refetch()}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Nova Chave
                    </Button>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-card border-border">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-green-500/10">
                            <Shield className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground">{activeKeys.length}</p>
                            <p className="text-sm text-muted-foreground">Chaves Ativas</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-red-500/10">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground">{revokedKeys.length}</p>
                            <p className="text-sm text-muted-foreground">Revogadas</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-blue-500/10">
                            <BarChart3 className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground">
                                {apiKeys?.reduce((acc, k) => acc + k.request_count, 0) || 0}
                            </p>
                            <p className="text-sm text-muted-foreground">Total de Requisições</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Keys List */}
            <ScrollArea className="flex-1">
                <div className="space-y-4 pb-10">
                    {isLoading ? (
                        <div className="text-center py-10 text-muted-foreground">Carregando...</div>
                    ) : apiKeys?.length === 0 ? (
                        <Card className="bg-card border-border border-dashed">
                            <CardContent className="p-10 text-center">
                                <Key className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                                <h3 className="font-semibold text-foreground mb-1">Nenhuma chave criada</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Crie sua primeira chave de API para permitir integrações externas.
                                </p>
                                <Button onClick={() => setShowCreateModal(true)}>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Criar Primeira Chave
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            {/* Active Keys */}
                            {activeKeys.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-muted-foreground px-1">Chaves Ativas</h3>
                                    {activeKeys.map(key => (
                                        <ApiKeyCard
                                            key={key.id}
                                            apiKey={key}
                                            onRevoke={() => handleRevokeKey(key.id)}
                                            onViewLogs={() => setShowLogsModal(key.id)}
                                            onDelete={() => setShowDeleteConfirm(key.id)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Revoked Keys */}
                            {revokedKeys.length > 0 && (
                                <div className="space-y-3 mt-6">
                                    <h3 className="text-sm font-medium text-muted-foreground px-1">Chaves Revogadas</h3>
                                    {revokedKeys.map(key => (
                                        <ApiKeyCard
                                            key={key.id}
                                            apiKey={key}
                                            onRevoke={() => { }}
                                            onViewLogs={() => setShowLogsModal(key.id)}
                                            onDelete={() => setShowDeleteConfirm(key.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </ScrollArea>

            {/* Create Key Modal */}
            <Dialog open={showCreateModal} onOpenChange={(open) => {
                setShowCreateModal(open);
                if (!open) {
                    setNewKeyResult(null);
                    setNewKeyName('');
                    setCopiedKey(false);
                }
            }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Key className="w-5 h-5" />
                            {newKeyResult ? 'Chave Criada!' : 'Nova Chave de API'}
                        </DialogTitle>
                        <DialogDescription>
                            {newKeyResult
                                ? 'Copie sua chave agora. Ela não será exibida novamente.'
                                : 'Defina um nome e as permissões da nova chave.'}
                        </DialogDescription>
                    </DialogHeader>

                    {newKeyResult ? (
                        <div className="space-y-4 py-4">
                            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-amber-700">Atenção!</p>
                                        <p className="text-sm text-amber-600">
                                            Esta é a única vez que você verá esta chave. Guarde-a em local seguro.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="relative">
                                <Input
                                    value={newKeyResult.plain_text_key}
                                    readOnly
                                    className="pr-12 font-mono text-sm bg-muted"
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 -translate-y-1/2"
                                    onClick={() => handleCopyKey(newKeyResult.plain_text_key)}
                                >
                                    {copiedKey ? (
                                        <Check className="w-4 h-4 text-green-600" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Nome da Chave</Label>
                                <Input
                                    placeholder="Ex: N8N Producao, Zapier, Make..."
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-3">
                                <Label>Permissões</Label>
                                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <Eye className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-sm">Leitura (GET)</span>
                                    </div>
                                    <Switch checked={newKeyRead} onCheckedChange={setNewKeyRead} />
                                </div>
                                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                        </svg>
                                        <span className="text-sm">Escrita (POST/PUT)</span>
                                    </div>
                                    <Switch checked={newKeyWrite} onCheckedChange={setNewKeyWrite} />
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {newKeyResult ? (
                            <Button onClick={() => {
                                setShowCreateModal(false);
                                setNewKeyResult(null);
                            }}>
                                Fechar
                            </Button>
                        ) : (
                            <>
                                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleCreateKey}
                                    disabled={createKeyMutation.isPending}
                                >
                                    {createKeyMutation.isPending ? 'Criando...' : 'Criar Chave'}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Logs Modal */}
            <ApiLogsModal
                keyId={showLogsModal}
                onClose={() => setShowLogsModal(null)}
            />

            {/* Delete Confirmation */}
            <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <Trash2 className="w-5 h-5" />
                            Excluir Chave Permanentemente
                        </DialogTitle>
                        <DialogDescription>
                            Esta ação é irreversível. Todos os logs de requisições serão mantidos,
                            mas a chave não poderá ser restaurada.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => showDeleteConfirm && handleDeleteKey(showDeleteConfirm)}
                        >
                            Excluir Permanentemente
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ---- Sub Components ----

function ApiKeyCard({
    apiKey,
    onRevoke,
    onViewLogs,
    onDelete
}: {
    apiKey: ApiKey;
    onRevoke: () => void;
    onViewLogs: () => void;
    onDelete: () => void;
}) {
    const isActive = apiKey.is_active;

    return (
        <Card className={`bg-card border-border transition-all ${!isActive ? 'opacity-60' : 'hover:shadow-md'}`}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-foreground">{apiKey.name}</h4>
                            <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
                                {isActive ? 'Ativa' : 'Revogada'}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                                {apiKey.key_prefix}...
                            </code>
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {apiKey.last_used_at
                                    ? formatDistanceToNow(new Date(apiKey.last_used_at), { addSuffix: true, locale: ptBR })
                                    : 'Nunca usada'}
                            </span>
                            <span className="flex items-center gap-1">
                                <Activity className="w-3 h-3" />
                                {apiKey.request_count} requests
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            {apiKey.permissions.read && (
                                <Badge variant="outline" className="text-xs border-green-500/30 text-green-600">
                                    <Eye className="w-3 h-3 mr-1" />
                                    Leitura
                                </Badge>
                            )}
                            {apiKey.permissions.write && (
                                <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600">
                                    <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                    </svg>
                                    Escrita
                                </Badge>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={onViewLogs} title="Ver logs">
                            <BarChart3 className="w-4 h-4" />
                        </Button>
                        {isActive && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onRevoke}
                                className="text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                                title="Revogar"
                            >
                                <EyeOff className="w-4 h-4" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onDelete}
                            className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                            title="Excluir"
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function ApiLogsModal({ keyId, onClose }: { keyId: string | null; onClose: () => void }) {
    const { data: logs, isLoading } = useApiKeyLogs(keyId);

    if (!keyId) return null;

    return (
        <Dialog open={!!keyId} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        Logs de Requisições
                    </DialogTitle>
                    <DialogDescription>
                        Últimas 100 requisições feitas com esta chave.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[400px] pr-4">
                    {isLoading ? (
                        <div className="text-center py-10 text-muted-foreground">Carregando...</div>
                    ) : logs?.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            Nenhuma requisição registrada.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {logs?.map((log: any) => (
                                <div
                                    key={log.id}
                                    className="p-3 bg-muted/50 rounded-lg flex items-center justify-between text-sm"
                                >
                                    <div className="flex items-center gap-3">
                                        <Badge
                                            variant={log.status_code >= 400 ? "destructive" : "default"}
                                            className="font-mono text-xs"
                                        >
                                            {log.status_code}
                                        </Badge>
                                        <span className="font-mono text-muted-foreground">
                                            {log.method}
                                        </span>
                                        <span className="font-medium text-foreground">
                                            {log.endpoint}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-muted-foreground">
                                        <span>{log.response_time_ms}ms</span>
                                        <span className="text-xs">
                                            {new Date(log.created_at).toLocaleString('pt-BR')}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
