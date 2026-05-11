import { useEffect, useState, useMemo, useRef } from 'react'
import { Loader2, Save, Plus, X, Sparkles, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAgentVoice, type VoiceConfig } from '@/hooks/playbook/useAgentVoice'
import { SuggestVariationsButton } from '../shared/SuggestVariationsButton'

const TONE_OPTIONS = ['empática', 'elegante', 'direta', 'formal', 'calorosa', 'descontraída', 'profissional', 'acolhedora', 'paciente', 'clara', 'objetiva']

/**
 * Presets de regras de tom — botões que o admin clica pra adicionar uma regra
 * pré-pronta na lista. Ele pode editar o texto depois ou remover.
 *
 * Diferente do antigo (toggle fixo): aqui são SUGESTÕES, não estrutura.
 * Admin pode ignorar todas e escrever do zero.
 */
const RULE_PRESETS: Array<{ category: string; label: string; rule: string }> = [
  // Emoji
  { category: 'Emoji', label: 'Sem emoji', rule: 'Nunca usa emoji.' },
  { category: 'Emoji', label: 'Emoji só após quebrar gelo', rule: 'Não usa emoji na primeira mensagem. Depois de rapport, no máximo 1 emoji por mensagem.' },
  { category: 'Emoji', label: 'Emoji à vontade', rule: 'Pode usar emoji livremente quando fizer sentido.' },
  // Pronomes
  { category: 'Pronome', label: '"A gente" no lugar de "nós"', rule: 'Diz "a gente" em vez de "nós".' },
  { category: 'Pronome', label: '"Vocês" para casal/grupo', rule: 'Trata casal/grupo como "vocês" (sem separar em "você e seu parceiro").' },
  { category: 'Pronome', label: 'Trata por "você" formal', rule: 'Sempre trata o cliente por "você", evita "tu".' },
  // Regionalismo
  { category: 'Regionalismo', label: 'Gerúndio natural', rule: 'Usa gerúndio natural ("tô vendo", "tô preparando").' },
  { category: 'Regionalismo', label: 'Casual com "cara/mano"', rule: 'Casual com "cara/mano" quando o cliente usar primeiro.' },
  { category: 'Regionalismo', label: 'Sotaque levemente carioca', rule: 'Sotaque levemente carioca no texto (ex: "tá", "né").' },
  // Saudação
  { category: 'Saudação', label: 'Cumprimenta pelo primeiro nome', rule: 'Sempre cumprimenta o cliente pelo primeiro nome quando disponível.' },
  { category: 'Saudação', label: 'Saudação por horário', rule: 'Adapta saudação ao horário ("Bom dia", "Boa tarde", "Boa noite").' },
  // Pontuação
  { category: 'Pontuação', label: 'Sem travessões', rule: 'Nunca usa travessão (—) como separador. Usa vírgula, ponto ou reticências.' },
  { category: 'Pontuação', label: 'Sem "??" duplo', rule: 'Nunca termina mensagem com "??" duplo ou triplo.' },
  // Conversa
  { category: 'Conversa', label: 'Conecta resposta com contexto', rule: 'Quando o cliente acabou de dar uma info forte no último turno (data, destino, número de pessoas, orçamento, estilo), usa essa info como ponte natural na próxima mensagem — seja pergunta, comentário ou proposta. Ex (pergunta): cliente diz "janeiro de 2027" → "Pra esse janeiro de 2027 lá fora, vocês já viajaram pra fora da América do Sul?". Ex (proposta): cliente diz "100 convidados no Nordeste" → "Pra esse formato, vale a gente marcar uma conversa pra desenhar o desenho?". Não força conexão artificial — se a próxima fala é sobre tema diferente, fala solto.' },
]

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

/**
 * Deriva regras a partir de campos legados (emoji_policy + regionalisms)
 * quando o agente ainda não foi migrado. Roda só uma vez na hidratação,
 * se `rules` estiver vazio mas os campos antigos populados.
 */
function deriveLegacyRules(voice: VoiceConfig): string[] {
  const out: string[] = []
  if (voice.emoji_policy === 'never') out.push('Nunca usa emoji.')
  else if (voice.emoji_policy === 'after_rapport') out.push('Não usa emoji na primeira mensagem. Depois de rapport, máximo 1 emoji por mensagem.')
  else if (voice.emoji_policy === 'anytime') out.push('Pode usar emoji livremente quando fizer sentido.')

  const r = voice.regionalisms ?? {}
  if (r.uses_a_gente) out.push('Diz "a gente" em vez de "nós".')
  if (r.uses_voces_casal) out.push('Trata casal/grupo como "vocês" (sem separar em "você e seu parceiro").')
  if (r.uses_gerundio) out.push('Usa gerúndio natural ("tô vendo").')
  if (r.casual_tu_mano) out.push('Casual com "cara/mano" quando o cliente usar primeiro.')
  return out
}

