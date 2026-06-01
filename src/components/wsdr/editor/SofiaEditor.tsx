import { useMemo, useState } from 'react'
import {
  User, MessageSquare, Wallet, Zap, ShieldAlert, Eye, Loader2, CheckCircle, AlertCircle,
  Smile, Languages, Sparkles, Target, Coins, Info, ListOrdered, Search, Gauge,
} from 'lucide-react'
import { PricingEditor } from '@/components/wsdr/editor/PricingEditor'
import { MomentsEditor } from '@/components/wsdr/editor/MomentsEditor'
import { PhasesEditor } from '@/components/wsdr/editor/PhasesEditor'
import { ScoringEditor } from '@/components/wsdr/editor/ScoringEditor'
import { DiscoverySlotsEditor } from '@/components/wsdr/editor/DiscoverySlotsEditor'
import { OpeningEditor } from '@/components/wsdr/editor/OpeningEditor'
import { BoundariesEditor } from '@/components/wsdr/editor/BoundariesEditor'
import { WeddingPlannerPicker } from '@/components/wsdr/editor/WeddingPlannerPicker'
import { StagePicker } from '@/components/wsdr/editor/StagePicker'
import { AgentEditorLayout, type EditorTab } from '@/components/ai-agent/editor/AgentEditorLayout'
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
  TOM_OPTIONS, CAPABILITY_META, humanPromptPreview,
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

