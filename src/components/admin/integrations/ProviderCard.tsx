import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
    Zap,
    Webhook,
    MessageSquare,
    DollarSign,
    CreditCard,
    Building2,
    Target,
    Send,
    Plane,
    PlaneTakeoff,
    Mail,
    Link,
    GitBranch,
    TrendingUp,
    Building,
    Banknote,
    Users,
    Code,
    Layers,
    type LucideIcon
} from 'lucide-react';
import type { IntegrationProvider } from '@/hooks/useIntegrationProviders';
import { cn } from '@/lib/utils';

// Mapa de ícones por nome
const ICON_MAP: Record<string, LucideIcon> = {
    Zap,
    Webhook,
    MessageSquare,
    DollarSign,
    CreditCard,
    Building2,
    Target,
    Send,
    Plane,
    PlaneTakeoff,
    Mail,
    Link,
    GitBranch,
    TrendingUp,
    Building,
    Banknote,
    Users,
    Code,
    Layers,
};

interface ProviderCardProps {
    provider: IntegrationProvider;
    isConnected?: boolean;
    onConnect?: () => void;
    onClick?: () => void;
}

export function ProviderCard({
    provider,
    isConnected = false,
    onConnect,
    onClick
}: ProviderCardProps) {
    const IconComponent = provider.icon_name && ICON_MAP[provider.icon_name]
        ? ICON_MAP[provider.icon_name]
        : Zap;

    const handleClick = onClick || onConnect;

    return (
        <Card
            className={cn(
                "group hover:shadow-lg transition-all duration-200 cursor-pointer",
                isConnected && "border-green-200 bg-green-50/30",
                provider.is_beta && "border-dashed"
            )}
            onClick={handleClick}
        >
            <CardHeader className="pb-3">
                {/* Header: Icon + Badges */}
                <div className="flex justify-between items-start mb-3">
                    <div
                        className="p-3 rounded-xl transition-transform group-hover:scale-105"
                        style={{ backgroundColor: `${provider.color || '#64748B'}20` }}
                    >
                        <IconComponent
                            className="w-7 h-7"
                            style={{ color: provider.color || '#64748B' }}
                        />
                    </div>

                    <div className="flex gap-1">
                        {provider.is_beta && (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                Beta
                            </Badge>
                        )}
                        {isConnected && (
                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                Conectado
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Title */}
                <CardTitle className="text-lg font-semibold text-slate-900 group-hover:text-primary transition-colors">
                    {provider.name}
                </CardTitle>

                {/* Description */}
                <CardDescription className="line-clamp-2 h-10 text-slate-500">
                    {provider.description}
                </CardDescription>

                {/* Direction badges */}
                <div className="flex gap-1 mt-2">
                    {provider.direction.includes('inbound') && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            Receber
                        </Badge>
                    )}
                    {provider.direction.includes('outbound') && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            Enviar
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardFooter className="pt-0">
                <Button
                    className="w-full group-hover:bg-primary group-hover:text-white transition-all"
                    variant={isConnected ? "outline" : "default"}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleClick?.();
                    }}
                >
                    {isConnected ? 'Gerenciar' : 'Conectar'}
                </Button>
            </CardFooter>
        </Card>
    );
}
