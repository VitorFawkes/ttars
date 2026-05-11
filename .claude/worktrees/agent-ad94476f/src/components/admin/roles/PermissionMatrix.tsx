import { useMemo } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import {
    CAPABILITY_GROUPS,
    ROLE_PRESETS,
    countEnabledCapabilities,
    TOTAL_CAPABILITIES,
    type PermissionsMap,
} from '../../../lib/permissions'
import { cn } from '../../../lib/utils'

interface PermissionMatrixProps {
    value: PermissionsMap
    onChange: (next: PermissionsMap) => void
    readOnly?: boolean
    showPresets?: boolean
}

/**
 * Matriz visual para editar permissões de um role.
 *
 * Agrupa capabilities por domínio (pipeline, contatos, equipe, etc.) e
 * exibe toggles individuais. Capabilities perigosas são destacadas.
 *
 * Inclui presets (admin/sales/support/gestor) para início rápido.
 */
export default function PermissionMatrix({ value, onChange, readOnly, showPresets = true }: PermissionMatrixProps) {
    const enabled = useMemo(() => countEnabledCapabilities(value), [value])

    const toggle = (key: string) => {
        if (readOnly) return
        onChange({ ...value, [key]: !value[key] })
    }

    const applyPreset = (preset: keyof typeof ROLE_PRESETS) => {
        if (readOnly) return
        onChange(ROLE_PRESETS[preset])
    }

    const selectAll = () => {
        if (readOnly) return
        const all: PermissionsMap = {}
        for (const g of CAPABILITY_GROUPS) {
            for (const c of g.capabilities) {
                all[c.key] = true
            }
        }
        onChange(all)
    }

    const clearAll = () => {
        if (readOnly) return
        onChange({})
    }

    return (
        <div className="space-y-4">
            {/* Header: progresso + presets */}
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                    <p className="text-sm font-medium text-slate-900">
                        {enabled} de {TOTAL_CAPABILITIES} permissões habilitadas
                    </p>
                    <div className="w-40 h-1.5 bg-slate-200 rounded-full mt-1.5">
                        <div
                            className="h-full bg-indigo-600 rounded-full transition-all"
                            style={{ width: `${(enabled / TOTAL_CAPABILITIES) * 100}%` }}
                        />
                    </div>
                </div>

                {showPresets && !readOnly && (
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-500 mr-1">Preset:</span>
                        {Object.keys(ROLE_PRESETS).map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => applyPreset(preset as keyof typeof ROLE_PRESETS)}
                                className="text-xs px-2 py-1 rounded-md text-slate-700 hover:bg-white hover:border-slate-300 border border-transparent transition-colors"
                            >
                                {preset}
                            </button>
                        ))}
                        <div className="w-px h-4 bg-slate-300 mx-1" />
                        <button
                            type="button"
                            onClick={selectAll}
                            className="text-xs px-2 py-1 rounded-md text-slate-500 hover:text-slate-900"
                        >
                            Todas
                        </button>
                        <button
                            type="button"
                            onClick={clearAll}
                            className="text-xs px-2 py-1 rounded-md text-slate-500 hover:text-slate-900"
                        >
                            Nenhuma
                        </button>
                    </div>
                )}
            </div>

            {/* Matrix */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {CAPABILITY_GROUPS.map((group) => {
                    const groupEnabled = group.capabilities.filter((c) => value[c.key]).length
                    const groupTotal = group.capabilities.length
                    const allEnabled = groupEnabled === groupTotal
                    const noneEnabled = groupEnabled === 0

                    return (
                        <div
                            key={group.key}
                            className="border border-slate-200 rounded-lg overflow-hidden bg-white"
                        >
                            {/* Group header */}
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-900">{group.label}</h4>
                                    <p className="text-xs text-slate-500">{group.description}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">
                                        {groupEnabled}/{groupTotal}
                                    </span>
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const next = { ...value }
                                                const target = !allEnabled
                                                for (const c of group.capabilities) {
                                                    next[c.key] = target
                                                }
                                                onChange(next)
                                            }}
                                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                                        >
                                            {allEnabled ? 'Desmarcar tudo' : noneEnabled ? 'Marcar tudo' : 'Marcar tudo'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Capabilities */}
                            <div className="divide-y divide-slate-100">
                                {group.capabilities.map((cap) => {
                                    const checked = !!value[cap.key]
                                    return (
                                        <label
                                            key={cap.key}
                                            className={cn(
                                                'flex items-start gap-3 px-4 py-2.5 transition-colors',
                                                !readOnly && 'cursor-pointer hover:bg-slate-50'
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggle(cap.key)}
                                                disabled={readOnly}
                                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 disabled:opacity-50"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm text-slate-900 font-medium">{cap.label}</span>
                                                    {cap.dangerous && (
                                                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                                            <AlertTriangle className="w-2.5 h-2.5" />
                                                            sensível
                                                        </span>
                                                    )}
                                                    {checked && (
                                                        <Check className="w-3 h-3 text-green-600" />
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 leading-relaxed">{cap.description}</p>
                                                <code className="text-[10px] text-slate-400 font-mono">{cap.key}</code>
                                            </div>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
