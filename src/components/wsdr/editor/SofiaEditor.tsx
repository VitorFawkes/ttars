import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  User, MessageSquare, Zap, ShieldAlert, Eye, Loader2, CheckCircle, AlertCircle, Sparkles, Wallet,
} from 'lucide-react'
import { PricingEditor } from '@/components/wsdr/editor/PricingEditor'
import { CriteriaEditor } from '@/components/wsdr/editor/CriteriaEditor'
import { MomentsEditor } from '@/components/wsdr/editor/MomentsEditor'
import { AgentEditorLayout, type EditorTab } from '@/components/ai-agent/editor/AgentEditorLayout'
import { StringListEditor } from '@/components/wsdr/StringListEditor'
import { CapabilityCard } from '@/components/wsdr/editor/CapabilityCard'
import { KnowledgeFaqEditor } from '@/components/wsdr/editor/KnowledgeFaqEditor'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  type SofiaConfigV2, type SofiaCapabilities, type Tom, type CapabilityKey,
  TOM_OPTIONS, CURATED_BOUNDARIES, CAPABILITY_META, humanPromptPreview,
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
  { id: 'preco', label: 'Preço', icon: Wallet },
  { id: 'faz', label: 'O que ela faz', icon: Zap },
  { id: 'vermelhas', label: 'Linhas vermelhas', icon: ShieldAlert },
  { id: 'avancado', label: 'Avançado', icon: Eye },
]

function Card({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">{icon}</span>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h3>
        </div>
        <p className="text-sm text-slate-500">{desc}</p>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-900 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
      {children}
    </div>
  )
}

