import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Calendar, Check, X, RotateCcw } from 'lucide-react';

interface DayPattern {
    days: number[];
    description?: string;
}

interface DayPatternEditorProps {
    pattern: DayPattern | null;
    onChange: (pattern: DayPattern | null) => void;
    maxDays?: number;
    stepsByDay?: Map<number, { type: string; title: string }[]>;
}

const presetPatterns: { name: string; days: number[]; description: string }[] = [
    {
        name: '3 dias seguidos',
        days: [1, 2, 3],
        description: '3 dias consecutivos de contato'
    },
    {
        name: 'Dias alternados',
        days: [1, 3, 5, 7],
        description: 'Contato em dias alternados'
    },
    {
        name: 'Intensivo (5 dias)',
        days: [1, 2, 3, 4, 5],
        description: '5 dias consecutivos de contato'
    },
    {
        name: '3+1+1 (padrão SDR)',
        days: [1, 2, 3, 5, 8],
        description: '3 dias, pausa, 1 dia, pausa maior, fechamento'
    },
    {
        name: 'Semanal',
        days: [1, 8, 15],
        description: 'Contato uma vez por semana'
    }
];

export function DayPatternEditor({
    pattern,
    onChange,
    maxDays = 14,
    stepsByDay
}: DayPatternEditorProps) {
    const activeDays = useMemo(() => new Set(pattern?.days || []), [pattern]);

    const toggleDay = (day: number) => {
        const newDays = new Set(activeDays);
        if (newDays.has(day)) {
            newDays.delete(day);
        } else {
            newDays.add(day);
        }
        const sortedDays = Array.from(newDays).sort((a, b) => a - b);
        onChange(sortedDays.length > 0 ? { days: sortedDays, description: generateDescription(sortedDays) } : null);
    };

    const applyPreset = (preset: typeof presetPatterns[0]) => {
        onChange({ days: preset.days, description: preset.description });
    };

    const reset = () => {
        onChange(null);
    };

    const generateDescription = (days: number[]): string => {
        if (days.length === 0) return '';
        if (days.length === 1) return `Apenas dia ${days[0]}`;

        const groups: string[] = [];
        let start = days[0];
        let end = days[0];

        for (let i = 1; i < days.length; i++) {
            if (days[i] === end + 1) {
                end = days[i];
            } else {
                if (start === end) {
                    groups.push(`Dia ${start}`);
                } else {
                    groups.push(`Dias ${start}-${end}`);
                }
                start = days[i];
                end = days[i];
            }
        }

        if (start === end) {
            groups.push(`Dia ${start}`);
        } else {
            groups.push(`Dias ${start}-${end}`);
        }

        return groups.join(', ');
    };

    const getDaySteps = (day: number) => {
        return stepsByDay?.get(day) || [];
    };

    return (
        <div className="space-y-4">
            {/* Presets */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Padrões Pré-definidos</label>
                <div className="flex flex-wrap gap-2">
                    {presetPatterns.map((preset) => (
                        <Button
                            key={preset.name}
                            variant="outline"
                            size="sm"
                            onClick={() => applyPreset(preset)}
                            className={`text-xs ${
                                JSON.stringify(preset.days) === JSON.stringify(pattern?.days)
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                    : ''
                            }`}
                        >
                            {preset.name}
                        </Button>
                    ))}
                    {pattern && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={reset}
                            className="text-xs text-slate-500"
                        >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Limpar
                        </Button>
                    )}
                </div>
            </div>

            {/* Day Grid */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Dias de Contato
                </label>
                <p className="text-xs text-slate-500">
                    Clique nos dias para ativar/desativar. Dias ativos terão tarefas agendadas.
                </p>
                <div className="flex flex-wrap gap-2">
                    {Array.from({ length: maxDays }, (_, i) => i + 1).map((day) => {
                        const isActive = activeDays.has(day);
                        const daySteps = getDaySteps(day);
                        const hasSteps = daySteps.length > 0;

                        return (
                            <button
                                key={day}
                                type="button"
                                onClick={() => toggleDay(day)}
                                className={`
                                    relative w-12 h-12 rounded-lg border-2 transition-all
                                    flex flex-col items-center justify-center
                                    ${isActive
                                        ? 'bg-indigo-100 border-indigo-500 text-indigo-700'
                                        : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
                                    }
                                `}
                            >
                                <span className="text-xs font-medium">Dia</span>
                                <span className="text-lg font-bold">{day}</span>
                                {isActive && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                                        <Check className="w-3 h-3 text-white" />
                                    </div>
                                )}
                                {hasSteps && (
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                                        <div className="flex gap-0.5">
                                            {daySteps.slice(0, 3).map((_, idx) => (
                                                <div key={idx} className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Summary */}
            {pattern && pattern.days.length > 0 && (
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                    <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span className="text-sm font-medium text-indigo-800">Resumo do Padrão</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {pattern.days.map((day, idx) => (
                            <React.Fragment key={day}>
                                <Badge className="bg-indigo-100 text-indigo-700">
                                    Dia {day}
                                </Badge>
                                {idx < pattern.days.length - 1 && (
                                    <span className="text-indigo-400">→</span>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                    <p className="text-xs text-indigo-600 mt-2">
                        {pattern.description || generateDescription(pattern.days)}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-indigo-500">
                        <span><strong>{pattern.days.length}</strong> dias de contato</span>
                        <span><strong>{Math.max(...pattern.days)}</strong> dias de duração total</span>
                        <span><strong>{Math.max(...pattern.days) - pattern.days.length}</strong> dias de pausa</span>
                    </div>
                </div>
            )}

            {/* Visual Timeline */}
            {pattern && pattern.days.length > 0 && (
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Timeline Visual</label>
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                        <div className="flex items-center gap-1 overflow-x-auto pb-2">
                            {Array.from({ length: Math.max(...pattern.days) }, (_, i) => i + 1).map((day) => {
                                const isActive = activeDays.has(day);
                                return (
                                    <div
                                        key={day}
                                        className={`
                                            flex-shrink-0 w-8 h-8 rounded flex items-center justify-center text-xs font-medium
                                            ${isActive
                                                ? 'bg-indigo-500 text-white'
                                                : 'bg-slate-100 text-slate-400'
                                            }
                                        `}
                                        title={isActive ? `Dia ${day}: Tarefa agendada` : `Dia ${day}: Pausa`}
                                    >
                                        {isActive ? <Check className="w-4 h-4" /> : <X className="w-3 h-3" />}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded bg-indigo-500" />
                                <span>Dia de contato</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded bg-slate-100" />
                                <span>Dia de pausa</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DayPatternEditor;
