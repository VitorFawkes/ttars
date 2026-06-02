import { useMemo, useState } from 'react'
import {
  User, MessageSquare, Wallet, Zap, ShieldAlert, Eye, Loader2, CheckCircle, AlertCircle,
  Smile, Languages, Sparkles, Target, Coins, Info, ListOrdered, Search, Gauge,
  AlertTriangle, RotateCcw, Power, Code,
} from 'lucide-react'
import { PricingEditor } from '@/components/wsdr/editor/PricingEditor'
import { MomentsEditor } from '@/components/wsdr/editor/MomentsEditor'
import { PhasesEditor } from '@/components/wsdr/editor/PhasesEditor'
import { ScoringEditor } from '@/components/wsdr/editor/ScoringEditor'
import { OpeningEditor } from '@/components/wsdr/editor/OpeningEditor'
import { OpeningStepsEditor } from '@/components/wsdr/editor/OpeningStepsEditor'
import { BoundariesEditor } from '@/components/wsdr/editor/BoundariesEditor'
import { ClosersPicker } from '@/components/wsdr/editor/WeddingPlannerPicker'
import { CrmFieldsPicker } from '@/components/wsdr/editor/CrmFieldsPicker'
import { DaysField } from '@/components/wsdr/editor/DaysField'
import { StagePicker } from '@/components/wsdr/editor/StagePicker'
import { SofiaLayout, type SofiaTab } from '@/components/wsdr/editor/ui/SofiaLayout'
import { StringListEditor } from '@/components/wsdr/StringListEditor'
import { CapabilityCard } from '@/components/wsdr/editor/CapabilityCard'
import { KnowledgeFaqEditor } from '@/components/wsdr/editor/KnowledgeFaqEditor'
import { EditorCard, EditorSectionGroup, Field, InfoBanner } from '@/components/wsdr/editor/ui/primitives'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  type SofiaConfigV2, type SofiaCapabilities, type Tom, type CapabilityKey, type AberturaMode,
  TOM_OPTIONS, CAPABILITY_META, humanPromptPreview, computeSofiaWarnings, assembleSofiaPromptPreview, defaultSofiaConfig,
} from '@/components/wsdr/sofiaConfig'
import { useSofiaConfig } from '@/hooks/wsdr/useSofiaConfig'

// Helper tipado: liga/desliga uma capacidade sem brigar com a união de tipos.
function setCapEnabled(x: SofiaConfigV2, key: CapabilityKey, enabled: boolean): SofiaConfigV2 {
  return {
    ...x,
    capabilities: {
      ...x.capabilities,
      [key]: { ...(x.capabilities[key] as Record<string, unknown>), enabled },
    } as SofiaCapabilities,
  }
}

const TABS: SofiaTab[] = [
  { id: 'quem', label: 'Quem é a Sofia', icon: User },
  { id: 'conversa', label: 'Conversa', icon: MessageSquare },
  { id: 'pontuacao', label: 'Qualificação', icon: Gauge },
  { id: 'preco', label: 'Preço e valores', icon: Wallet },
  { id: 'faz', label: 'O que ela faz', icon: Zap },
  { id: 'regras', label: 'Pode e não pode', icon: ShieldAlert },
  { id: 'avancado', label: 'Avançado', icon: Eye },
]

