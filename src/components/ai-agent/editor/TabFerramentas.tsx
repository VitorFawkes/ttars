import { useMemo, useState } from 'react'
import { Wrench, Plus, ShieldCheck, ChevronUp, ChevronDown, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useNavigate } from 'react-router-dom'
import { useAiSkills, type AiSkill } from '@/hooks/useAiSkills'
import { cn } from '@/lib/utils'
import type { AgentEditorForm } from './types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

export function TabFerramentas({ form, setForm }: Props) {
  const navigate = useNavigate()
  const { skills } = useAiSkills()
  const [overrideOpen, setOverrideOpen] = useState<string | null>(null)

  const skillsById = useMemo(() => {
    const map = new Map<string, AiSkill>()
    skills.forEach(s => map.set(s.id, s))
    return map
  }, [skills])

  const assigned = form.assigned_skill_ids
  const unassigned = skills.filter(s => !assigned.includes(s.id))

  const toggleAssign = (skillId: string) => {
    setForm(f => ({
      ...f,
      assigned_skill_ids: f.assigned_skill_ids.includes(skillId)
        ? f.assigned_skill_ids.filter(id => id !== skillId)
        : [...f.assigned_skill_ids, skillId],
    }))
  }

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= assigned.length) return
    setForm(f => {
      const next = [...f.assigned_skill_ids]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...f, assigned_skill_ids: next }
    })
  }

  const setOverride = (skillId: string, raw: string) => {
    setForm(f => {
      const next = { ...(f.skill_config_overrides ?? {}) }
      const trimmed = raw.trim()
      if (!trimmed || trimmed === '{}') {
        delete next[skillId]
      } else {
        try {
          const parsed = JSON.parse(trimmed)
          if (parsed && typeof parsed === 'object') {
            next[skillId] = parsed as Record<string, unknown>
          }
        } catch { /* aguarda JSON válido */ }
      }
      return { ...f, skill_config_overrides: next }
    })
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
            Ferramentas <span className="text-slate-400 font-normal">({assigned.length} atribuídas, na ordem de prioridade)</span>
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/settings/ai-skills')} className="gap-1">
          <Plus className="w-3 h-3" /> Gerenciar skills
        </Button>
      </header>
      <p className="text-sm text-slate-500 -mt-2">
        Skills são as ferramentas que o agente pode usar durante a conversa (verificar agenda, criar tarefa, passar para humano, etc). Reordene para mudar a prioridade. Clique em <Settings2 className="w-3 h-3 inline" /> para sobrescrever configuração padrão de uma skill específica.
      </p>

      {/* Skills atribuídas (ordenáveis) */}
      {assigned.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-slate-500">Atribuídas</Label>
          {assigned.map((skillId, idx) => {
            const skill = skillsById.get(skillId)
            if (!skill) return null
            const override = form.skill_config_overrides?.[skillId]
            const hasOverride = override && Object.keys(override).length > 0
            const isExpanded = overrideOpen === skillId
            return (
              <div key={skillId} className="border border-indigo-200 bg-indigo-50/40 rounded-lg">
                <div className="flex items-start gap-2 p-3">
                  <div className="flex flex-col pt-1">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => move(idx, 1)} disabled={idx === assigned.length - 1} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700 flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-indigo-900">{skill.nome}</p>
                    {skill.descricao && <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">{skill.descricao}</p>}
                    <div className="flex gap-1 mt-1">
                      <Badge variant="outline" className="text-xs">{skill.categoria}</Badge>
                      <Badge variant="outline" className="text-xs">{skill.tipo}</Badge>
                      {hasOverride && <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">config customizada</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOverrideOpen(isExpanded ? null : skillId)}
                      className={cn('h-8 w-8 p-0', hasOverride && 'text-amber-600')}
                      title="Sobrescrever config da skill"
                    >
                      <Settings2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleAssign(skillId)} className="text-red-500 hover:bg-red-50 h-8 w-8 p-0">
                      ×
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-indigo-100 p-3 space-y-1.5 bg-white">
                    <Label className="text-xs text-slate-600">Override de configuração (JSON, merge sobre o default)</Label>
                    <Textarea
                      rows={4}
                      defaultValue={JSON.stringify(override ?? {}, null, 2)}
                      onChange={e => setOverride(skillId, e.target.value)}
                      className="font-mono text-xs"
                      placeholder={'{\n  "timeout_ms": 5000\n}'}
                    />
                    <p className="text-[11px] text-slate-400">
                      Deixe <code>{'{}'}</code> ou vazio para usar a configuração padrão da skill.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Skills disponíveis (para adicionar) */}
      {unassigned.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-slate-500">Disponíveis</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {unassigned.map(skill => (
              <button
                key={skill.id}
                type="button"
                onClick={() => toggleAssign(skill.id)}
                className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 text-left transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{skill.nome}</p>
                  {skill.descricao && <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{skill.descricao}</p>}
                  <div className="flex gap-1 mt-1">
                    <Badge variant="outline" className="text-xs">{skill.categoria}</Badge>
                    <Badge variant="outline" className="text-xs">{skill.tipo}</Badge>
                  </div>
                </div>
                <div className="text-slate-400 mt-0.5">
                  <Plus className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {assigned.length === 0 && unassigned.length === 0 && (
        <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
          Nenhuma skill disponível. Clique em "Gerenciar skills" para criar.
        </p>
      )}

      {assigned.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-500 pt-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>A ordem acima define a prioridade quando o agente tem várias skills candidatas.</span>
        </div>
      )}
    </section>
  )
}