export function SofiaEditor({ slug = 'sofia-weddings' }: { slug?: string }) {
  const { config, setConfig, loading, status, error, save } = useSofiaConfig(slug)
  const [tab, setTab] = useState('quem')
  const [dirty, setDirty] = useState(false)

  // reset dirty quando carrega/salva
  useEffect(() => { if (status === 'success') setDirty(false) }, [status])

  const update = (fn: (c: SofiaConfigV2) => SofiaConfigV2) => {
    setConfig(prev => (prev ? fn(prev) : prev))
    setDirty(true)
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

  return (
    <div className="space-y-6 pb-24">
      <AgentEditorLayout tabs={TABS.map(t => ({ ...t, dirty: dirty }))} activeTab={tab} onTabChange={setTab}>
        {tab === 'quem' && (
          <>
            <Card icon={<User className="w-4 h-4" />} title="Identidade" desc="Quem é a Sofia: nome, marca e a proposta que ela leva pros noivos.">
              <Field label="Nome da persona">
                <Input value={c.identity.persona_nome} onChange={e => update(x => ({ ...x, identity: { ...x.identity, persona_nome: e.target.value } }))} placeholder="ex: Sofia" />
              </Field>
              <Field label="Empresa / marca">
                <Input value={c.identity.empresa} onChange={e => update(x => ({ ...x, identity: { ...x.identity, empresa: e.target.value } }))} placeholder="ex: Welcome Weddings" />
              </Field>
              <Field label="Proposta (1-2 frases)" hint="O que a empresa faz de especial. A Sofia usa isso pra se apresentar.">
                <Textarea value={c.identity.proposta} onChange={e => update(x => ({ ...x, identity: { ...x.identity, proposta: e.target.value } }))} className="min-h-[80px]" />
              </Field>
            </Card>

            <Card icon={<Sparkles className="w-4 h-4" />} title="Tom de voz" desc="Como a Sofia fala com os noivos.">
              <div className="flex flex-wrap gap-2">
                {TOM_OPTIONS.map(opt => {
                  const active = c.voice.tom === opt.value
                  return (
                    <button key={opt.value} type="button"
                      onClick={() => update(x => ({ ...x, voice: { ...x.voice, tom: opt.value as Tom } }))}
                      className={cn('px-3 py-2 rounded-lg border text-sm transition-colors', active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300')}>
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
              <InfoBanner>Exemplo neste tom: <span className="italic text-slate-700">"{TOM_OPTIONS.find(t => t.value === c.voice.tom)?.exemplo}"</span></InfoBanner>
            </Card>

            <Card icon={<Sparkles className="w-4 h-4" />} title="Glossário de voz" desc="Palavras que a Sofia deve usar e palavras que deve evitar.">
              <Field label="Palavras a USAR" hint="Ex: noivos, vocês, a gente.">
                <StringListEditor items={c.voice.glossary.marca} onChange={items => update(x => ({ ...x, voice: { ...x.voice, glossary: { ...x.voice.glossary, marca: items } } }))} placeholder="ex: noivos" />
              </Field>
              <Field label="Palavras/expressões a EVITAR" hint="Ex: parceiro, experiência inesquecível, premium.">
                <StringListEditor items={c.voice.glossary.proibida} onChange={items => update(x => ({ ...x, voice: { ...x.voice, glossary: { ...x.voice.glossary, proibida: items } } }))} placeholder="ex: parceiro" />
              </Field>
            </Card>
          </>
        )}

        {tab === 'conversa' && (
          <>
            <Card icon={<MessageSquare className="w-4 h-4" />} title="Mensagem de abertura" desc="A primeira mensagem que a Sofia manda no primeiro contato.">
              <Textarea value={c.voice.abertura} onChange={e => update(x => ({ ...x, voice: { ...x.voice, abertura: e.target.value } }))} className="min-h-[140px]" />
            </Card>
            <Card icon={<MessageSquare className="w-4 h-4" />} title="Perguntas de qualificação" desc="Em ordem. A Sofia entende uma de cada vez, com naturalidade.">
              <StringListEditor items={c.qualification.etapas} onChange={items => update(x => ({ ...x, qualification: { ...x.qualification, etapas: items } }))} placeholder="ex: Qual é a data pretendida?" allowReorder />
            </Card>
            <Card icon={<MessageSquare className="w-4 h-4" />} title="Critérios da nota do casal" desc="O que a Sofia avalia pra dar uma nota (0 a 100) e decidir o que ainda falta perguntar.">
              <CriteriaEditor criteria={c.qualification.criteria} onChange={items => update(x => ({ ...x, qualification: { ...x.qualification, criteria: items } }))} />
            </Card>
            <Card icon={<MessageSquare className="w-4 h-4" />} title="Momentos da conversa" desc="Faça a Sofia falar ou agir de um jeito específico em certos momentos (ex: quando perguntam preço).">
              <MomentsEditor moments={c.moments} onChange={items => update(x => ({ ...x, moments: items }))} />
            </Card>
            <Card icon={<MessageSquare className="w-4 h-4" />} title="Faixas de orçamento" desc="A Sofia oferece estas faixas se o casal não quiser dizer um valor. Nunca pra falar quanto a gente cobra.">
              <StringListEditor items={c.qualification.faixas_orcamento} onChange={items => update(x => ({ ...x, qualification: { ...x.qualification, faixas_orcamento: items } }))} placeholder="ex: R$ 80 a 150 mil" />
            </Card>
          </>
        )}

        {tab === 'preco' && (
          <Card icon={<Wallet className="w-4 h-4" />} title="Preço e valor" desc="A Sofia pode falar de valor (assessoria + faixas por destino) e nunca negocia. Você decide quando e como ela revela.">
            <PricingEditor pricing={c.pricing} onChange={p => update(x => ({ ...x, pricing: p }))} />
          </Card>
        )}

        {tab === 'faz' && (
          <>
            <InfoBanner>
              Ligue as capacidades que a Sofia pode usar. Quando desligadas, ela só conversa. Algumas estão <strong>ligando em breve</strong> — você já deixa configurado e elas entram no ar assim que a fiação ficar pronta.
            </InfoBanner>
            {CAPABILITY_META.map(meta => {
              const cap = c.capabilities[meta.key]
              return (
                <CapabilityCard key={meta.key} icon={meta.icon} color={meta.color} title={meta.title} subtitle={meta.subtitle}
                  description={meta.description} status={meta.status} enabled={cap.enabled}
                  onToggle={v => update(x => setCapEnabled(x, meta.key, v))}>
                  {meta.key === 'crm_write' && (
                    <label className="flex items-center justify-between text-sm text-slate-700">
                      <span>Mover o card de etapa automaticamente</span>
                      <Switch checked={c.capabilities.crm_write.stage_move_enabled} onCheckedChange={v => update(x => ({ ...x, capabilities: { ...x.capabilities, crm_write: { ...x.capabilities.crm_write, stage_move_enabled: v } } }))} className={c.capabilities.crm_write.stage_move_enabled ? 'bg-indigo-600' : ''} />
                    </label>
                  )}
                  {meta.key === 'calendar' && (
                    <div className="space-y-3">
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
            })}
          </>
        )}

        {tab === 'vermelhas' && (
          <>
            <Card icon={<ShieldAlert className="w-4 h-4" />} title="Regras de marca" desc="O que a Sofia NUNCA faz. Ligue as que valem pro seu negócio.">
              <div className="space-y-2">
                {CURATED_BOUNDARIES.map(b => {
                  const on = c.boundaries.curadas[b.key] ?? b.defaultOn
                  return (
                    <div key={b.key} className={cn('flex items-start justify-between gap-3 p-3 rounded-lg border', on ? 'bg-rose-50/60 border-rose-200' : 'bg-white border-slate-200')}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{b.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{b.hint}</p>
                      </div>
                      <Switch checked={on} onCheckedChange={v => update(x => ({ ...x, boundaries: { ...x.boundaries, curadas: { ...x.boundaries.curadas, [b.key]: v } } }))} className={on ? 'bg-rose-600' : ''} />
                    </div>
                  )
                })}
              </div>
            </Card>
            <Card icon={<ShieldAlert className="w-4 h-4" />} title="Regras personalizadas" desc="Outras coisas específicas do seu negócio que a Sofia não pode fazer.">
              <StringListEditor items={c.boundaries.custom} onChange={items => update(x => ({ ...x, boundaries: { ...x.boundaries, custom: items } }))} placeholder="ex: Nunca dar o contato direto da Planner sem permissão" />
            </Card>
            <Card icon={<ShieldAlert className="w-4 h-4" />} title="Comportamentos proibidos" desc="Em linguagem simples: o que a Sofia nunca deve fazer ou revelar, ou um jeito de falar a evitar.">
              <StringListEditor items={c.boundaries.comportamentos} onChange={items => update(x => ({ ...x, boundaries: { ...x.boundaries, comportamentos: items } }))} placeholder="ex: nunca revele que somos uma IA; não prometa data sem confirmar" />
            </Card>
          </>
        )}

        {tab === 'avancado' && (
          <Card icon={<Eye className="w-4 h-4" />} title="O que a Sofia entende" desc="Resumo, em linguagem simples, de como a Sofia vai se comportar com as configurações atuais. Atualiza ao vivo.">
            <pre className="bg-slate-50/70 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">{preview}</pre>
          </Card>
        )}
      </AgentEditorLayout>

      {/* Barra de salvar fixa */}
      <div className="fixed bottom-0 inset-x-0 z-10 bg-white/90 backdrop-blur border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {status === 'success' && <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle className="w-4 h-4" />Salvo</span>}
            {status === 'error' && <span className="flex items-center gap-1.5 text-red-700"><AlertCircle className="w-4 h-4" />{error || 'Erro ao salvar'}</span>}
            {status !== 'success' && status !== 'error' && dirty && <span className="text-amber-600">• alterações não salvas</span>}
          </div>
          <Button type="button" onClick={() => save(c)} disabled={status === 'saving' || !dirty} className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50">
            {status === 'saving' ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar configuração'}
          </Button>
        </div>
      </div>
    </div>
  )
}
