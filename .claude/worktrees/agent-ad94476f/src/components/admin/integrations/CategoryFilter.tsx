import { Button } from '@/components/ui/Button';
import {
    Layers,
    Users,
    DollarSign,
    MessageSquare,
    Plane,
    CreditCard,
    Target,
    Code,
    type LucideIcon
} from 'lucide-react';
import { PROVIDER_CATEGORIES, type ProviderCategory } from '@/hooks/useIntegrationProviders';
import { cn } from '@/lib/utils';

// Mapa de ícones por categoria
const CATEGORY_ICONS: Record<string, LucideIcon> = {
    Layers,
    Users,
    DollarSign,
    MessageSquare,
    Plane,
    CreditCard,
    Target,
    Code,
};

interface CategoryFilterProps {
    active: string;
    onChange: (category: string) => void;
    /** Mostrar apenas categorias com providers ativos */
    availableCategories?: string[];
    /** Variante compacta (apenas ícones em mobile) */
    compact?: boolean;
}

export function CategoryFilter({
    active,
    onChange,
    availableCategories,
    compact = false
}: CategoryFilterProps) {
    const categories = Object.entries(PROVIDER_CATEGORIES) as [ProviderCategory, { label: string; icon: string }][];

    // Filtrar categorias se necessário
    const visibleCategories = availableCategories
        ? categories.filter(([key]) => key === 'all' || availableCategories.includes(key))
        : categories;

    return (
        <div className="flex flex-wrap gap-2">
            {visibleCategories.map(([key, { label, icon }]) => {
                const IconComponent = CATEGORY_ICONS[icon] || Layers;
                const isActive = active === key;

                return (
                    <Button
                        key={key}
                        variant={isActive ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => onChange(key)}
                        className={cn(
                            "transition-all",
                            isActive && "shadow-sm",
                            compact && "px-2 md:px-3"
                        )}
                    >
                        <IconComponent className={cn("w-4 h-4", !compact && "mr-1.5")} />
                        <span className={cn(compact && "hidden md:inline")}>
                            {label}
                        </span>
                    </Button>
                );
            })}
        </div>
    );
}

/**
 * Versão simplificada com apenas os filtros mais usados
 */
export function CategoryFilterSimple({
    active,
    onChange
}: Omit<CategoryFilterProps, 'availableCategories' | 'compact'>) {
    const mainCategories: ProviderCategory[] = ['all', 'crm', 'erp', 'communication', 'developer'];

    return (
        <div className="flex gap-2">
            {mainCategories.map((key) => {
                const config = PROVIDER_CATEGORIES[key];
                const isActive = active === key;

                return (
                    <Button
                        key={key}
                        variant={isActive ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => onChange(key)}
                    >
                        {config.label}
                    </Button>
                );
            })}
        </div>
    );
}
