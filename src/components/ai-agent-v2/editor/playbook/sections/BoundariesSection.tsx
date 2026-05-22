import { useEffect, useState } from 'react'
import { Loader2, Save, Shield, X, Plus, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAgentBoundaries, type BoundariesConfig } from '@/hooks/v2/playbook/useAgentBoundaries'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

/**
 * Biblioteca CURADA de boundaries de MARCA (Grupo A). Texto que vai pro prompt
 * é definido no código (defaults/<agent>_boundaries.ts) — admin só escolhe
 * quais aplicar via toggle. Quando admin não preenche brand_active, router
 * usa default_active de cada item (todos ON na curadoria atual).
 *
 * Mantido em sync com PATRICIA_BRAND_BOUNDARIES_LIBRARY em
 * supabase/functions/ai-agent-router-v2/defaults/patricia_boundaries.ts.
 */
const BRAND_BOUNDARIES_LIBRARY = [
  { id: 'never_meeting_price', label: 'Nunca fala preço/valor do casamento', hint: 'Apenas a faixa de honorário da assessoria pode ser citada quando o lead pergunta direto.' },
  { id: 'never_ai_mention', label: 'Nunca menciona IA, robô, chatbot, sistema', hint: 'Decisão de marca — o agente atende como pessoa.' },
  { id: 'never_competitor_name', label: 'Nunca menciona concorrente por nome', hint: 'Quando o lead trouxer comparação, redireciona pro que a empresa faz, sem citar o outro.' },
  { id: 'never_promise_deadline', label: 'Nunca promete prazo específico de resposta', hint: 'Usa linguagem flexível: "te chamo de volta em pouco".' },
  { id: 'never_invent_kb', label: 'Nunca inventa info de destino/pacote sem checar base', hint: 'Sem KB, redireciona pra reunião com a especialista.' },
  { id: 'never_negotiate_writing', label: 'Nunca negocia por escrito', hint: 'Negociação é só com a especialista humana na reunião.' },
  { id: 'never_send_material', label: 'Nunca promete enviar material/brochura/guia', hint: 'Política configurável no campo "Material/brochura" em Regras de Negócio.' },
] as const

/**
 * 11 regras técnicas de qualidade do prompt (Grupo B) — sempre ON, admin
 * não desativa. Mostradas read-only pra admin entender o que o agente
 * segue automaticamente.
 *
 * Mantido em sync com PATRICIA_DESIGN_BOUNDARIES no código.
 */
const DESIGN_BOUNDARIES = [
  'Nunca repete informação que o lead já deu',
  'Nunca repete as mesmas palavras 2 turnos seguidos',
  'Nunca pergunta dado que já está no card',
  'Nunca empilha perguntas de temas diferentes na mesma mensagem',
  'Nunca assume resposta na pergunta',
  'Nunca justifica excessivamente uma pergunta',
  'Nunca culpa o cliente',
  'Zero travessões (—) ou hífens longos como separador',
  'Zero emoji na primeira mensagem',
  'Nunca usa clichês ("casamento dos sonhos", "deixe conosco")',
  'Nunca diz "vou passar/transferir/outra pessoa te atende"',
]

const DEFAULT_ACTIVE_BRAND_IDS = BRAND_BOUNDARIES_LIBRARY.map(b => b.id)

