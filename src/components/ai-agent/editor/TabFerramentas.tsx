import { Wrench, Plus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
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

  const toggle = (skillId: string) => {
    setForm(f => ({
      ...f,
      assigned_skill_ids: f.assigned_skill_ids.includes(skillId)
        ? f.assigned_skill_ids.filter(id => id !== skillId)
        : [...f.assigned_skill_ids, skillId],
    }))
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
            Ferramentas <span className="text-slate-400 font-normal">({form.assigned_skill_ids.length} atribuídas)</span>
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/settings/ai-skills')} className="gap-1">
          <Plus className="w-3 h-3" /> Gerenciar skills
        </Button>
      </header>
      <p className="text-sm text-slate-500 -mt-2">
        Skills são as ferramentas que o agente pode usar durante a conversa (verificar agenda, criar tarefa, passar para humano, etc). O agente decide quando usar cada uma.
      </p>

      {skills.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
          Nenhuma skill disponível. Clique em "Gerenciar skills" para criar.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {skills.map((skill: AiSkill) => {
            const isAssigned = form.assigned_skill_ids.includes(skill.id)
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => toggle(skill.id)}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                  isAssigned
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium', isAssigned ? 'text-indigo-900' : 'text-slate-900')}>
                    {skill.nome}
                  </p>
                  {skill.descricao && (
                    <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{skill.descricao}</p>
                  )}
                  <div className="flex gap-1 mt-1">
                    <Badge variant="outline" className="text-xs">{skill.categoria}</Badge>
                    <Badge variant="outline" className="text-xs">{skill.tipo}</Badge>
                  </div>
                </div>
                {isAssigned && (
                  <div className="text-indigo-600 mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
