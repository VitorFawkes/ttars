import { useState } from 'react';
import {
    Plus,
    Trash2,
    Eye,
    EyeOff,
    Check
} from 'lucide-react';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

interface Category {
    key: string;
    label: string;
    scope: string;
    visible: boolean;
}

interface CategoryContextCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    categories: Category[];
    usageCounts: Record<string, number>;
    onAdd: (label: string) => Promise<void>;
    onToggleVisibility: (key: string, visible: boolean) => void;
    onDelete: (key: string) => void;
}

export function CategoryContextCard({
    title,
    description,
    icon,
    categories,
    usageCounts,
    onAdd,
    onToggleVisibility,
    onDelete
}: CategoryContextCardProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLabel.trim()) return;

        setIsSubmitting(true);
        try {
            await onAdd(newLabel);
            setNewLabel('');
            setIsAdding(false);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="group relative bg-white border border-slate-200 rounded-2xl overflow-hidden transition-all duration-300 hover:border-indigo-500/30 hover:shadow-xl">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                        <div className="p-3 bg-white rounded-xl text-indigo-600 border border-slate-200 shadow-sm">
                            {icon}
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">{title}</h3>
                            <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-md">
                                {description}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-500 shadow-sm">
                            {categories.length} opções
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-2">
                <div className="space-y-1">
                    {categories.map((cat) => {
                        const count = usageCounts[cat.key] || 0;
                        const isUsed = count > 0;

                        return (
                            <div
                                key={cat.key}
                                className={cn(
                                    "flex items-center justify-between p-3 rounded-xl transition-all duration-200 group/item",
                                    cat.visible ? "hover:bg-slate-50" : "opacity-60 hover:opacity-100 bg-slate-50"
                                )}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={cn(
                                        "w-2 h-2 rounded-full shrink-0 transition-colors",
                                        cat.visible ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-slate-300"
                                    )} />
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "font-medium truncate",
                                                cat.visible ? "text-slate-700" : "text-slate-400 line-through decoration-slate-300"
                                            )}>
                                                {cat.label}
                                            </span>
                                            {isUsed && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                                                    {count}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] font-mono text-slate-400 opacity-0 group-hover/item:opacity-100 transition-opacity truncate">
                                            {cat.key}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onToggleVisibility(cat.key, !cat.visible)}
                                        className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                        title={cat.visible ? "Ocultar" : "Mostrar"}
                                    >
                                        {cat.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                    </Button>

                                    {!isUsed && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                if (confirm('Tem certeza? Esta ação é irreversível.')) {
                                                    onDelete(cat.key);
                                                }
                                            }}
                                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                            title="Excluir"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {categories.length === 0 && !isAdding && (
                        <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl m-2">
                            <p className="text-sm text-slate-500">Nenhuma opção configurada.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer / Add Action */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                {isAdding ? (
                    <form onSubmit={handleAdd} className="flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-200">
                        <Input
                            autoFocus
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            placeholder="Nome da nova opção..."
                            className="bg-white border-slate-200 focus:border-indigo-500 text-sm h-9 text-slate-900 placeholder:text-slate-400"
                        />
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                        >
                            {isSubmitting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIsAdding(false)}
                            className="h-9 w-9 p-0 text-slate-400 hover:text-slate-700"
                        >
                            <XIcon className="w-4 h-4" />
                        </Button>
                    </form>
                ) : (
                    <Button
                        variant="ghost"
                        onClick={() => setIsAdding(true)}
                        className="w-full justify-start text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 group/add"
                    >
                        <div className="p-1 rounded bg-white border border-slate-200 group-hover/add:border-indigo-200 mr-2 transition-colors">
                            <Plus className="w-3 h-3" />
                        </div>
                        <span className="text-sm font-medium">Adicionar Opção</span>
                    </Button>
                )}
            </div>
        </div>
    );
}

function XIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
        </svg>
    )
}
