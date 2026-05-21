/**
 * Atalhos — Saúde e Teste ao vivo.
 *
 * Saúde: dashboard de pendências, KPIs (placeholders honestos quando
 *        métricas não foram consultadas).
 * Teste: sandbox — chat fake pra simular conversa.
 */

import { ChevronLeft, AlertCircle, CheckCircle2, Send } from 'lucide-react'
import { useState } from 'react'
import { Card, Pill, Btn } from './Ui'
import { PATRICIA, METRICS, HANDOFF_SIGNALS, PHONE_LINES, BUSINESS } from './data-real'

// ─────────────────────────────────────────────────────────────────────────────
//  Saúde
// ─────────────────────────────────────────────────────────────────────────────

interface SaudeChecks {
  ok: { title: string; detail: string }[]
  attention: { title: string; detail: string }[]
}

function computeChecks(): SaudeChecks {
  const ok: SaudeChecks['ok'] = []
  const attention: SaudeChecks['attention'] = []

  // Persona length
  if (PATRICIA.persona.length < 80) {
    attention.push({
      title: 'Persona curta',
      detail: `Apenas ${PATRICIA.persona.length} caracteres. Patricia funciona melhor com 80-160 chars de contexto.`,
    })
  } else {
    ok.push({ title: 'Persona configurada', detail: PATRICIA.persona })
  }

  // Phone lines ativas
  const activeLines = PHONE_LINES.filter(l => l.ativa).length
  if (activeLines === 0) {
    attention.push({
      title: 'Nenhuma linha WhatsApp ativa',
      detail: 'Sem linha ativa, Patricia não recebe mensagens. Ative pelo menos uma no Capítulo 7.',
    })
  } else {
    ok.push({
      title: `${activeLines} linha${activeLines > 1 ? 's' : ''} WhatsApp ativa${activeLines > 1 ? 's' : ''}`,
      detail: PHONE_LINES.filter(l => l.ativa).map(l => l.label).join(' · '),
    })
  }

  // Handoff signals
  const activeSignals = HANDOFF_SIGNALS.filter(s => s.enabled).length
  if (activeSignals === 0) {
    attention.push({
      title: 'Nenhum sinal de handoff ativo',
      detail: 'Patricia nunca vai chamar um humano. Configure no Capítulo 6.',
    })
  } else {
    ok.push({
      title: `${activeSignals} sinais de handoff ativos`,
      detail: HANDOFF_SIGNALS.filter(s => s.enabled).map(s => s.slug.replace(/_/g, ' ')).join(', '),
    })
  }

  // Base de conhecimento
  attention.push({
    title: 'Base de conhecimento vazia',
    detail: 'Patricia não tem documentos carregados. Sem eles, ela depende só do system_prompt — menos preciso.',
  })

  // Agente ativo
  if (PATRICIA.ativa) {
    ok.push({ title: 'Patricia está ativa', detail: 'Atendendo mensagens nas linhas ativas.' })
  } else {
    attention.push({ title: 'Patricia está pausada', detail: 'Nenhuma mensagem está sendo processada.' })
  }

  return { ok, attention }
}

export function AtalhoSaude({ onClose }: { onClose: () => void }) {
  const checks = computeChecks()

  return (
    <article>
      <button
        onClick={onClose}
        className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-900 mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> voltar
      </button>

      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-500">Atalho</p>
        <h1 className="text-[24px] font-semibold text-slate-900 tracking-tight mt-1">Saúde da Patricia</h1>
        <p className="text-[14px] text-slate-500 mt-1 max-w-2xl leading-relaxed">
          O que está OK, o que precisa de atenção e como Patricia tem performado.
        </p>
      </header>

      <div className="space-y-5">
        {/* Métricas */}
        <Card title="Performance" hint="Conversas e qualidade da Patricia. Valores reais virão do banco quando integrar.">
          <div className="grid grid-cols-4 gap-3">
            {METRICS.map(m => (
              <div key={m.key} className="border border-slate-200 rounded-lg px-3 py-2.5 bg-white">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{m.label}</p>
                <p className="text-[18px] font-semibold text-slate-300 tabular-nums mt-1">{m.value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{m.window}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-3 px-1">
            Placeholders — métricas reais vêm de <code className="font-mono">ai_agent_hub_stats</code> e <code className="font-mono">ai_agent_metrics</code>.
          </p>
        </Card>

        {/* Pendências */}
        {checks.attention.length > 0 && (
          <Card
            title={`${checks.attention.length} ponto${checks.attention.length > 1 ? 's' : ''} de atenção`}
            hint="Coisas que melhoram a performance se você resolver."
          >
            <ul className="space-y-2">
              {checks.attention.map(c => (
                <li key={c.title} className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/40">
                  <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-amber-900">{c.title}</p>
                    <p className="text-[12px] text-amber-800 mt-0.5 leading-relaxed">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* OK */}
        {checks.ok.length > 0 && (
          <Card title={`${checks.ok.length} configurações OK`}>
            <ul className="space-y-1.5">
              {checks.ok.map(c => (
                <li key={c.title} className="flex items-start gap-3 py-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-slate-900">{c.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Teste ao vivo (sandbox)
// ─────────────────────────────────────────────────────────────────────────────

interface SandMsg {
  who: 'me' | 'patricia'
  text: string
}

const SAMPLE_REPLY = `Oi! Que bom que veio falar com a gente.

Antes da gente entrar nos detalhes, me conta uma coisa: o que vocês imaginam pro casamento? Tem alguma referência ou tipo de cenário que tá na cabeça?`

export function AtalhoTeste({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<SandMsg[]>([])
  const [draft, setDraft] = useState('')

  const send = () => {
    if (!draft.trim()) return
    setMsgs(m => [...m, { who: 'me', text: draft }])
    setDraft('')
    setTimeout(() => {
      setMsgs(m => [...m, { who: 'patricia', text: SAMPLE_REPLY }])
    }, 800)
  }

  return (
    <article>
      <button
        onClick={onClose}
        className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-900 mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> voltar
      </button>

      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-500">Atalho</p>
        <h1 className="text-[24px] font-semibold text-slate-900 tracking-tight mt-1">Testar ao vivo</h1>
        <p className="text-[14px] text-slate-500 mt-1 max-w-2xl leading-relaxed">
          Converse com a Patricia em um chat de teste. Nenhuma mensagem real é enviada.
        </p>
      </header>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <Pill tone="amber">demo</Pill>
          <p className="text-[11px] text-slate-500">
            Mensagem de resposta abaixo é mock — a versão real chama o router de IA com o prompt completo da {BUSINESS.company_name}.
          </p>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 min-h-[280px] space-y-3">
          {msgs.length === 0 && (
            <p className="text-[12px] text-slate-400 italic text-center py-10">
              Mande uma mensagem pra simular um noivo entrando em contato.
            </p>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.who === 'me' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line ${
                m.who === 'me'
                  ? 'bg-indigo-600 text-white rounded-br-md'
                  : 'bg-white border border-slate-200 text-slate-900 rounded-bl-md'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Oi, queria saber mais sobre casamento em Cartagena…"
            className="flex-1 px-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
          <Btn variant="primary" icon={<Send className="w-3.5 h-3.5" />} onClick={send}>
            Enviar
          </Btn>
        </div>
      </Card>
    </article>
  )
}