const TABS: EditorTab[] = [
  { id: 'quem', label: 'Quem é a Sofia', icon: User },
  { id: 'conversa', label: 'Como ela conversa', icon: MessageSquare },
  { id: 'pontuacao', label: 'Pontuação', icon: Gauge },
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
            <label className="flex items-center justify-between text-sm text-slate-700">
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
        {meta.key === 'calendar' && (
          <div className="space-y-3">
            <WeddingPlannerPicker value={c.capabilities.calendar.wedding_planner_profile_id} onChange={id => update(x => ({ ...x, capabilities: { ...x.capabilities, calendar: { ...x.capabilities.calendar, wedding_planner_profile_id: id } } }))} />
            <Field label="Duração da reunião (min)"><Input type="number" value={c.capabilities.calendar.slot_duration_minutes} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, calendar: { ...x.capabilities.calendar, slot_duration_minutes: Number(e.target.value) } } }))} /></Field>
            <label className="flex items-center justify-between text-sm text-slate-700"><span>Pular fins de semana</span><Switch checked={c.capabilities.calendar.skip_weekends} onCheckedChange={v => update(x => ({ ...x, capabilities: { ...x.capabilities, calendar: { ...x.capabilities.calendar, skip_weekends: v } } }))} className={c.capabilities.calendar.skip_weekends ? 'bg-indigo-600' : ''} /></label>
          </div>
        )}
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
          </div>
        )}
        {meta.key === 'followup' && (
          <Field label="Horário padrão da retomada"><Input value={c.capabilities.followup.default_time} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, followup: { ...x.capabilities.followup, default_time: e.target.value } } }))} placeholder="ex: 10:30" /></Field>
        )}
        {meta.key === 'knowledge' && (
          <KnowledgeFaqEditor faqs={c.capabilities.knowledge.faqs}
            onChange={faqs => update(x => ({ ...x, capabilities: { ...x.capabilities, knowledge: { ...x.capabilities.knowledge, faqs } } }))} />
        )}
      </CapabilityCard>
    )
  }

  return (
    <div className="space-y-6 pb-24">
      <AgentEditorLayout tabs={TABS} activeTab={tab} onTabChange={setTab}>
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
            </EditorCard>

            <EditorCard accent="violet" icon={<Languages className="w-5 h-5" />} title="Glossário de voz" desc="Palavras que a Sofia deve usar e palavras que deve evitar.">
              <Field label="Palavras a USAR" hint="Ex: noivos, vocês, a gente.">
                <StringListEditor items={c.voice.glossary.marca} onChange={items => update(x => ({ ...x, voice: { ...x.voice, glossary: { ...x.voice.glossary, marca: items } } }))} placeholder="ex: noivos" />
              </Field>
              <Field label="Palavras/expressões a EVITAR" hint="Ex: parceiro, experiência inesquecível, premium.">
                <StringListEditor items={c.voice.glossary.proibida} onChange={items => update(x => ({ ...x, voice: { ...x.voice, glossary: { ...x.voice.glossary, proibida: items } } }))} placeholder="ex: parceiro" />
              </Field>
            </EditorCard>
          </>
        )}

        {tab === 'conversa' && (
          <>
            <EditorCard accent="sky" icon={<MessageSquare className="w-5 h-5" />} title="Mensagem de abertura"
              desc="A primeira coisa que a Sofia diz. Você escolhe se é um texto exato, só uma diretriz, ou se ela compõe sozinha.">
              <OpeningEditor
                mode={c.voice.abertura_mode ?? 'literal'}
                abertura={c.voice.abertura}
                onChange={patch => update(x => ({ ...x, voice: { ...x.voice, ...patch as { abertura_mode?: AberturaMode; abertura?: string } } }))}
              />
            </EditorCard>
            <EditorCard accent="sky" icon={<ListOrdered className="w-5 h-5" />} title="Roteiro da conversa"
              desc="A ORDEM que a Sofia conduz (apresentar → sondar → qualificar → convidar). Em cada etapa você explica o que ela faz e o ritmo. Arraste pra reordenar.">
              <PhasesEditor phases={c.phases} onChange={items => update(x => ({ ...x, phases: items }))} />
            </EditorCard>
            <EditorCard accent="amber" icon={<Search className="w-5 h-5" />} title="O que ela descobre"
              desc="Os dados que ela coleta: o que ela PERGUNTA (com prioridade e perguntas) e o que ela PERCEBE sozinha. Alimenta a pontuação.">
              <DiscoverySlotsEditor
                slots={c.qualification.discovery_slots ?? []}
                onSlotsChange={slots => update(x => ({ ...x, qualification: { ...x.qualification, discovery_slots: slots } }))}
                signals={c.qualification.silent_signals ?? []}
                onSignalsChange={sig => update(x => ({ ...x, qualification: { ...x.qualification, silent_signals: sig } }))}
              />
            </EditorCard>
            <EditorCard accent="sky" icon={<Sparkles className="w-5 h-5" />} title="Momentos da conversa"
              desc="Reações que valem em QUALQUER fase (ex: quando perguntam preço, quando citam a família).">
              <MomentsEditor moments={c.moments} onChange={items => update(x => ({ ...x, moments: items }))} />
            </EditorCard>
          </>
        )}

        {tab === 'pontuacao' && (
          <EditorCard accent="indigo" icon={<Target className="w-5 h-5" />} title="Pontuação do casal"
            desc="Como a Sofia decide se o casal qualifica: pontos por critério, nota mínima e faixas. Ela usa isto como guia do julgamento, uma coisa de cada vez.">
            <ScoringEditor qual={c.qualification} onChange={q => update(x => ({ ...x, qualification: q }))} />
          </EditorCard>
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
              desc="Tudo é editável (controle total). As regras que protegem a qualidade mostram um aviso ao desligar, mas a decisão é sua.">
              <BoundariesEditor boundaries={c.boundaries} onChange={b => update(x => ({ ...x, boundaries: b }))} />
            </EditorCard>
            <EditorCard accent="rose" icon={<ShieldAlert className="w-5 h-5" />} title="O que a Sofia nunca faz"
              desc="Em linguagem simples: comportamentos, promessas ou jeitos de falar que a Sofia deve evitar.">
              <StringListEditor items={c.boundaries.comportamentos} onChange={items => update(x => ({ ...x, boundaries: { ...x.boundaries, comportamentos: items } }))} placeholder="ex: não prometa data sem confirmar com a Planner" />
            </EditorCard>
          </>
        )}

        {tab === 'avancado' && (
          <EditorCard accent="slate" icon={<Eye className="w-5 h-5" />} title="O que a Sofia entende"
            desc="Resumo, em linguagem simples, de como a Sofia vai se comportar com as configurações atuais. Atualiza ao vivo.">
            <pre className="bg-slate-50/70 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">{preview}</pre>
          </EditorCard>
        )}
      </AgentEditorLayout>

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
