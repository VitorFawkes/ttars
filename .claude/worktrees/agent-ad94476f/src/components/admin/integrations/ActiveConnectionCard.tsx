import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
    Webhook,
    Activity,
    Zap,
    MessageSquare,
    DollarSign,
    ArrowRight,
    Trash2,
    type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Mapa de ícones por provider
const PROVIDER_ICONS: Record<string, LucideIcon> = {
    webhook: Webhook,
    active_campaign: Zap,
    whatsapp: MessageSquare,
    monde: DollarSign,
    default_input: Webhook,
    default_output: Activity,
};

interface ActiveConnectionCardProps {
    integration: {
        id: string;
        name: string;
        provider: string;
        type: 'input' | 'output';
        is_active: boolean;
        updated_at: string | null;
    };
    onClick?: () => void;
    onDelete?: () => void;
    /** IDs que não podem ser deletados (ex: AC) */
    protectedIds?: string[];
}

/**
 * Formata data relativa (ex: "5m atrás", "2h atrás", "Ontem")
 */
function formatRelativeTime(date: string | null): string {
    if (!date) return 'Nunca';

    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}m atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days === 1) return 'Ontem';
    if (days < 7) return `${days} dias atrás`;
    return new Date(date).toLocaleDateString('pt-BR');
}

export function ActiveConnectionCard({
    integration,
    onClick,
    onDelete,
    protectedIds = []
}: ActiveConnectionCardProps) {
    // Determinar ícone
    const providerKey = integration.provider?.toLowerCase() || (integration.type === 'input' ? 'default_input' : 'default_output');
    const IconComponent = PROVIDER_ICONS[providerKey] || PROVIDER_ICONS.default_input;

    const isProtected = protectedIds.includes(integration.id);
    const canDelete = !isProtected && onDelete;

    return (
        <Card
            className={cn(
                "group bg-card border-border hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer",
                !integration.is_active && "opacity-60"
            )}
            onClick={onClick}
        >
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <IconComponent className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-base font-medium">
                                {integration.name}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground capitalize">
                                {integration.provider || integration.type}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Badge
                            variant="secondary"
                            className={cn(
                                "text-xs",
                                integration.is_active
                                    ? "bg-green-100 text-green-700"
                                    : "bg-slate-100 text-slate-600"
                            )}
                        >
                            {integration.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>

                        {canDelete && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete?.();
                                }}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        Última sincronização: {formatRelativeTime(integration.updated_at)}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:translate-x-1 group-hover:text-primary transition-all" />
                </div>
            </CardContent>
        </Card>
    );
}
