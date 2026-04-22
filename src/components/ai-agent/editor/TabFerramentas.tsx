import { useMemo } from 'react'
import { Wrench, Plus, ShieldCheck, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Label } from '@/components/ui/label'
import { useNavigate } from 'react-router-dom'
import { useAiSkills, type AiSkill } from '@/hooks/useAiSkills'
import { useAiAgentDetail } from '@/hooks/useAiAgents'
import type { AgentEditorForm } from './types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
  agentId?: string
}

export function TabFerramentas({ form, setForm, agentId }: Props) {
  const navigate = useNavigate()
  const { skills } = useAiSkills()
  // Busca as skills já atribuídas direto do detalhe do agente. Isso garante
  // que apareçam mesmo se o hook geral `useAiSkills()` (filtrado por RLS da
  // sessão atual) não retornar uma delas — por exemplo, skill criada em outra
  // org do user. A fonte de render fica sempre consistente com o que o agente
  // tem gravado no banco.
  const { data: agentDetail } = useAiAgentDetail(agentId)
  const assignedFromAgent = useMemo(() => {
    const out: AiSkill[] = []
    const src = (agentDetail as unknown as { ai_agent_skills?: Array<{ ai_skills?: AiSkill | null }> } | null)
    for (const row of src?.ai_agent_skills ?? []) {
      if (row.ai_skills) out.push(row.ai_skills)
    }
    return out
  }, [agentDetail])

  const skillsById = useMemo(() => {
    const map = new Map<string, AiSkill>()
    // Skills gerais primeiro, depois sobrescreve com as atribuídas (source-of-truth).
    skills.forEach(s => map.set(s.id, s))
    assignedFromAgent.forEach(s => map.set(s.id, s))
    return map
  }, [skills, assignedFromAgent])

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
        Skills são as ferramentas que o agente pode usar durante a conversa (verificar agenda, criar tarefa, passar para humano, etc). Reordene para mudar a prioridade.
      </p>

      {/* Skills atribuídas (ordenáveis) */}
      {assigned.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-slate-500">Atribuídas</Label>
          {assigned.map((skillId, idx) => {
            const skill = skillsById.get(skillId)
            if (!skill) return null
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
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => toggleAssign(skillId)} className="text-red-500 hover:bg-red-50 h-8 w-8 p-0">
                    ×
                  </Button>
                </div>
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
