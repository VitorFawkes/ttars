/**
 * Patricia Redesign — Tab Playbook
 *
 * Substitui: src/components/ai-agent-v2/editor/playbook/TabPlaybook.tsx
 *
 * Mudanças vs hoje:
 *  - Toggle "Experimentar UI nova" REMOVIDO (v3 vira padrão único)
 *  - Accordion vertical de seções vira layout 2-col: nav de seções à esquerda,
 *    conteúdo da seção ativa à direita. Sem múltiplas seções abertas simultaneamente
 *    (que hoje gera a página gigante).
 *  - Cada seção mostra status (configurada / vazia / atenção) na própria nav
 *  - Header da aba ganha "Preview do prompt final" como ação principal
 *  - V1V2ComparisonCard vira modal acessível pelo header, não card grudado
 *  - Espaço pra "anotações" da seção (campo livre que vira comment no prompt)
 *
 * Resultado: Playbook deixa de ser uma página gigante com tudo aberto e vira
 * uma "workbench" focada em uma seção por vez, com contexto explícito de
 * onde aquela seção entra no prompt.
 */

import { useState } from 'react'
import {
  UserCircle, MessagesSquare, MessageSquareQuote,
  Eye, ChevronRight, CircleDot, CircleAlert, CircleCheck, FileCode,
  Sparkles, Save, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { TabFrame } from './01-MasterLayout'
import { FormCard, Field } from './02-TabIdentidade'

// ─────────────────────────────────────────────────────────────────────────────
//  Definição das seções
// ─────────────────────────────────────────────────────────────────────────────

type SectionKey = 'quem_ela_e' | 'como_ela_conversa' | 'exemplos'

type SectionStatus = 'complete' | 'partial' | 'empty'

interface SectionDef {
  key: SectionKey
  title: string
  subtitle: string
  icon: LucideIcon
  /** Em que bloco do prompt final isto vira texto */
  promptBlock: string
  status: SectionStatus
  /** Quantos sub-itens já configurados / total */
  progress?: { done: number; total: number }
}

const SECTIONS: SectionDef[] = [
  {
    key: 'quem_ela_e',
    title: 'Quem ela é',
    subtitle: 'Identidade, voz e linhas vermelhas',
    icon: UserCircle,
    promptBlock: '<persona> + <voz> + <limites>',
    status: 'complete',
    progress: { done: 8, total: 8 },
  },
  {
    key: 'como_ela_conversa',
    title: 'Como ela conversa',
    subtitle: 'Momentos, sondagem e pontuação',
    icon: MessagesSquare,
    promptBlock: '<roteiro> + <perguntas> + <criterios>',
    status: 'partial',
    progress: { done: 5, total: 9 },
  },
  {
    key: 'exemplos',
    title: 'Exemplos prontos',
    subtitle: 'Conversas de referência pra calibrar o tom',
    icon: MessageSquareQuote,
    promptBlock: '<few_shot_examples>',
    status: 'empty',
    progress: { done: 0, total: 5 },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
//  Componente principal
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

export function TabPlaybook({ agentId, agentName, companyName: _companyName }: Props) {
  const [active, setActive] = useState<SectionKey>('quem_ela_e')
  const [showPreview, setShowPreview] = useState(false)
  const [showCompare, setShowCompare] = useState(false)

  return (
    <TabFrame
      title="Playbook"
      description={`Como ${agentName || 'Patricia'} pensa, fala e qualifica. Cada seção vira um bloco do prompt final.`}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => setShowCompare(true)} className="gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Comparar com versão antiga
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)} className="gap-1.5">
            <FileCode className="w-3.5 h-3.5" />
            Ver prompt final
          </Button>
        </>
      }
    >
      {/* Banner de "saúde" do playbook */}
      <PlaybookHealthBanner />

      {/* 2-col: sub-nav + conteúdo */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5 items-start">

        {/* Sub-nav vertical */}
        <nav
          className="md:sticky md:top-[88px] bg-white border border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-1.5 space-y-0.5"
          aria-label="Seções do playbook"
        >
          {SECTIONS.map(s => (
            <SectionNavItem
              key={s.key}
              section={s}
              active={s.key === active}
              onClick={() => setActive(s.key)}
            />
          ))}

          <div className="px-2 pt-3 pb-1 mt-2 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Você está editando o <span className="font-mono text-slate-600">system_prompt</span>
              {' '}da Patricia. Cada seção vira um bloco do texto final.
            </p>
          </div>
        </nav>

        {/* Conteúdo da seção ativa */}
        <div className="space-y-5 min-w-0">
          {active === 'quem_ela_e' && <QuemElaESection agentId={agentId} />}
          {active === 'como_ela_conversa' && <ComoElaConversaSection agentId={agentId} />}
          {active === 'exemplos' && <ExemplosSection agentId={agentId} />}
        </div>
      </div>

      {/* Modais (referência — implementação real usa Radix Dialog) */}
      {showPreview && <PromptPreviewModal onClose={() => setShowPreview(false)} />}
      {showCompare && <ComparePromptModal onClose={() => setShowCompare(false)} />}
    </TabFrame>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Section nav item
// ─────────────────────────────────────────────────────────────────────────────

function SectionNavItem({
  section, active, onClick,
}: {
  section: SectionDef
  active: boolean
  onClick: () => void
}) {
  const Icon = section.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 group',
        active
          ? 'bg-indigo-50 shadow-[inset_2px_0_0_rgb(79,70,229)]'
          : 'hover:bg-slate-50',
      )}
    >
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
        active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200',
      )}>
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'text-[13px] font-medium truncate',
            active ? 'text-indigo-900' : 'text-slate-900',
          )}>
            {section.title}
          </span>
          <StatusDot status={section.status} />
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{section.subtitle}</p>
        {section.progress && (
          <div className="mt-1.5 flex items-center gap-2">
            <ProgressBar done={section.progress.done} total={section.progress.total} />
            <span className="text-[10px] font-mono text-slate-400 tabular-nums">
              {section.progress.done}/{section.progress.total}
            </span>
          </div>
        )}
      </div>

      <ChevronRight className={cn(
        'w-3.5 h-3.5 flex-shrink-0 transition-all mt-3',
        active ? 'text-indigo-400 opacity-100' : 'text-slate-300 opacity-0 group-hover:opacity-100',
      )} />
    </button>
  )
}