export function BoundariesSection({ agentId }: Props) {
  const { boundaries, isLoading, save } = useAgentBoundaries(agentId)
  const [brandActive, setBrandActive] = useState<string[]>(DEFAULT_ACTIVE_BRAND_IDS)
  const [competitors, setCompetitors] = useState<string[]>([])
  const [newCompetitor, setNewCompetitor] = useState('')
  const [dirty, setDirty] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (boundaries) {
      const fromBank = Array.isArray(boundaries.brand_active) ? boundaries.brand_active : null
      setBrandActive(fromBank ?? DEFAULT_ACTIVE_BRAND_IDS)
      setCompetitors(boundaries.competitors_to_avoid ?? [])
      setDirty(false)
    }
  }, [boundaries])
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleBoundary = (id: string) => {
    setBrandActive(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
    setDirty(true)
  }

  const addCompetitor = () => {
    const name = newCompetitor.trim()
    if (!name) return
    if (competitors.some(c => c.toLowerCase() === name.toLowerCase())) return
    setCompetitors(prev => [...prev, name])
    setNewCompetitor('')
    setDirty(true)
  }

  const removeCompetitor = (idx: number) => {
    setCompetitors(prev => prev.filter((_, i) => i !== idx))
    setDirty(true)
  }

  const handleSave = async () => {
    const cfg: BoundariesConfig = {
      brand_active: brandActive,
      competitors_to_avoid: competitors,
    }
    try {
      await save.mutateAsync(cfg)
      toast.success('Linhas vermelhas salvas')
      setDirty(false)
    } catch (err) {
      console.error('[BoundariesSection] save error:', err)
      toast.error('Não consegui salvar.')
    }
  }

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0">
          <Shield className="w-4 h-4 text-rose-600" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Linhas vermelhas</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            O que o agente NUNCA faz. Decisões de marca você escolhe; regras técnicas o sistema garante automaticamente.
          </p>
        </div>
      </div>

      {/* Grupo A — Decisões de marca (admin escolhe) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-slate-800 mb-1">Decisões de marca</h4>
        <p className="text-xs text-slate-500 mb-3">
          Você decide quais aplicar. Desligue uma se ela mudou no negócio da empresa.
        </p>
        <ul className="space-y-2">
          {BRAND_BOUNDARIES_LIBRARY.map(b => {
            const active = brandActive.includes(b.id)
            return (
              <li
                key={b.id}
                className={cn(
                  'rounded-lg border transition-colors',
                  active ? 'border-rose-200 bg-white' : 'border-slate-200 bg-slate-50/40'
                )}
              >
                <label className="flex items-start gap-3 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleBoundary(b.id)}
                    className="mt-0.5 flex-shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={cn('text-sm', active ? 'text-slate-900 font-medium' : 'text-slate-500')}>
                      {b.label}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{b.hint}</div>
                  </div>
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Concorrentes (chips) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-slate-800 mb-1">Concorrentes específicos a NUNCA mencionar pelo nome</h4>
        <p className="text-xs text-slate-500 mb-3">
          Adicione nomes específicos de concorrentes que o agente nunca deve citar. Funciona em conjunto com a linha "Nunca menciona concorrente por nome" acima.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {competitors.length === 0 && (
            <span className="text-[11px] text-slate-400 italic">(nenhum nome cadastrado)</span>
          )}
          {competitors.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs text-slate-700"
            >
              {c}
              <button
                type="button"
                onClick={() => removeCompetitor(i)}
                className="text-slate-400 hover:text-rose-600"
                title="Remover"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCompetitor}
            onChange={(e) => setNewCompetitor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCompetitor()
              }
            }}
            placeholder="Nome do concorrente"
            className="flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          />
          <Button onClick={addCompetitor} variant="outline" size="sm" className="gap-1">
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Grupo B — Regras técnicas (read-only) */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-3.5 h-3.5 text-slate-400" />
          <h4 className="text-sm font-semibold text-slate-700">Regras de conversa (sempre ativas)</h4>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Regras absolutas que o agente segue em qualquer momento. São inegociáveis — fazem parte do design do agente.
        </p>
        <ul className="space-y-1">
          {DESIGN_BOUNDARIES.map((d, i) => (
            <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
              <span className="text-slate-300 mt-0.5">•</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end pt-2 border-t border-slate-100">
        {dirty && <span className="text-xs text-amber-600 self-center mr-3">• alterações não salvas</span>}
        <Button onClick={handleSave} disabled={!dirty || save.isPending} size="sm" className="gap-1.5">
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
        </Button>
      </div>
    </div>
  )
}
