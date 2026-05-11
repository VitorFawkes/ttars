import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';

interface SmartStat {
    label: string;
    value: string | number;
    color?: 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'purple';
    icon?: ReactNode;
}

interface AdminPageHeaderProps {
    title: string;
    subtitle?: string;
    icon?: ReactNode;
    actions?: ReactNode;
    stats?: SmartStat[];
    className?: string;
}

export default function AdminPageHeader({
    title,
    subtitle,
    icon,
    actions,
    stats,
    className
}: AdminPageHeaderProps) {
    const colorMap = {
        blue: 'bg-blue-50 text-blue-700 border-blue-100',
        green: 'bg-green-50 text-green-700 border-green-100',
        red: 'bg-red-50 text-red-700 border-red-100',
        yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
        gray: 'bg-gray-50 text-gray-700 border-gray-100',
        purple: 'bg-purple-50 text-purple-700 border-purple-100',
    };

    return (
        <div className={cn("mb-8 space-y-6", className)}>
            {/* Top Row: Title & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                    {icon && (
                        <div className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm text-gray-600">
                            {icon}
                        </div>
                    )}
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
                        {subtitle && (
                            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
                        )}
                    </div>
                </div>
                {actions && (
                    <div className="flex items-center gap-2">
                        {actions}
                    </div>
                )}
            </div>

            {/* Bottom Row: Smart Stats (if any) */}
            {stats && stats.length > 0 && (
                <div className="flex flex-wrap gap-3">
                    {stats.map((stat, index) => (
                        <div
                            key={index}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors",
                                colorMap[stat.color || 'gray']
                            )}
                        >
                            {stat.icon && <span className="opacity-70">{stat.icon}</span>}
                            <span className="opacity-70">{stat.label}:</span>
                            <span className="font-bold">{stat.value}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