export function SofiaEditor({ slug = 'sofia-weddings' }: { slug?: string }) {
  const { config, setConfig, loading, status, error, save } = useSofiaConfig(slug)
  const [tab, setTab] = useState('quem')
  const [dirty, setDirty] = useState(false)

  const update = (fn: (c: SofiaConfigV2) => SofiaConfigV2) => {
    setConfig(prev => (prev ? fn(prev) : prev))
    setDirty(true)
  }

  const handleSave = async (cfg: SofiaConfigV2) => {
    const ok = await save(cfg)
    if (ok) setDirty(false)
  }

  const preview = useMemo(() => (config ? humanPromptPreview(config) : ''), [config])
  const promptCru = useMemo(() => (config ? assembleSofiaPromptPreview(config) : ''), [config])
  const warnings = useMemo(() => (config ? computeSofiaWarnings(config) : []), [config])
  const [showCru, setShowCru] = useState(false)

  // Restaurar uma parte ao recomendado (rede de segurança do controle total).
  const restore = (key: keyof SofiaConfigV2) => {
    if (!confirm('Restaurar esta parte ao recomendado? Suas mudanças nela serão perdidas.')) return
    const def = defaultSofiaConfig()
    update(x => ({ ...x, [key]: def[key] }))
  }

  if (loading || !config) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-64 bg-slate-100 rounded animate-pulse" />
        <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  const c = config

  // capacidades separadas por status: prontas/em testes vs em breve (honestidade — nada finge)
  const capDisponiveis = CAPABILITY_META.filter(m => m.status !== 'em_breve')
  const capEmBreve = CAPABILITY_META.filter(m => m.status === 'em_breve')

  const renderCap = (meta: typeof CAPABILITY_META[number]) => {
    const cap = c.capabilities[meta.key]
    return (
      <CapabilityCard key={meta.key} icon={meta.icon} color={meta.color} title={meta.title} subtitle={meta.subtitle}
        description={meta.description} status={meta.status} enabled={cap.enabled}
        onToggle={v => update(x => setCapEnabled(x, meta.key, v))}>
        {meta.key === 'crm_write' && (
          <div className="space-y-3">
            <Field label="Campos que ela preenche no CRM" hint="Conforme o casal vai contando, a Sofia guarda essas informações no card. Marque só o que ela pode preencher.">
              <CrmFieldsPicker value={c.capabilities.crm_write.writable_fields} onChange={keys => update(x => ({ ...x, capabilities: { ...x.capabilities, crm_write: { ...x.capabilities.crm_write, writable_fields: keys } } }))} />
            </Field>
            <label className="flex items-center justify-between text-sm text-slate-700 pt-1 border-t border-slate-100">
              <span>Mover o card de etapa automaticamente</span>
              <Switch checked={c.capabilities.crm_write.stage_move_enabled} onCheckedChange={v => update(x => ({ ...x, capabilities: { ...x.capabilities, crm_write: { ...x.capabilities.crm_write, stage_move_enabled: v } } }))} className={c.capabilities.crm_write.stage_move_enabled ? 'bg-indigo-600' : ''} />
            </label>
            {c.capabilities.crm_write.stage_move_enabled && (
              <StagePicker
                value={c.capabilities.crm_write.target_stage_id}
                onChange={id => update(x => ({ ...x, capabilities: { ...x.capabilities, crm_write: { ...x.capabilities.crm_write, target_stage_id: id } } }))}
              />
            )}
          </div>
        )}
        {meta.key === 'calendar' && (() => {
          const cal = c.capabilities.calendar
          const updCal = (patch: Partial<typeof cal>) => update(x => ({ ...x, capabilities: { ...x.capabilities, calendar: { ...x.capabilities.calendar, ...patch } } }))
          const win = cal.windows?.[0] || { dias: [1, 2, 3, 4, 5], inicio: '10:00', fim: '17:00' }
          const updWin = (p: Partial<typeof win>) => updCal({ windows: [{ ...win, ...p }] })
          return (
            <div className="space-y-3">
              <ClosersPicker value={cal.closer_ids ?? []} onChange={ids => updCal({ closer_ids: ids })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Horário de início" hint="dias úteis"><Input value={win.inicio} onChange={e => updWin({ inicio: e.target.value })} placeholder="10:00" /></Field>
                <Field label="Horário de fim"><Input value={win.fim} onChange={e => updWin({ fim: e.target.value })} placeholder="17:00" /></Field>
                <Field label="Duração da reunião (min)"><Input type="number" value={cal.slot_duration_minutes} onChange={e => updCal({ slot_duration_minutes: Number(e.target.value) })} /></Field>
                <Field label="Intervalo (min)" hint="ex: 30 → 14h, 14h30"><Input type="number" value={cal.slot_interval_minutes ?? 30} onChange={e => updCal({ slot_interval_minutes: Number(e.target.value) })} /></Field>
                <Field label="Horários por dia (máx)"><Input type="number" value={cal.slots_per_day ?? 6} onChange={e => updCal({ slots_per_day: Number(e.target.value) })} /></Field>
                <Field label="Antecedência mínima (h)" hint="1 = pode hoje, ≥ agora+1h"><Input type="number" value={cal.min_lead_hours ?? 1} onChange={e => updCal({ min_lead_hours: Number(e.target.value) })} /></Field>
                <Field label="Dias à frente (máx)"><Input type="number" value={cal.search_window_days} onChange={e => updCal({ search_window_days: Number(e.target.value) })} /></Field>
                <Field label="Total de horários a oferecer"><Input type="number" value={cal.max_slots} onChange={e => updCal({ max_slots: Number(e.target.value) })} /></Field>
              </div>
              <label className="flex items-center justify-between text-sm text-slate-700"><span>Pular fins de semana</span><Switch checked={cal.skip_weekends} onCheckedChange={v => updCal({ skip_weekends: v })} className={cal.skip_weekends ? 'bg-indigo-600' : ''} /></label>
            </div>
          )
        })()}
        {meta.key === 'multimodal' && (
          <div className="space-y-2">
            {(['audio', 'image', 'pdf'] as const).map(k => (
              <label key={k} className="flex items-center justify-between text-sm text-slate-700">
                <span>{k === 'audio' ? 'Ouvir áudios' : k === 'image' ? 'Entender fotos' : 'Ler PDFs'}</span>
                <Switch checked={c.capabilities.multimodal[k]} onCheckedChange={v => update(x => ({ ...x, capabilities: { ...x.capabilities, multimodal: { ...x.capabilities.multimodal, [k]: v } } }))} className={c.capabilities.multimodal[k] ? 'bg-indigo-600' : ''} />
              </label>
            ))}
          </div>
        )}
        {meta.key === 'memory' && (
          <div className="space-y-3">
            <label className="flex items-center justify-between text-sm text-slate-700"><span>Responder em bolhas (mais humano)</span><Switch checked={c.capabilities.memory.bubbles_enabled} onCheckedChange={v => update(x => ({ ...x, capabilities: { ...x.capabilities, memory: { ...x.capabilities.memory, bubbles_enabled: v } } }))} className={c.capabilities.memory.bubbles_enabled ? 'bg-indigo-600' : ''} /></label>
            <Field label="Quantas mensagens lembrar"><Input type="number" value={c.capabilities.memory.window_messages} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, memory: { ...x.capabilities.memory, window_messages: Number(e.target.value) } } }))} /></Field>
            <Field label="Tempo de espera por novas mensagens (segundos)" hint="Quanto ela espera pra ver se o casal manda mais mensagens antes de responder. Ajuste se o comportamento sair diferente do esperado.">
              <Input type="number" value={Math.round((c.capabilities.memory.debounce_ms ?? 8000) / 1000)} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, memory: { ...x.capabilities.memory, debounce_ms: Math.max(1, Number(e.target.value)) * 1000 } } }))} />
            </Field>
            <Field label="Pausa entre as bolhas (segundos)" hint="O tempinho natural entre uma bolha e outra.">
              <Input type="number" step={0.5} value={(c.capabilities.memory.bubble_delay_ms ?? 1500) / 1000} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, memory: { ...x.capabilities.memory, bubble_delay_ms: Math.max(0, Number(e.target.value)) * 1000 } } }))} />
            </Field>
          </div>
        )}
        {meta.key === 'followup' && (
          <div className="space-y-3">
            <Field label="Quando retomar" hint="Depois de quantos dias sem resposta a Sofia tenta de novo. Pode ser mais de um momento.">
              <DaysField value={c.capabilities.followup.days ?? []} onChange={days => update(x => ({ ...x, capabilities: { ...x.capabilities, followup: { ...x.capabilities.followup, days } } }))} />
            </Field>
            <Field label="Horário padrão da retomada"><Input value={c.capabilities.followup.default_time} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, followup: { ...x.capabilities.followup, default_time: e.target.value } } }))} placeholder="ex: 10:30" /></Field>
          </div>
        )}
        {meta.key === 'knowledge' && (
          <KnowledgeFaqEditor agentSlug={slug} />
        )}
        {meta.key === 'handoff' && (
          <div className="space-y-3">
            <Field label="Quando passar pra um humano" hint="As situações em que a Sofia para de insistir e chama uma pessoa. Edite, adicione ou remova.">
              <StringListEditor items={c.capabilities.handoff.situations} onChange={items => update(x => ({ ...x, capabilities: { ...x.capabilities, handoff: { ...x.capabilities.handoff, situations: items } } }))} placeholder="ex: o casal pede pra falar com uma pessoa" />
            </Field>
            <Field label="O que ela diz ao passar" hint="Uma frase humana, sem prometer prazo.">
              <Input value={c.capabilities.handoff.transition_message} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, handoff: { ...x.capabilities.handoff, transition_message: e.target.value } } }))} />
            </Field>
            <Field label="Mover o card pra qual etapa ao passar (opcional)">
              <StagePicker value={c.capabilities.handoff.target_stage_id} onChange={id => update(x => ({ ...x, capabilities: { ...x.capabilities, handoff: { ...x.capabilities.handoff, target_stage_id: id } } }))} />
            </Field>
          </div>
        )}
      </CapabilityCard>
    )
  }

  return (
    <div className="space-y-6 pb-24">
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-1.5">
            <AlertTriangle className="w-4 h-4" />Avisos ({warnings.length})
          </div>
          <ul className="space-y-1 text-xs text-amber-800">
            {warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-0.5">{w.kind === 'risco' ? '⚠️' : '•'}</span><span>{w.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <SofiaLayout tabs={TABS} activeTab={tab} onTabChange={setTab}>
        {tab === 'quem' && (
          <>
            <EditorCard accent="indigo" icon={<User className="w-5 h-5" />} title="Identidade"
              desc="O nome da Sofia, a marca e como ela descreve a empresa durante a conversa.">
              <Field label="Nome da persona">
                <Input value={c.identity.persona_nome} onChange={e => update(x => ({ ...x, identity: { ...x.identity, persona_nome: e.target.value } }))} placeholder="ex: Sofia" />
              </Field>
              <Field label="Empresa / marca">
                <Input value={c.identity.empresa} onChange={e => update(x => ({ ...x, identity: { ...x.identity, empresa: e.target.value } }))} placeholder="ex: Welcome Weddings" />
              </Field>
              <Field label="Descrição da empresa" hint="A frase que a Sofia usa pra se apresentar e explicar o que vocês fazem. (A primeira mensagem fica na aba 'Como ela conversa'.)">
                <Textarea value={c.identity.proposta} onChange={e => update(x => ({ ...x, identity: { ...x.identity, proposta: e.target.value } }))} className="min-h-[80px]" />
              </Field>
              <Field label="Papel dela" hint="Como ela se apresenta na função. Já vem escrito; edite se quiser.">
                <Input value={c.identity.role ?? ''} onChange={e => update(x => ({ ...x, identity: { ...x.identity, role: e.target.value } }))} placeholder="ex: especialista de casamentos" />
              </Field>
              <Field label="Missão em uma frase" hint="O que ela existe pra fazer. Opcional — ajuda a guiar o tom.">
                <Input value={c.identity.mission_one_liner ?? ''} onChange={e => update(x => ({ ...x, identity: { ...x.identity, mission_one_liner: e.target.value } }))} placeholder="ex: entender o sonho do casal e conectar com a Wedding Planner" />
              </Field>
            </EditorCard>

            <EditorCard accent="violet" icon={<Smile className="w-5 h-5" />} title="Tom de voz" desc="O jeito da Sofia falar com os noivos.">
              <div className="flex flex-wrap gap-2">
                {TOM_OPTIONS.map(opt => {
                  const active = c.voice.tom === opt.value
                  return (
                    <button key={opt.value} type="button"
                      onClick={() => update(x => ({ ...x, voice: { ...x.voice, tom: opt.value as Tom } }))}
                      className={cn('px-3 py-2 rounded-lg border text-sm transition-all duration-150 active:scale-[0.97]', active ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300')}>
                      <span className="mr-1">{opt.emoji}</span>{opt.label}
                    </button>
                  )
                })}
              </div>
              <Field label={`Formalidade: ${c.voice.formalidade < 0.34 ? 'bem casual' : c.voice.formalidade > 0.66 ? 'mais formal' : 'natural'}`} hint="Da esquerda (casual, gírias leves) à direita (formal, sóbrio).">
                <input type="range" min={0} max={1} step={0.1} value={c.voice.formalidade}
                  onChange={e => update(x => ({ ...x, voice: { ...x.voice, formalidade: Number(e.target.value) } }))}
                  className="w-full accent-indigo-600" />
              </Field>
              <InfoBanner icon={<Info className="w-4 h-4" />}>Exemplo neste tom: <span className="italic text-slate-700">"{TOM_OPTIONS.find(t => t.value === c.voice.tom)?.exemplo}"</span></InfoBanner>
              <Field label="Temperos de tom" hint="Adjetivos que afinam a voz dela. Escreva os seus (ex: elegante, paciente, direta).">
                <StringListEditor items={c.voice.tone_tags ?? []} onChange={items => update(x => ({ ...x, voice: { ...x.voice, tone_tags: items } }))} placeholder="ex: elegante" />
              </Field>
            </EditorCard>

            <EditorCard accent="violet" icon={<Languages className="w-5 h-5" />} title="Glossário de voz" desc="Palavras que a Sofia deve usar e palavras que deve evitar.">
              <Field label="Palavras a USAR" hint="Ex: noivos, vocês, a gente.">
                <StringListEditor items={c.voice.glossary.marca} onChange={items => update(x => ({ ...x, voice: { ...x.voice, glossary: { ...x.voice.glossary, marca: items } } }))} placeholder="ex: noivos" />
              </Field>
              <Field label="Palavras/expressões a EVITAR" hint="Ex: parceiro, experiência inesquecível, premium.">
                <StringListEditor items={c.voice.glossary.proibida} onChange={items => update(x => ({ ...x, voice: { ...x.voice, glossary: { ...x.voice.glossary, proibida: items } } }))} placeholder="ex: parceiro" />
              </Field>
              <Field label="Regras de tom" hint="Jeitos de falar que ela sempre segue. Já vêm algumas; edite, adicione ou remova.">
                <StringListEditor items={c.voice.rules ?? []} onChange={items => update(x => ({ ...x, voice: { ...x.voice, rules: items } }))} placeholder='ex: use "a gente", nunca "nós"' />
              </Field>
              <Field label="Frases típicas dela" hint="Frases que ela costuma usar, pra calibrar o jeito. Opcional.">
                <StringListEditor items={c.voice.typical_phrases ?? []} onChange={items => update(x => ({ ...x, voice: { ...x.voice, typical_phrases: items } }))} placeholder="ex: que bom que vocês chamaram a gente" />
              </Field>
            </EditorCard>
          </>
        )}

        {tab === 'conversa' && (
          <>
            <EditorCard accent="sky" icon={<MessageSquare className="w-5 h-5" />} title="Mensagem de abertura"
              desc="A primeira coisa que a Sofia diz. Pode ser em PASSOS (ela pausa e espera a resposta, captura o que você definir) ou uma mensagem só.">
              <label className="flex items-center justify-between text-sm text-slate-700 mb-3 pb-3 border-b border-slate-100">
                <span>Abertura em passos <span className="text-xs text-slate-400">(pausa e espera a resposta a cada passo)</span></span>
                <Switch checked={c.voice.opening_stepped ?? false} onCheckedChange={v => update(x => ({ ...x, voice: { ...x.voice, opening_stepped: v } }))} className={(c.voice.opening_stepped ?? false) ? 'bg-indigo-600' : ''} />
              </label>
              {(c.voice.opening_stepped ?? false) ? (
                <OpeningStepsEditor steps={c.voice.opening_steps ?? []} onChange={steps => update(x => ({ ...x, voice: { ...x.voice, opening_steps: steps } }))} />
              ) : (
                <OpeningEditor
                  mode={c.voice.abertura_mode ?? 'directive'}
                  abertura={c.voice.abertura}
                  onChange={patch => update(x => ({ ...x, voice: { ...x.voice, ...patch as { abertura_mode?: AberturaMode; abertura?: string } } }))}
                />
              )}
            </EditorCard>
            <EditorCard accent="sky" icon={<ListOrdered className="w-5 h-5" />} title="Roteiro da conversa"
              desc="A ORDEM que a Sofia conduz (apresentar → sondar → qualificar → convidar). Em cada etapa você explica o que ela faz e o ritmo. Arraste pra reordenar.">
              <PhasesEditor phases={c.phases} onChange={items => update(x => ({ ...x, phases: items }))} />
            </EditorCard>
            <InfoBanner icon={<Search className="w-4 h-4" />}>
              O que a Sofia descobre (e como pergunta) agora mora junto da nota, na aba <strong>Qualificação</strong> — cada critério traz o alvo + a pergunta.
            </InfoBanner>
            <EditorCard accent="sky" icon={<Sparkles className="w-5 h-5" />} title="Momentos da conversa"
              desc="Reações que valem em QUALQUER fase (ex: quando perguntam preço, quando citam a família).">
              <MomentsEditor moments={c.moments} onChange={items => update(x => ({ ...x, moments: items }))} />
            </EditorCard>
          </>
        )}

        {tab === 'pontuacao' && (
          <>
            <EditorCard accent="indigo" icon={<Target className="w-5 h-5" />} title="Pontuação do casal"
              desc="Como a Sofia decide se o casal qualifica: pontos por critério, nota mínima e faixas. Ela usa isto como guia do julgamento, uma coisa de cada vez.">
              <ScoringEditor qual={c.qualification} onChange={q => update(x => ({ ...x, qualification: q }))} />
            </EditorCard>
            <EditorCard accent="violet" icon={<Eye className="w-5 h-5" />} title="Sinais que ela percebe sozinha"
              desc="Coisas que a Sofia capta no que o casal diz, sem precisar perguntar (ex: a família está ajudando a decidir, hesitação por valor). Ela leva isso em conta no julgamento e na hora de conduzir.">
              <StringListEditor items={c.qualification.silent_signals ?? []} onChange={items => update(x => ({ ...x, qualification: { ...x.qualification, silent_signals: items } }))} placeholder="ex: a família está ajudando a decidir" />
            </EditorCard>
          </>
        )}

        {tab === 'preco' && (
          <>
            <EditorCard accent="emerald" icon={<Wallet className="w-5 h-5" />} title="Preço e valores"
              desc="A Sofia pode falar de valor (assessoria + faixas por destino) e nunca negocia. Você decide quando e como ela revela.">
              <PricingEditor pricing={c.pricing} onChange={p => update(x => ({ ...x, pricing: p }))} />
            </EditorCard>
            <EditorCard accent="emerald" icon={<Coins className="w-5 h-5" />} title="Orçamento do casal"
              desc="Faixas que a Sofia oferece pro casal escolher quando ele não quer dizer um número. Isto é o orçamento DELES, não quanto a gente cobra.">
              <StringListEditor items={c.qualification.faixas_orcamento} onChange={items => update(x => ({ ...x, qualification: { ...x.qualification, faixas_orcamento: items } }))} placeholder="ex: R$ 80 a 150 mil" />
            </EditorCard>
          </>
        )}

        {tab === 'faz' && (
          <>
            <InfoBanner icon={<Info className="w-4 h-4" />}>
              Ligue as capacidades que a Sofia pode usar. Quando desligadas, ela só conversa.
            </InfoBanner>
            <div className="space-y-3">{capDisponiveis.map(renderCap)}</div>
            {capEmBreve.length > 0 && (
              <EditorSectionGroup label="Em breve" count={capEmBreve.length} defaultOpen={false}>
                <p className="text-xs text-slate-400 -mt-1 mb-1">Você já deixa configurado; entram no ar quando a fiação ficar pronta.</p>
                {capEmBreve.map(renderCap)}
              </EditorSectionGroup>
            )}
          </>
        )}

        {tab === 'regras' && (
          <>
            <EditorCard accent="rose" icon={<ShieldAlert className="w-5 h-5" />} title="O que a Sofia pode e não pode fazer"
              desc="Tudo é editável (controle total). As regras que protegem a qualidade mostram um aviso ao desligar, mas a decisão é sua."
              aside={<button type="button" onClick={() => restore('boundaries')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 shrink-0"><RotateCcw className="w-3.5 h-3.5" />Restaurar recomendado</button>}>
              <BoundariesEditor boundaries={c.boundaries} onChange={b => update(x => ({ ...x, boundaries: b }))} />
            </EditorCard>
            <EditorCard accent="rose" icon={<ShieldAlert className="w-5 h-5" />} title="Concorrentes a não citar"
              desc="Nomes que a Sofia nunca deve mencionar ou recomendar. Deixe vazio se não houver.">
              <StringListEditor items={c.boundaries.competitors_to_avoid ?? []} onChange={items => update(x => ({ ...x, boundaries: { ...x.boundaries, competitors_to_avoid: items } }))} placeholder="ex: nome de uma produtora concorrente" />
            </EditorCard>
          </>
        )}

        {tab === 'avancado' && (
          <>
            <EditorCard accent="slate" icon={<Power className="w-5 h-5" />} title="Ligar / desligar a Sofia"
              desc="Quando desligada, a Sofia não responde (mesmo recebendo mensagem). Hoje ela também está travada no seu número de teste.">
              <label className="flex items-center justify-between text-sm text-slate-700">
                <span>{(c.ativa ?? true) ? 'Sofia ligada' : 'Sofia desligada'}</span>
                <Switch checked={c.ativa ?? true} onCheckedChange={v => update(x => ({ ...x, ativa: v }))} className={(c.ativa ?? true) ? 'bg-emerald-600' : ''} />
              </label>
            </EditorCard>

            <EditorCard accent="slate" icon={<Eye className="w-5 h-5" />} title="O que a Sofia entende"
              desc="Resumo, em linguagem simples, de como a Sofia vai se comportar com as configurações atuais. Atualiza ao vivo."
              aside={<button type="button" onClick={() => setShowCru(s => !s)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 shrink-0"><Code className="w-3.5 h-3.5" />{showCru ? 'Ver resumo simples' : 'Ver prompt técnico'}</button>}>
              <pre className="bg-slate-50/70 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">{showCru ? promptCru : preview}</pre>
              {showCru && <p className="text-[11px] text-slate-400 mt-2">Prévia técnica da estrutura do cérebro com as suas configurações. Os blocos marcados FIXOS são o raciocínio da Camila e não mudam.</p>}
            </EditorCard>

            <EditorCard accent="slate" icon={<RotateCcw className="w-5 h-5" />} title="Restaurar tudo ao recomendado"
              desc="Volta TODA a configuração da Sofia aos valores recomendados. Use se algo saiu do controle.">
              <Button type="button" variant="outline" onClick={() => { if (confirm('Restaurar TODA a configuração ao recomendado? Suas mudanças serão perdidas.')) { update(() => defaultSofiaConfig()) } }}>
                <RotateCcw className="w-4 h-4 mr-2" />Restaurar tudo
              </Button>
            </EditorCard>
          </>
        )}
      </SofiaLayout>

      {/* Barra de salvar fixa — único indicador de "não salvo" */}
      <div className="fixed bottom-0 inset-x-0 z-10 bg-white/90 backdrop-blur border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {status === 'success' && <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle className="w-4 h-4" />Salvo</span>}
            {status === 'error' && <span className="flex items-center gap-1.5 text-red-700"><AlertCircle className="w-4 h-4" />{error || 'Erro ao salvar'}</span>}
            {status !== 'success' && status !== 'error' && dirty && <span className="text-amber-600">• alterações não salvas</span>}
          </div>
          <Button type="button" onClick={() => handleSave(c)} disabled={status === 'saving' || !dirty} className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 active:scale-[0.98] transition-transform">
            {status === 'saving' ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar configuração'}
          </Button>
        </div>
      </div>
    </div>
  )
}
