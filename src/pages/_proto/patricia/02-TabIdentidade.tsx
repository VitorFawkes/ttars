/**
 * Patricia Redesign — Tab Identidade
 *
 * Substitui: src/components/ai-agent-v2/editor/TabIdentidade.tsx
 *
 * Mudanças vs hoje:
 *  - O radio gigante "Clássico vs Playbook" SAI daqui (vai pra config legado)
 *  - Adiciona avatar/identidade visual (sutil — círculo com inicial)
 *  - Persona ganha textarea com hint sobre tom
 *  - Nome + Persona em grid 2-col em telas largas
 *  - "Agente ativo" vira card destacado com info clara de impacto
 *  - Migração legado vira CTA discreto no rodapé
 */

import { Bot, ChevronRight, Info } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/Button'
import { TabFrame } from './01-MasterLayout'

interface IdentityFormData {
  nome: string
  persona: string
  ativa: boolean
  playbook_enabled: boolean
}

interface Props {
  form: IdentityFormData
  setForm: (updater: (f: IdentityFormData) => IdentityFormData) => void
}

export function TabIdentidade({ form, setForm }: Props) {
  const isLegacy = !form.playbook_enabled
  const initial = (form.nome || 'A').trim().charAt(0).toUpperCase()

  return (
    <TabFrame
      title="Identidade"
      description="Como Patricia se apresenta para você e para os clientes."
    >
      {/* ── Bloco 1: Quem ela é ───────────────────────────────────────── */}
      <FormCard
        eyebrow="Bloco 1 de 2"
        title="Quem ela é"
        description="Nome interno (você usa pra reconhecer no hub) e como ela se apresenta nas conversas."
      >
        <div className="grid grid-cols-1 md:grid-cols-[88px_1fr] gap-5 items-start">

          {/* Avatar — visual de identidade */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-display text-2xl font-semibold shadow-[0_4px_12px_rgba(79,70,229,0.25)]">
              {initial}
            </div>
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-[0.06em]">
              Avatar
            </span>
          </div>

          <div className="space-y-4">
            <Field
              label="Nome do agente"
              hint="Não aparece pro cliente. Use o que faz sentido pra você."
              required
            >
              <Input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Patricia"
                className="font-display text-[15px]"
              />
            </Field>

            <Field
              label="Persona"
              hint="Como ela se descreve quando o cliente pergunta quem é. Mantenha curto."
            >
              <Textarea
                value={form.persona}
                onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
                placeholder="Consultora de casamentos no exterior, especialista em destinos europeus."
                rows={2}
                className="resize-none leading-relaxed"
              />
              <CharCounter value={form.persona} max={140} />
            </Field>
          </div>
        </div>
      </FormCard>

      {/* ── Bloco 2: Status ────────────────────────────────────────────── */}
      <FormCard
        eyebrow="Bloco 2 de 2"
        title="Está respondendo?"
        description="Quando desligada, nenhuma mensagem é processada — mesmo se houver linhas WhatsApp conectadas."
      >
        <div className="flex items-center justify-between gap-6 p-4 -m-2 rounded-lg hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              form.ativa
                ? 'bg-emerald-50 text-emerald-600 shadow-[inset_0_0_0_1px_rgb(167,243,208)]'
                : 'bg-slate-100 text-slate-400'
            }`}>
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-slate-900">
                {form.ativa ? 'Patricia está respondendo' : 'Patricia está pausada'}
              </p>
              <p className="text-[12px] text-slate-500 mt-0.5">
                {form.ativa
                  ? 'Toda mensagem que chegar nas linhas conectadas será respondida.'
                  : 'Mensagens são ignoradas até você ligar de novo.'}
              </p>
            </div>
          </div>

          <Switch
            checked={form.ativa}
            onCheckedChange={v => setForm(f => ({ ...f, ativa: v }))}
          />
        </div>
      </FormCard>

      {/* ── Rodapé: migração de modo (só se legado) ─────────────────────── */}
      {isLegacy && (
        <div className="border border-dashed border-amber-200 bg-amber-50/40 rounded-xl p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-amber-900">
              Esta Patricia ainda usa o modo Clássico
            </p>
            <p className="text-[11px] text-amber-700/80 mt-0.5 leading-relaxed">
              O Playbook moderno reorganiza o prompt em momentos da conversa, frases-âncora e
              linhas vermelhas — sem perder seus dados atuais.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-amber-900 hover:bg-amber-100/60 -mr-2">
            Migrar pro Playbook
            <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      )}
    </TabFrame>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Form primitives (reusados pelas outras abas)
// ─────────────────────────────────────────────────────────────────────────────

export function FormCard({
  eyebrow, title, description, children,
}: {
  eyebrow?: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <header className="px-6 pt-5 pb-4 border-b border-slate-100">
        {eyebrow && (
          <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-slate-400 mb-1.5">
            {eyebrow}
          </p>
        )}
        <h3 className="font-display text-[16px] font-medium text-slate-900 tracking-tight">
          {title}
        </h3>
        {description && (
          <p className="text-[12px] text-slate-500 mt-1 leading-relaxed max-w-prose">
            {description}
          </p>
        )}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

export function Field({
  label, hint, required, children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-[0.04em]">
        {label}
        {required && <span className="text-rose-600 ml-1">*</span>}
      </label>
      {children}
      {hint && (
        <p className="text-[11px] text-slate-500 leading-relaxed">{hint}</p>
      )}
    </div>
  )
}

function CharCounter({ value, max }: { value: string; max: number }) {
  const len = value.length
  const pct = len / max
  return (
    <div className="flex items-center justify-end gap-1.5 text-[10px] font-mono text-slate-400">
      <span className={pct > 0.9 ? 'text-amber-600' : pct > 1 ? 'text-rose-600' : ''}>
        {len}
      </span>
      <span>/</span>
      <span>{max}</span>
    </div>
  )
}
