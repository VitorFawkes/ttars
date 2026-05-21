/**
 * Capítulo 2 — Como ela fala? (EDITÁVEL)
 */

import { useState } from 'react'
import { MessageSquare, ShieldAlert, BookText } from 'lucide-react'
import {
  Card, Pill, Toggle, TextInput, Field, ChapterHeader,
  RowActions, AddButton, InlineAdd, InlineEdit,
} from './Ui'
import {
  PATRICIA, TONE_RULES, GOLDEN_RULE, FORMATTING, CROSS_SELL, HIDDEN_INSTRUCTIONS,
} from './data-real'

const MODE_LABEL: Record<'inbound' | 'outbound' | 'hybrid', { title: string; sub: string }> = {
  inbound: { title: 'O cliente fala primeiro', sub: 'Patricia só responde quando recebe mensagem.' },
  outbound: { title: 'Patricia fala primeiro', sub: 'Ela inicia a conversa após gatilho.' },
  hybrid: { title: 'Os dois', sub: 'Pode iniciar ou responder.' },
}

interface ToneRule { rule: string; on: boolean }

export function Cap2ComoFala() {
  const [mode, setMode] = useState<'inbound' | 'outbound' | 'hybrid'>(PATRICIA.interaction_mode)
  const [rules, setRules] = useState<ToneRule[]>(TONE_RULES)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [fallback, setFallback] = useState(PATRICIA.fallback_message)
  const [formatLine, setFormatLine] = useState(FORMATTING.rule)
  const [goldenBody, setGoldenBody] = useState(GOLDEN_RULE.body)

  const addRule = (text: string) => {
    setRules([...rules, { rule: text, on: true }])
    setAdding(false)
  }
  const removeRule = (i: number) => setRules(rules.filter((_, idx) => idx !== i))
  const editRule = (i: number, text: string) => {
    setRules(rules.map((r, idx) => idx === i ? { ...r, rule: text } : r))
    setEditing(null)
  }
  const toggleRule = (i: number, on: boolean) => {
    setRules(rules.map((r, idx) => idx === i ? { ...r, on } : r))
  }

  const modeData = MODE_LABEL[mode]
  const activeCount = rules.filter(r => r.on).length

  return (
    <article>
      <ChapterHeader
        num={2}
        total={7}
        title="Como ela fala?"
        subtitle="Quem começa a conversa, em que tom, o que ela NUNCA diz, e como formata as mensagens."
      />

      <div className="space-y-5">
        <Card title="Quem inicia a conversa">
          <div className="grid grid-cols-3 gap-2">
            {(['inbound', 'outbound', 'hybrid'] as const).map(m => {
              const sel = mode === m
              const d = MODE_LABEL[m]
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    sel ? 'border-indigo-500 bg-indigo-50/40' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className={`text-[13px] font-semibold ${sel ? 'text-indigo-900' : 'text-slate-900'}`}>
                      {d.title}
                    </p>
                    <span className={`w-3 h-3 rounded-full border ${
                      sel ? 'bg-indigo-600 border-indigo-600 ring-2 ring-white shadow-[0_0_0_1px_rgb(99,102,241)]' : 'border-slate-300'
                    }`} />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{d.sub}</p>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            Atual: <strong className="text-slate-700">{modeData.title}</strong>
          </p>
        </Card>

        <Card
          title={`Regras de tom (${activeCount} de ${rules.length} ativas)`}
          hint="Cada regra liga/desliga um comportamento."
          actions={<AddButton label="Adicionar regra" onClick={() => setAdding(true)} />}
        >
          <ul className="space-y-1">
            {rules.map((r, i) => (
              <li key={i} className="group flex items-center gap-3 py-1.5 px-2 rounded hover:bg-slate-50 transition-colors">
                <Toggle checked={r.on} onChange={(v) => toggleRule(i, v)} />
                <div className="flex-1 min-w-0">
                  {editing === i ? (
                    <InlineEdit value={r.rule} onSave={(v) => editRule(i, v)} onCancel={() => setEditing(null)} />
                  ) : (
                    <span className="text-[13px] text-slate-700 cursor-pointer hover:text-indigo-700" onClick={() => setEditing(i)}>
                      {r.rule}
                    </span>
                  )}
                </div>
                <RowActions onEdit={() => setEditing(i)} onRemove={() => removeRule(i)} />
              </li>
            ))}
            {adding && (
              <li className="pt-2">
                <InlineAdd placeholder="Ex: Nunca usar pontuação exagerada (!!!)" onAdd={addRule} onCancel={() => setAdding(false)} />
              </li>
            )}
          </ul>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 grid place-items-center flex-shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <h4 className="text-[13px] font-semibold text-slate-900">{GOLDEN_RULE.title}</h4>
                <Pill tone="amber">regra de ouro</Pill>
              </div>
              <Field label="Como Patricia responde quando perguntam preço">
                <textarea
                  rows={3}
                  value={goldenBody}
                  onChange={(e) => setGoldenBody(e.target.value)}
                  className="w-full px-3 py-2 text-[12px] bg-white border border-slate-200 rounded-md focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none leading-relaxed mt-2"
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-700 grid place-items-center flex-shrink-0">
              <BookText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <h4 className="text-[13px] font-semibold text-slate-900">{CROSS_SELL.title}</h4>
                <Pill tone="violet">cross-sell</Pill>
              </div>
              <p className="text-[12px] text-slate-600 mt-1.5 leading-relaxed">{CROSS_SELL.body}</p>
            </div>
          </div>
        </Card>

        <Card title="Formatação de mensagens" hint="Como Patricia quebra a resposta em mensagens.">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-700 grid place-items-center flex-shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <Field label="Regra principal">
                <TextInput value={formatLine} onChange={(e) => setFormatLine(e.target.value)} />
              </Field>
              <ul className="mt-3 space-y-0.5 text-[12px] text-slate-600">
                {FORMATTING.details.map(d => (
                  <li key={d} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-slate-400" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card title="Comportamentos invisíveis" hint="Patricia faz mas o cliente não percebe.">
          <div className="space-y-3">
            <div className="border border-slate-200 rounded-lg p-3">
              <h5 className="text-[12px] font-semibold text-slate-900">Handoff invisível</h5>
              <p className="text-[12px] text-slate-600 mt-1 leading-relaxed">{HIDDEN_INSTRUCTIONS.handoff_invisivel}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <h5 className="text-[12px] font-semibold text-slate-900">Desfecho quando não qualifica</h5>
              <p className="text-[12px] text-slate-600 mt-1 leading-relaxed">{HIDDEN_INSTRUCTIONS.desfecho_nao_qualifica}</p>
            </div>
          </div>
        </Card>

        <Card title="Frase de socorro" hint="Quando Patricia precisa ganhar tempo.">
          <Field label="Mensagem">
            <TextInput value={fallback} onChange={(e) => setFallback(e.target.value)} />
          </Field>
        </Card>
      </div>
    </article>
  )
}
