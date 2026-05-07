/**
 * BaseNode — componente visual genérico que renderiza qualquer tipo do registry.
 *
 * Em vez de criar 25+ componentes separados, parametrizamos pelo `type`. Cada
 * categoria tem cor própria; o ícone vem do lucide pelo `iconName` registrado.
 * Triggers têm só handle de saída; terminais (end) só de entrada;
 * branch tem múltiplas saídas (renderiza handles extras).
 */
import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NODE_BY_TYPE } from './registry'
import type { WorkflowNode, WorkflowNodeType, NodeCategory } from '../types'
import { EchoBadge } from '@/components/automations/EchoBadge'
import { summarizeConfig } from './summarize'

const CATEGORY_COLORS: Record<NodeCategory, { bg: string; border: string; ring: string; chip: string }> = {
    trigger:     { bg: 'bg-amber-50',   border: 'border-amber-300',   ring: 'ring-amber-400',   chip: 'bg-amber-100 text-amber-700' },
    card:        { bg: 'bg-blue-50',    border: 'border-blue-300',    ring: 'ring-blue-400',    chip: 'bg-blue-100 text-blue-700' },
    message:     { bg: 'bg-emerald-50', border: 'border-emerald-300', ring: 'ring-emerald-400', chip: 'bg-emerald-100 text-emerald-700' },
    echo:        { bg: 'bg-violet-50',  border: 'border-violet-300',  ring: 'ring-violet-400',  chip: 'bg-violet-100 text-violet-700' },
    flow:        { bg: 'bg-slate-50',   border: 'border-slate-300',   ring: 'ring-slate-400',   chip: 'bg-slate-100 text-slate-700' },
    integration: { bg: 'bg-pink-50',    border: 'border-pink-300',    ring: 'ring-pink-400',    chip: 'bg-pink-100 text-pink-700' },
}

const resolveIcon = (name: string): LucideIcon => {
    const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[name]
    return Icon || LucideIcons.Circle
}

const BaseNodeComponent: React.FC<NodeProps<WorkflowNode>> = ({ type, data, selected }) => {
    const meta = NODE_BY_TYPE.get(type as WorkflowNodeType)
    if (!meta) {
        return (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-xs text-red-700 shadow-sm">
                Tipo desconhecido: {String(type)}
            </div>
        )
    }
    const Icon = resolveIcon(meta.iconName)
    const colors = CATEGORY_COLORS[meta.category]
    const isEcho = meta.category === 'echo'
    const isInvalid = data.valid === false

    return (
        <div
            className={`relative bg-white rounded-xl shadow-sm border-2 transition-all ${
                selected ? `${colors.border} ring-2 ${colors.ring} ring-opacity-30` : 'border-slate-200 hover:border-slate-300'
            } ${isInvalid ? 'border-red-300 ring-2 ring-red-200' : ''}`}
            style={{ width: 240 }}
        >
            {/* Cabeçalho colorido por categoria */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl ${colors.bg}`}>
                <div className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center">
                    {isEcho ? <EchoBadge iconOnly size={16} /> : <Icon className="w-4 h-4 text-slate-700" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wide font-medium text-slate-500 truncate">
                        {meta.isTrigger ? 'Gatilho' : meta.label}
                    </div>
                </div>
            </div>

            {/* Corpo: label customizado + resumo do que está configurado */}
            <div className="px-3 py-2.5">
                <div className="text-sm font-medium text-slate-900 truncate">
                    {data.label || meta.label}
                </div>
                {(() => {
                    const summary = summarizeConfig(
                        type as WorkflowNodeType,
                        (data.config as Record<string, unknown>) || {},
                    )
                    if (summary) {
                        return (
                            <div className="mt-1 text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 truncate" title={summary}>
                                {summary}
                            </div>
                        )
                    }
                    return (
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 italic">
                            Clique pra configurar
                        </div>
                    )
                })()}
                {isInvalid && data.error && (
                    <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                        {data.error}
                    </div>
                )}
            </div>

            {/* Handles
                - Triggers: só saída (right)
                - Terminais (end): só entrada (left)
                - Branch: 1 entrada + 2 saídas (true/false) — renderizadas com label
                - Resto: 1 entrada + 1 saída
            */}
            {!meta.isTrigger && (
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 !bg-white !border-2 !border-slate-400"
                />
            )}
            {!meta.isTerminal && !meta.hasMultipleOutputs && (
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 !bg-white !border-2 !border-slate-400"
                />
            )}
            {meta.hasMultipleOutputs && (
                <>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="true"
                        style={{ top: '40%' }}
                        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white"
                    />
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="false"
                        style={{ top: '70%' }}
                        className="!w-3 !h-3 !bg-rose-500 !border-2 !border-white"
                    />
                </>
            )}
        </div>
    )
}

export const BaseNode = memo(BaseNodeComponent)

// Mapa que o React Flow espera: { [type]: Component }
// Como o BaseNode lida com TODOS os tipos via registry, registramos o mesmo
// componente pra cada type do registry.
import { NODE_REGISTRY } from './registry'
export const NODE_TYPES = NODE_REGISTRY.reduce<Record<string, typeof BaseNode>>((acc, n) => {
    acc[n.type] = BaseNode
    return acc
}, {})