function StatusDot({ status }: { status: SectionStatus }) {
  if (status === 'complete') {
    return <CircleCheck className="w-3 h-3 text-emerald-500 flex-shrink-0" />
  }
  if (status === 'partial') {
    return <CircleDot className="w-3 h-3 text-amber-500 flex-shrink-0" />
  }
  return <CircleAlert className="w-3 h-3 text-slate-300 flex-shrink-0" />
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : (done / total) * 100
  return (
    <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={cn(
          'h-full rounded-full transition-all',
          done === total ? 'bg-emerald-500' : done > 0 ? 'bg-amber-500' : 'bg-slate-200',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Health banner
// ─────────────────────────────────────────────────────────────────────────────

function PlaybookHealthBanner() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-50/60 via-violet-50/40 to-transparent border border-indigo-200/40">
      <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-slate-900">
          Playbook completo em <span className="text-indigo-700 font-semibold">72%</span>
        </p>
        <p className="text-[11px] text-slate-500">
          4 sub-itens em "Como ela conversa" estão vazios. Sem eles, o prompt fica genérico.
        </p>
      </div>
      <Button variant="ghost" size="sm" className="text-[11px]">
        Continuar de onde parei →
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Seção: Quem ela é
// ─────────────────────────────────────────────────────────────────────────────

function QuemElaESection({ agentId: _ }: { agentId: string }) {
  return (
    <>
      <SectionHeader
        title="Quem ela é"
        promptBlock="<persona> + <voz> + <limites>"
        description="A base de personalidade. Tudo que segue herda desses 3 blocos."
      />

      <FormCard
        eyebrow="Bloco 1 de 3"
        title="Identidade"
        description="Missão da Patricia em uma frase e o que ela jamais é."
      >
        <Field
          label="Qual é a missão dela?"
          hint="Patricia preenche essa frase quando o cliente perguntar quem é ela."
        >
          <Textarea
            rows={3}
            placeholder="Ajudar casais a planejarem o casamento dos sonhos no exterior, escolhendo destino, fornecedores e logística."
            className="leading-relaxed"
          />
        </Field>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <Field label="Patricia é..." hint="3-5 adjetivos que a definem">
            <ChipList suggestions={['acolhedora', 'objetiva', 'experiente', 'discreta']} />
          </Field>
          <Field label="Patricia nunca é..." hint="Limites de personalidade">
            <ChipList suggestions={['agressiva', 'piegas', 'genérica']} variant="danger" />
          </Field>
        </div>
      </FormCard>

      <FormCard
        eyebrow="Bloco 2 de 3"
        title="Voz"
        description="Como ela soa. Frases típicas, frases proibidas, ritmo."
      >
        <PlaceholderEditor lines={['Frases típicas (até 10)', 'Frases proibidas (até 10)', 'Tom: formal/informal slider', 'Emojis: nunca / raramente / livre']} />
      </FormCard>

      <FormCard
        eyebrow="Bloco 3 de 3"
        title="Linhas vermelhas"
        description="O que ela NUNCA faz, em qualquer momento da conversa."
      >
        <PlaceholderEditor lines={[
          'Nunca dar preço sem antes qualificar',
          'Nunca prometer disponibilidade sem checar agenda',
          'Nunca discutir religião ou política',
          '+ Adicionar regra',
        ]} />
      </FormCard>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Seção: Como ela conversa
// ─────────────────────────────────────────────────────────────────────────────

function ComoElaConversaSection({ agentId: _ }: { agentId: string }) {
  return (
    <>
      <SectionHeader
        title="Como ela conversa"
        promptBlock="<roteiro> + <perguntas> + <criterios>"
        description="O jogo da conversa: momentos, sondagem e o que ela pontua silenciosamente."
      />

      <FormCard
        eyebrow="Bloco 1 de 3"
        title="Momentos da conversa"
        description="Fases do funil (descoberta → qualificação → agendamento) + jogadas situacionais (objeções, silêncio do cliente)."
      >
        <PlaceholderEditor lines={[
          'Fase 1 — Descoberta: como abrir, o que perguntar primeiro',
          'Fase 2 — Sondagem profunda: orçamento, datas, destino',
          'Fase 3 — Agendamento: fechar reunião com Wedding Planner',
          'Jogada: cliente some por 24h',
          'Jogada: cliente pede preço cedo demais',
          '+ Adicionar fase ou jogada',
        ]} />
      </FormCard>

      <FormCard
        eyebrow="Bloco 2 de 3"
        title="Perguntas de sondagem"
        description="Lista de informações que Patricia precisa coletar antes de agendar."
      >
        <PlaceholderEditor lines={[
          'Quando vocês querem casar? (data ou faixa)',
          'Quantos convidados aproximadamente?',
          'Destino dos sonhos ou aberto a sugestão?',
          'Orçamento total considerado?',
          '+ Adicionar pergunta',
        ]} />
      </FormCard>

      <FormCard
        eyebrow="Bloco 3 de 3"
        title="Critérios de qualificação"
        description="Pontuação silenciosa que define se é lead bom. Patricia não comenta com o cliente."
      >
        <PlaceholderEditor lines={[
          '+15 pts — orçamento ≥ R$ 50k',
          '+10 pts — casamento em até 18 meses',
          '−20 pts — não decidiu se quer no exterior',
          'Mínimo pra agendar: 30 pts',
          '+ Adicionar critério',
        ]} />
      </FormCard>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Seção: Exemplos
// ─────────────────────────────────────────────────────────────────────────────

function ExemplosSection({ agentId: _ }: { agentId: string }) {
  return (
    <>
      <SectionHeader
        title="Exemplos prontos"
        promptBlock="<few_shot_examples>"
        description="Conversas de referência. A IA aprende o tom imitando esses exemplos."
      />

      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/30 px-6 py-12 text-center">
        <MessageSquareQuote className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-[14px] font-medium text-slate-700">Nenhum exemplo cadastrado ainda</p>
        <p className="text-[12px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
          Cole 3-5 conversas reais (ou inventadas) que representem como Patricia deveria responder.
          Isso é o que mais melhora a qualidade do prompt.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button size="sm">+ Adicionar exemplo</Button>
          <Button variant="outline" size="sm">Importar do histórico</Button>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Section header (dentro do conteúdo da seção)
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({
  title, promptBlock, description,
}: {
  title: string
  promptBlock: string
  description: string
}) {
  return (
    <div className="pb-1">
      <div className="flex items-center gap-3">
        <h3 className="font-display text-[18px] font-medium text-slate-900 tracking-tight">
          {title}
        </h3>
        <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-[10px] text-slate-600 border border-slate-200/80">
          {promptBlock}
        </span>
      </div>
      <p className="text-[12px] text-slate-500 mt-1 leading-relaxed max-w-prose">
        {description}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Placeholders pra editores complexos (representam onde o conteúdo real vai)
// ─────────────────────────────────────────────────────────────────────────────

function PlaceholderEditor({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-1.5 text-[13px] text-slate-700">
      {lines.map((l, i) => (
        <li
          key={i}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border bg-white',
            l.startsWith('+')
              ? 'border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-700 cursor-pointer'
              : 'border-slate-200/80',
          )}
        >
          {!l.startsWith('+') && <CircleDot className="w-3 h-3 text-slate-300 flex-shrink-0" />}
          <span className="flex-1">{l}</span>
        </li>
      ))}
    </ul>
  )
}

function ChipList({
  suggestions, variant = 'default',
}: {
  suggestions: string[]
  variant?: 'default' | 'danger'
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {suggestions.map(s => (
        <span
          key={s}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border',
            variant === 'default'
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-rose-50 text-rose-700 border-rose-200',
          )}
        >
          {s}
        </span>
      ))}
      <button className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium border border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-700 transition-colors">
        + adicionar
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Modal de preview (estrutura mínima — implementação real usa Radix Dialog)
// ─────────────────────────────────────────────────────────────────────────────

function PromptPreviewModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-display text-[16px] font-medium text-slate-900 tracking-tight">
              Prompt final
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
              system_prompt · versão atual · ~1.450 tokens
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <pre className="font-mono text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-4 border border-slate-200/80">
{`# Patricia — SDR Welcome Weddings

<persona>
Você é a Patricia, consultora de casamentos no exterior...
</persona>

<voz>
Tom: acolhedor, objetivo, experiente.
Frases típicas: "Que ideia linda!", "Conta mais pra mim..."
Nunca usar: "Olá!" (genérico demais)
</voz>

<limites>
- Nunca dar preço sem antes qualificar
- Nunca prometer disponibilidade sem checar agenda
</limites>

<roteiro>
[...]
</roteiro>

<perguntas>
[...]
</perguntas>

<criterios>
+15 pts — orçamento ≥ R$ 50k
[...]
</criterios>

<few_shot_examples>
(nenhum exemplo cadastrado)
</few_shot_examples>`}
          </pre>
        </div>
        <footer className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-[11px] text-slate-500">
          <span>Atualiza ao salvar. Última atualização: <span className="font-mono">v12, agora</span></span>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Save className="w-3 h-3" />
            Exportar
          </Button>
        </footer>
      </div>
    </div>
  )
}

function ComparePromptModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-display text-[16px] font-medium text-slate-900 tracking-tight">
              Comparar Playbook
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Versão atual (Playbook) × Versão antiga (Clássico)
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
        </header>
        <div className="flex-1 grid grid-cols-2 divide-x divide-slate-100 overflow-auto">
          <div className="p-5">
            <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-indigo-600">
              Playbook atual
            </p>
            <pre className="mt-2 font-mono text-[11px] leading-relaxed text-slate-600 whitespace-pre-wrap">
{`<persona>
Patricia, consultora...
</persona>
[...]`}
            </pre>
          </div>
          <div className="p-5 bg-slate-50/30">
            <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-slate-500">
              Clássico (substituído)
            </p>
            <pre className="mt-2 font-mono text-[11px] leading-relaxed text-slate-500 whitespace-pre-wrap">
{`Você é uma assistente de viagens...`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