export function VoiceSection({ agentId, agentName, companyName }: Props) {
  const { voice, isLoading, save } = useAgentVoice(agentId)
  const [toneTags, setToneTags] = useState<string[]>([])
  const [formality, setFormality] = useState(3)
  const [rules, setRules] = useState<string[]>([])
  const [typical, setTypical] = useState<string[]>([])
  const [forbidden, setForbidden] = useState<string[]>([])
  const [editingRuleIdx, setEditingRuleIdx] = useState<number | null>(null)
  const [editingRuleText, setEditingRuleText] = useState('')
  const [newRule, setNewRule] = useState('')
  const [newTypical, setNewTypical] = useState('')
  const [newForbidden, setNewForbidden] = useState('')
  const [dirty, setDirty] = useState(false)
  const autoMigratedRef = useRef(false)

  // Hidrata estado local quando voice carrega/muda do servidor.
  // Migração automática: se rules está vazio mas emoji_policy/regionalisms
  // estão setados, deriva rules a partir deles E persiste silenciosamente
  // — admin não precisa clicar em Salvar pra migração acontecer.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (voice) {
      setToneTags(voice.tone_tags ?? [])
      setFormality(voice.formality ?? 3)
      const r = (voice.rules?.length ? voice.rules : voice.custom_rules) ?? []
      if (r.length === 0 && (voice.emoji_policy || voice.regionalisms) && !autoMigratedRef.current) {
        autoMigratedRef.current = true
        const derived = deriveLegacyRules(voice)
        setRules(derived)
        save.mutate({
          tone_tags: voice.tone_tags ?? [],
          formality: voice.formality ?? 3,
          rules: derived,
          typical_phrases: voice.typical_phrases ?? [],
          forbidden_phrases: voice.forbidden_phrases ?? [],
          emoji_policy: undefined,
          regionalisms: undefined,
          custom_rules: undefined,
        })
      } else {
        setRules(r)
      }
      setTypical(voice.typical_phrases ?? [])
      setForbidden(voice.forbidden_phrases ?? [])
      setDirty(false)
    }
  }, [voice, save])
  /* eslint-enable react-hooks/set-state-in-effect */

  const markDirty = () => setDirty(true)

  const toggleTone = (t: string) => {
    if (toneTags.includes(t)) {
      setToneTags(toneTags.filter(x => x !== t)); markDirty()
    } else if (toneTags.length < 3) {
      setToneTags([...toneTags, t]); markDirty()
    }
  }

  const addRule = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (rules.includes(trimmed)) {
      toast.info('Essa regra já está na lista')
      return
    }
    setRules([...rules, trimmed])
    markDirty()
  }

  const handleSave = async () => {
    const config: VoiceConfig = {
      tone_tags: toneTags,
      formality,
      rules,
      typical_phrases: typical,
      forbidden_phrases: forbidden,
      // Campos legados zerados quando salvo via UI nova — a partir daqui
      // a fonte de verdade é `rules`.
      emoji_policy: undefined,
      regionalisms: undefined,
      custom_rules: undefined,
    }
    try {
      await save.mutateAsync(config); toast.success('Voz salva'); setDirty(false)
    } catch (err) {
      console.error(err); toast.error('Não consegui salvar.')
    }
  }

  // Agrupa presets por categoria pro popover
  const presetsByCategory = useMemo(() => {
    const map = new Map<string, typeof RULE_PRESETS>()
    for (const p of RULE_PRESETS) {
      const arr = map.get(p.category) ?? []
      arr.push(p)
      map.set(p.category, arr)
    }
    return Array.from(map.entries())
  }, [])

  if (isLoading) {
    return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Tom */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Tom (até 3)</label>
        <div className="flex flex-wrap gap-1.5">
          {TONE_OPTIONS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTone(t)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-colors',
                toneTags.includes(t)
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Formalidade */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Formalidade: {formality}/5</label>
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          value={formality}
          onChange={(e) => { setFormality(Number(e.target.value)); markDirty() }}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>muito casual</span>
          <span>muito formal</span>
        </div>
      </div>

      {/* Regras de tom — totalmente editável */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Regras de tom <span className="text-slate-400 font-normal">({rules.length})</span>
            </label>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Como ela soa, como cumprimenta, como pontua. Você define quais regras existem aqui — pode tirar, trocar, adicionar.
            </p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Sugestões
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 max-h-96 overflow-y-auto">
              <div className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
                Clique pra adicionar à lista
              </div>
              {presetsByCategory.map(([category, items]) => (
                <div key={category} className="border-b border-slate-100 last:border-0">
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                    {category}
                  </div>
                  <ul className="pb-1">
                    {items.map((p, i) => {
                      const alreadyAdded = rules.includes(p.rule)
                      return (
                        <li key={i}>
                          <button
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => addRule(p.rule)}
                            className={cn(
                              'w-full text-left px-3 py-1.5 text-xs flex items-start gap-2 transition-colors',
                              alreadyAdded
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700',
                            )}
                          >
                            <Plus className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium">{p.label}</div>
                              <div className="text-slate-500 text-[10px] line-clamp-1">{p.rule}</div>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        {rules.length === 0 ? (
          <div className="text-center py-5 border-2 border-dashed border-slate-200 rounded-lg">
            <p className="text-xs text-slate-500">Nenhuma regra ainda. Adicione abaixo ou use as sugestões.</p>
          </div>
        ) : (
          <ul className="space-y-1.5 mb-2">
            {rules.map((r, i) => (
              <li
                key={i}
                className="bg-indigo-50/40 border border-indigo-100 rounded-lg px-3 py-2 flex items-start gap-2 group"
              >
                {editingRuleIdx === i ? (
                  <input
                    autoFocus
                    value={editingRuleText}
                    onChange={(e) => setEditingRuleText(e.target.value)}
                    onBlur={() => {
                      const trimmed = editingRuleText.trim()
                      if (trimmed && trimmed !== r) {
                        const next = [...rules]
                        next[i] = trimmed
                        setRules(next)
                        markDirty()
                      }
                      setEditingRuleIdx(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur()
                      } else if (e.key === 'Escape') {
                        setEditingRuleIdx(null)
                      }
                    }}
                    className="flex-1 text-sm bg-white border border-indigo-300 rounded px-2 py-0.5"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditingRuleIdx(i); setEditingRuleText(r) }}
                    className="flex-1 min-w-0 text-left text-sm text-slate-700 hover:text-indigo-700"
                    title="Clique pra editar"
                  >
                    {r}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setRules(rules.filter((_, j) => j !== i)); markDirty() }}
                  className="text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  aria-label="Remover regra"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addRule(newRule)
                setNewRule('')
              }
            }}
            placeholder='Ex: Sempre cumprimenta pelo primeiro nome'
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => { addRule(newRule); setNewRule('') }}
            disabled={!newRule.trim()}
            className="gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </Button>
        </div>
      </div>

      {/* Frases típicas */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-700">Frases típicas do agente</label>
          <SuggestVariationsButton
            text=""
            fieldType="typical_phrase"
            context={{ agent_nome: agentName, company_name: companyName, voice_tone_tags: toneTags, voice_formality: formality }}
            onSelect={(t) => { setTypical([...typical, t]); markDirty() }}
            label="Sugerir +"
          />
        </div>
        <ChipList items={typical} onRemove={(i) => { setTypical(typical.filter((_, j) => j !== i)); markDirty() }} />
        <div className="flex gap-2 mt-2">
          <input
            value={newTypical}
            onChange={(e) => setNewTypical(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (newTypical.trim()) { setTypical([...typical, newTypical.trim()]); setNewTypical(''); markDirty() }
              }
            }}
            placeholder="Ex: Que bom que você me chamou"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <Button size="sm" variant="outline" onClick={() => { if (newTypical.trim()) { setTypical([...typical, newTypical.trim()]); setNewTypical(''); markDirty() } }} className="gap-1">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Frases proibidas */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-700">Frases que NÃO é o agente</label>
          <SuggestVariationsButton
            text=""
            fieldType="forbidden_phrase"
            context={{ agent_nome: agentName, company_name: companyName }}
            onSelect={(t) => { setForbidden([...forbidden, t]); markDirty() }}
            label="Sugerir +"
          />
        </div>
        <ChipList
          items={forbidden}
          onRemove={(i) => { setForbidden(forbidden.filter((_, j) => j !== i)); markDirty() }}
          variant="danger"
        />
        <div className="flex gap-2 mt-2">
          <input
            value={newForbidden}
            onChange={(e) => setNewForbidden(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (newForbidden.trim()) { setForbidden([...forbidden, newForbidden.trim()]); setNewForbidden(''); markDirty() }
              }
            }}
            placeholder="Ex: Prezado cliente"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <Button size="sm" variant="outline" onClick={() => { if (newForbidden.trim()) { setForbidden([...forbidden, newForbidden.trim()]); setNewForbidden(''); markDirty() } }} className="gap-1">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2 border-t border-slate-100">
        {dirty && <span className="text-xs text-amber-600 self-center mr-3">• alterações não salvas</span>}
        <Button onClick={handleSave} disabled={!dirty || save.isPending} size="sm" className="gap-1.5">
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
        </Button>
      </div>
    </div>
  )
}

function ChipList({
  items, onRemove, variant = 'default',
}: {
  items: string[]
  onRemove: (i: number) => void
  variant?: 'default' | 'danger' | 'info'
}) {
  if (items.length === 0) return <p className="text-xs text-slate-400 italic">(nenhuma configurada)</p>
  const toneClass =
    variant === 'danger'
      ? 'bg-rose-50 border-rose-100 text-rose-700'
      : variant === 'info'
        ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
        : 'bg-slate-50 border-slate-200 text-slate-700'
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span key={i} className={cn('text-xs px-2 py-1 rounded-md border inline-flex items-center gap-1.5', toneClass)}>
          {t}
          <button type="button" onClick={() => onRemove(i)} className="hover:opacity-70">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  )
}
