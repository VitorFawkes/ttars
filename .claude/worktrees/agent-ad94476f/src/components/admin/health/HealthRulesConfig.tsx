import { useState } from 'react'
import { ChevronDown, Save } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
    useHealthRules,
    useToggleHealthRule,
    useUpdateHealthRule,
    type HealthRule,
} from '@/hooks/useIntegrationHealth'
import { cn } from '@/lib/utils'

const CATEGORY_LABELS: Record<string, string> = {
    whatsapp: 'WhatsApp',
    activecampaign: 'ActiveCampaign',
    outbound: 'Outbound (CRM → AC)',
    monde: 'Monde ERP',
    system: 'Sistema',
}

const SEVERITY_STYLES: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    warning: 'bg-amber-100 text-amber-700',
    info: 'bg-blue-100 text-blue-700',
}

function RuleRow({ rule }: { rule: HealthRule }) {
    const toggle = useToggleHealthRule()
    const update = useUpdateHealthRule()
    const [thresholdHours, setThresholdHours] = useState(String(rule.threshold_hours))
    const isDirty = Number(thresholdHours) !== rule.threshold_hours

    return (
        <div className="flex items-center gap-4 py-3 px-1">
            <Switch
                checked={rule.is_enabled}
                onCheckedChange={(checked) => toggle.mutate({ ruleId: rule.id, isEnabled: checked })}
                disabled={toggle.isPending}
            />
            <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium text-slate-900', !rule.is_enabled && 'opacity-50')}>
                    {rule.label}
                </p>
                {rule.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{rule.description}</p>
                )}
            </div>
            <Badge className={cn('text-[10px] shrink-0', SEVERITY_STYLES[rule.severity])}>
                {rule.severity}
            </Badge>
            <div className="flex items-center gap-1.5 shrink-0">
                <Input
                    type="number"
                    min={1}
                    value={thresholdHours}
                    onChange={(e) => setThresholdHours(e.target.value)}
                    className="w-16 h-8 text-xs text-center"
                    disabled={!rule.is_enabled}
                />
                <span className="text-xs text-slate-400">h</span>
                {isDirty && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => update.mutate({
                            ruleId: rule.id,
                            updates: { threshold_hours: Number(thresholdHours) },
                        })}
                        disabled={update.isPending}
                    >
                        <Save className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>
        </div>
    )
}

function CategorySection({ category, rules }: { category: string; rules: HealthRule[] }) {
    const [open, setOpen] = useState(true)

    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
            >
                <span className="text-sm font-semibold text-slate-900">
                    {CATEGORY_LABELS[category] ?? category}
                </span>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{rules.length} regras</span>
                    <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', open && 'rotate-180')} />
                </div>
            </button>
            {open && (
                <div className="border-t border-slate-100 px-3 divide-y divide-slate-100">
                    {rules.map(rule => <RuleRow key={rule.id} rule={rule} />)}
                </div>
            )}
        </div>
    )
}

export default function HealthRulesConfig() {
    const { data: rules, isLoading } = useHealthRules()

    if (isLoading) {
        return <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
    }

    // Agrupar por categoria
    const grouped = (rules ?? []).reduce<Record<string, HealthRule[]>>((acc, rule) => {
        ;(acc[rule.category] ??= []).push(rule)
        return acc
    }, {})

    const categoryOrder = ['whatsapp', 'activecampaign', 'outbound', 'monde', 'system']

    return (
        <div className="space-y-3">
            {categoryOrder
                .filter(cat => grouped[cat]?.length)
                .map(cat => (
                    <CategorySection key={cat} category={cat} rules={grouped[cat]} />
                ))}
        </div>
    )
}
