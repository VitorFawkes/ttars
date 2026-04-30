import { useMemo, useState } from 'react'
import { Wrench, Plus, ShieldCheck, ChevronUp, ChevronDown, Info, Search, Settings2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useNavigate } from 'react-router-dom'
import { useAiSkills, type AiSkill } from '@/hooks/useAiSkills'
import { useAiAgentDetail } from '@/hooks/useAiAgents'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { AgentEditorForm } from './types'

// Tradução dos termos técnicos pra labels que o admin não-programador entenda.
const CATEGORIA_LABELS: Record<string, string> = {
  data_retrieval: 'Consultar dados',
  action: 'Executar ação',
  analytics: 'Analisar dados',
  integration: 'Integração externa',
  query: 'Consulta',
}

const TIPO_LABELS: Record<string, string> = {
  supabase_query: 'Banco de dados',
  edge_function: 'Função interna',
  n8n_webhook: 'Automação n8n',
  http_api: 'API externa',
}

function labelCategoria(c: string): string {
  return CATEGORIA_LABELS[c] ?? c
}

function labelTipo(t: string): string {
  return TIPO_LABELS[t] ?? t
}

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
  agentId?: string
}

export function TabFerramentas({ form, setForm, agentId }: Props) {
  const navigate = useNavigate()
  const { skills } = useAiSkills()
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
    skills.forEach(s => map.set(s.id, s))
    assignedFromAgent.forEach(s => map.set(s.id, s))
    return map
  }, [skills, assignedFromAgent])

  const assigned = form.assigned_skill_ids
  const unassigned = useMemo(() => skills.filter(s => !assigned.includes(s.id)), [skills, assigned])

  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState<string>('all')
  const [editingOverrideSkill, setEditingOverrideSkill] = useState<AiSkill | null>(null)

  // Categorias presentes
  const categorias = useMemo(() => {
    const set = new Set<string>()
    skills.forEach(s => set.add(s.categoria))
    return Array.from(set).sort()
  }, [skills])

  // Filtra skills disponíveis pela busca + categoria
  const filteredUnassigned = useMemo(() => {
    const q = search.toLowerCase().trim()
    return unassigned.filter(s => {
      if (filterCategoria !== 'all' && s.categoria !== filterCategoria) return false
      if (q) {
        const haystack = `${s.nome} ${s.descricao ?? ''} ${labelCategoria(s.categoria)} ${labelTipo(s.tipo)}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [unassigned, search, filterCategoria])

  // Agrupa disponíveis por categoria pra render
  const groupedUnassigned = useMemo(() => {
    const map = new Map<string, AiSkill[]>()
    for (const s of filteredUnassigned) {
      const arr = map.get(s.categoria) ?? []
      arr.push(s)
      map.set(s.categoria, arr)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredUnassigned])

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

  const hasOverride = (skillId: string): boolean => {
    const o = form.skill_config_overrides[skillId]
    return !!o && Object.keys(o).length > 0
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
            Ferramentas <span className="text-slate-400 font-normal">({assigned.length} ativas)</span>
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/settings/ai-skills')} className="gap-1">
          <Plus className="w-3 h-3" /> Criar nova skill
        </Button>
      </header>

      <p className="text-sm text-slate-500 -mt-2">
        Habilidades técnicas que o agente pode chamar durante a conversa (verificar agenda, criar tarefa, etc).
      </p>

      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 flex gap-2.5 -mt-1">
        <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <strong>Diferença pra "Decisões inteligentes":</strong> Decisões dizem <em>quando</em> a agente deve agir
          (ex: "quando criar reunião"). Aqui são as <em>ações técnicas</em> que ela pode chamar (ex: API que checa
          agenda, função que cria a tarefa no banco). As decisões orquestram, as ferramentas executam.
        </div>
      </div>

      {/* ── Skills atribuídas (ordenáveis) ──────────────────────── */}
      {assigned.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              Ativas ({assigned.length})
            </h3>
            <span className="text-[11px] text-slate-400">Ordem = prioridade</span>
          </div>
          <div className="space-y-2">
            {assigned.map((skillId, idx) => {
              const skill = skillsById.get(skillId)
              if (!skill) return null
              const customized = hasOverride(skillId)
              return (
                <div key={skillId} className="border border-indigo-200 bg-indigo-50/40 rounded-xl">
                  <div className="flex items-start gap-3 p-3">
                    <div className="flex flex-col pt-1">
                      <button
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        aria-label="Subir prioridade"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => move(idx, 1)}
                        disabled={idx === assigned.length - 1}
                        className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        aria-label="Descer prioridade"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700 flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-indigo-900 truncate">{skill.nome}</p>
                        {customized && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 font-medium inline-flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            customizado
                          </span>
                        )}
                      </div>
                      {skill.descricao && (
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{skill.descricao}</p>
                      )}
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px]" title={`categoria: ${skill.categoria}`}>
                          {labelCategoria(skill.categoria)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]" title={`tipo: ${skill.tipo}`}>
                          {labelTipo(skill.tipo)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingOverrideSkill(skill)}
                        className="h-8 w-8 p-0 text-slate-500 hover:text-indigo-700 hover:bg-indigo-100"
                        title="Customizar config para este agente"
                      >
                        <Settings2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAssign(skillId)}
                        className="text-red-500 hover:bg-red-50 h-8 w-8 p-0"
                        title="Remover do agente"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-2">
            <ShieldCheck className="w-3 h-3" />
            <span>Use ⚙️ pra customizar uma skill só pra este agente. Use × pra remover.</span>
          </div>
        </div>
      )}

      {/* ── Disponíveis (com busca + filtro) ──────────────────────── */}
      {(unassigned.length > 0 || assigned.length === 0) && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Disponíveis ({filteredUnassigned.length} de {unassigned.length})
          </h3>

          {/* Search bar + filtros */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, descrição ou tipo..."
                className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => setFilterCategoria('all')}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border transition-colors',
                  filterCategoria === 'all'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                )}
              >
                Todas
              </button>
              {categorias.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilterCategoria(c)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                    filterCategoria === c
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                  )}
                >
                  {labelCategoria(c)}
                </button>
              ))}
            </div>
          </div>

          {/* Lista agrupada */}
          {filteredUnassigned.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4 text-center">
              Nenhuma skill disponível com esse filtro.
            </p>
          ) : (
            <div className="space-y-3">
              {groupedUnassigned.map(([categoria, skillsInGroup]) => (
                <div key={categoria}>
                  <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                    {labelCategoria(categoria)} ({skillsInGroup.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {skillsInGroup.map(skill => (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => toggleAssign(skill.id)}
                        className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 text-left transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-900">{skill.nome}</p>
                          {skill.descricao && (
                            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{skill.descricao}</p>
                          )}
                          <div className="flex gap-1 mt-1.5">
                            <Badge variant="outline" className="text-[10px]">{labelTipo(skill.tipo)}</Badge>
                          </div>
                        </div>
                        <div className="text-slate-400 group-hover:text-indigo-500 mt-0.5 flex-shrink-0">
                          <Plus className="w-4 h-4" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {assigned.length === 0 && unassigned.length === 0 && (
        <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
          Nenhuma skill cadastrada na organização. Clique em "Criar nova skill" pra começar.
        </p>
      )}

      {/* Modal de edição de override */}
      {editingOverrideSkill && (
        <SkillOverrideModal
          skill={editingOverrideSkill}
          currentOverride={form.skill_config_overrides[editingOverrideSkill.id] ?? {}}
          onSave={(override) => {
            setForm(f => ({
              ...f,
              skill_config_overrides: {
                ...f.skill_config_overrides,
                [editingOverrideSkill.id]: override,
              },
            }))
            toast.success('Customização salva (lembre de salvar o agente no topo)')
            setEditingOverrideSkill(null)
          }}
          onClear={() => {
            setForm(f => {
              const next = { ...f.skill_config_overrides }
              delete next[editingOverrideSkill.id]
              return { ...f, skill_config_overrides: next }
            })
            toast.success('Customização removida')
            setEditingOverrideSkill(null)
          }}
          onClose={() => setEditingOverrideSkill(null)}
        />
      )}
    </section>
  )
}

// ── Modal de edição de override ─────────────────────────────────────────

function SkillOverrideModal({
  skill, currentOverride, onSave, onClear, onClose,
}: {
  skill: AiSkill
  currentOverride: Record<string, unknown>
  onSave: (override: Record<string, unknown>) => void
  onClear: () => void
  onClose: () => void
}) {
  const [text, setText] = useState(() => JSON.stringify(currentOverride, null, 2))
  const [error, setError] = useState<string | null>(null)

  const baseConfig = (skill as unknown as { config?: Record<string, unknown> }).config ?? {}
  const inputSchema = (skill as unknown as { input_schema?: Record<string, unknown> }).input_schema ?? {}
  const hasOverride = Object.keys(currentOverride).length > 0

  const handleSave = () => {
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError('Tem que ser um objeto JSON ({ ... })')
        return
      }
      onSave(parsed as Record<string, unknown>)
    } catch (err) {
      setError(`JSON inválido: ${(err as Error).message}`)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-slate-100 text-left">
          <DialogTitle className="text-base font-semibold text-slate-900 inline-flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-indigo-600" />
            Customizar "{skill.nome}"
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 mt-0.5">
            Sobrescrever a configuração padrão da skill APENAS para este agente. Vazio = usa o padrão.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {Object.keys(baseConfig).length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-700 mb-1.5">Configuração padrão (referência):</h4>
              <pre className="text-[11px] bg-slate-50 border border-slate-200 rounded p-2.5 overflow-x-auto font-mono text-slate-700">
                {JSON.stringify(baseConfig, null, 2)}
              </pre>
            </div>
          )}

          {Object.keys(inputSchema).length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-700 mb-1.5">Campos aceitos (input_schema):</h4>
              <pre className="text-[11px] bg-slate-50 border border-slate-200 rounded p-2.5 overflow-x-auto font-mono text-slate-700 max-h-32">
                {JSON.stringify(inputSchema, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Override JSON pra este agente:
            </label>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setError(null) }}
              rows={10}
              className="w-full font-mono text-xs border border-slate-200 rounded-lg p-3 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
              placeholder="{}"
              spellCheck={false}
            />
            {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
            <p className="text-[11px] text-slate-500 mt-1">
              Os campos aqui sobrescrevem os mesmos campos do padrão. Apenas o que precisa mudar pra este agente.
            </p>
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
          {hasOverride ? (
            <Button variant="outline" size="sm" onClick={onClear} className="text-rose-600 hover:bg-rose-50">
              Remover customização
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>Salvar customização</Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
