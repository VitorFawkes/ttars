import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import type { DueOffset, DueUnit, DueAnchor } from '../lib/dueOffsetCodec';

interface NaturalDueFieldProps {
    value: DueOffset;
    onChange: (next: DueOffset) => void;
    /** Se true, mostra a opção "após bloco anterior concluído". Oculta no Bloco 0. */
    allowPreviousBlockAnchor?: boolean;
    disabled?: boolean;
}

const unitOptions: { value: DueUnit; label: string }[] = [
    { value: 'hours', label: 'horas' },
    { value: 'business_days', label: 'dias úteis' },
    { value: 'calendar_days', label: 'dias corridos' },
];

/**
 * Campo de prazo em linguagem natural.
 * Layout: [Em] [número] [unidade ▼] [âncora ▼]
 *
 * Substitui a UI antiga de day_offset (Select 0-13) e wait_config.duration_minutes
 * (input numérico cru). Fonte de verdade = due_offset; tradução para legacy
 * acontece apenas no save via dueOffsetCodec.
 */
export function NaturalDueField({
    value,
    onChange,
    allowPreviousBlockAnchor = true,
    disabled = false,
}: NaturalDueFieldProps) {
    const anchorOptions: { value: DueAnchor; label: string }[] = [
        { value: 'cadence_start', label: 'após início' },
        ...(allowPreviousBlockAnchor
            ? [{ value: 'previous_block_completed' as const, label: 'após bloco anterior' }]
            : []),
    ];

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">Em</span>
            <Input
                type="number"
                min={1}
                max={90}
                value={value.value}
                disabled={disabled}
                onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    onChange({ ...value, value: isNaN(parsed) ? 1 : Math.max(1, Math.min(90, parsed)) });
                }}
                className="h-8 w-16 text-xs"
            />
            <Select
                value={value.unit}
                onChange={(v) => onChange({ ...value, unit: v as DueUnit })}
                options={unitOptions}
                disabled={disabled}
                className="w-36"
            />
            <Select
                value={value.anchor}
                onChange={(v) => onChange({ ...value, anchor: v as DueAnchor })}
                options={anchorOptions}
                disabled={disabled}
                className="w-52"
            />
        </div>
    );
}
