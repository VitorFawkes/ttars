/**
 * Capítulo 3 — Sobre o que ela conversa? (EDITÁVEL)
 */

import { useState } from 'react'
import { GripVertical, Eye } from 'lucide-react'
import {
  Card, Pill, ChapterHeader,
  RowActions, AddButton, InlineAdd, InlineEdit,
} from './Ui'
import {
  MOMENTS, COLLECTED_FIELDS, SILENT_SIGNALS, BUSINESS,
  CONTACT_UPDATE_FIELDS, FORM_DATA_FIELDS, type Moment, type SilentSignal,
} from './data-real'

type FieldRow = typeof COLLECTED_FIELDS[number]

export function Cap3Conversa() {
  const [moments, setMoments] = useState<Moment[]>(MOMENTS)
  const [fields, setFields] = useState<FieldRow[]>(COLLECTED_FIELDS as FieldRow[])
  const [signals, setSignals] = useState<SilentSignal[]>(SILENT_SIGNALS)
  const [adding, setAdding] = useState<'moment' | 'field' | 'signal' | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const addMoment = (label: string) => {
    const key = label.toLowerCase().replace(/\s+/g, '_')
    setMoments([...moments, { key, label, order: moments.length + 1, kind: 'play', trigger: '(clique pra editar gatilho)' }])
    setAdding(null)
  }
  const removeMoment = (key: string) => setMoments(moments.filter(m => m.key !== key))
  const editMomentLabel = (key: string, label: string) => {
    setMoments(moments.map(m => m.key === key ? { ...m, label } : m))
    setEditing(null)
  }

  const addField = (label: string) => {
    const key = `ww_${label.toLowerCase().replace(/\s+/g, '_')}`
    setFields([...fields, { key, label, tipo: 'texto' } as FieldRow])
    setAdding(null)
  }
  const removeField = (key: string) => setFields(fields.filter(f => f.key !== key))

  const addSignal = (label: string) => {
    const key = label.toLowerCase().replace(/\s+/g, '_')
    setSignals([...signals, { key, label, hint: '(clique pra editar)', use: '(clique pra editar)' }])
    setAdding(null)
  }
  const removeSignal = (key: string) => setSignals(signals.filter(s => s.key !== key))

  const flowMoments = moments.filter(m => m.kind === 'flow').sort((a, b) => a.order - b.order)
  const playMoments = moments.filter(m => m.kind === 'play')

  return (
    <article>
      <ChapterHeader
        num={3}
        total={7}
        title="Sobre o que ela conversa?"
        subtitle="Por onde a conversa passa, o que ela descobre e o que registra silenciosamente."
      />

      <div className="space-y-5">
        <Card
          title={`Linha do tempo da conversa (${flowMoments.length} momentos)`}
          hint="Patricia atravessa esses passos em ordem."
          actions={<AddButton label="Adicionar momento" onClick={() => setAdding('moment')} />}
        >
          <ol className="space-y-1">
            {flowMoments.map((m, i) => (
              <li key={m.key} className="group flex items-center gap-3 px-2 py-2 rounded hover:bg-slate-50 transition-colors">
                <GripVertical className="w-3.5 h-3.5 text-slate-300 cursor-grab" />
                <span className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 font-mono text-[11px] font-semibold grid place-items-center">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  {editing === `moment:${m.key}` ? (
                    <InlineEdit value={m.label} onSave={(v) => editMomentLabel(m.key, v)} onCancel={() => setEditing(null)} />
                  ) : (
                    <p
                      className="text-[13px] font-medium text-slate-900 cursor-pointer hover:text-indigo-700"
                      onClick={() => setEditing(`moment:${m.key}`)}
                    >
                      {m.label}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">{m.trigger}</p>
                </div>
                <Pill tone="slate">fluxo</Pill>
                <RowActions onEdit={() => setEditing(`moment:${m.key}`)} onRemove={() => removeMoment(m.key)} />
              </li>
            ))}
          </ol>
        </Card>

        <Card
          title={`Jogadas situacionais (${playMoments.length} cenários)`}
          hint="Patricia ativa quando detecta o gatilho — sem entrar na linha do tempo."
        >
          <div className="grid grid-cols-2 gap-2.5">
            {playMoments.map(m => (
              <div key={m.key} className="group border border-slate-200 rounded-lg px-3 py-2.5 bg-white">
                <div className="flex items-center justify-between gap-2">
                  {editing === `moment:${m.key}` ? (
                    <InlineEdit value={m.label} onSave={(v) => editMomentLabel(m.key, v)} onCancel={() => setEditing(null)} />
                  ) : (
                    <p
                      className="text-[12px] font-semibold text-slate-900 cursor-pointer hover:text-indigo-700 flex-1"
                      onClick={() => setEditing(`moment:${m.key}`)}
                    >
                      {m.label}
                    </p>
                  )}
                  <Pill tone="violet">jogada</Pill>
                  <RowActions onRemove={() => removeMoment(m.key)} />
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{m.trigger}</p>
              </div>
            ))}
          </div>
          {adding === 'moment' && (
            <div className="mt-3">
              <InlineAdd placeholder="Nome do momento (ex: Objeção família resiste)" onAdd={addMoment} onCancel={() => setAdding(null)} />
            </div>
          )}
        </Card>

        <Card
          title={`Campos coletados (${fields.length})`}
          hint="O que Patricia descobre dos noivos e grava no card."
          actions={<AddButton label="Adicionar campo" onClick={() => setAdding('field')} />}
        >
          <ul className="divide-y divide-slate-100 -mx-5">
            {fields.map(f => (
              <li key={f.key} className="group px-5 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-900">{f.label}</p>
                  <p className="text-[11px] font-mono text-slate-400">{f.key}</p>
                </div>
                <Pill tone="slate">{f.tipo}</Pill>
                <RowActions onRemove={() => removeField(f.key)} />
              </li>
            ))}
            {adding === 'field' && (
              <li className="px-5 py-3">
                <InlineAdd placeholder="Nome do campo (ex: Vai ter cerimônia religiosa)" onAdd={addField} onCancel={() => setAdding(null)} />
              </li>
            )}
          </ul>
        </Card>

        <Card
          title={`Sinais silenciosos (${signals.length})`}
          hint="Patricia detecta mas NÃO comenta — só grava."
          actions={<AddButton label="Adicionar sinal" onClick={() => setAdding('signal')} />}
        >
          <div className="space-y-3">
            {signals.map(s => (
              <div key={s.key} className="group flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/40">
                <Eye className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-900">{s.label}</p>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    <strong>Detecta quando:</strong> {s.hint}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    <strong>Como usa:</strong> {s.use}
                  </p>
                </div>
                <RowActions onRemove={() => removeSignal(s.key)} />
              </div>
            ))}
            {adding === 'signal' && (
              <div>
                <InlineAdd placeholder="Nome do sinal (ex: Casal com dúvida sobre data)" onAdd={addSignal} onCancel={() => setAdding(null)} />
              </div>
            )}
          </div>
        </Card>

        <Card title="Outros campos que Patricia preenche" dense>
          <div className="grid grid-cols-2 divide-x divide-slate-100">
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                Do contato ({CONTACT_UPDATE_FIELDS.length})
              </p>
              <ul className="mt-2 space-y-0.5">
                {CONTACT_UPDATE_FIELDS.map(f => (
                  <li key={f} className="text-[12px] font-mono text-slate-600">{f}</li>
                ))}
              </ul>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                Do formulário ({FORM_DATA_FIELDS.length})
              </p>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                {FORM_DATA_FIELDS.slice(0, 4).join(', ')}… (+ {FORM_DATA_FIELDS.length - 4})
              </p>
            </div>
          </div>
        </Card>

        {BUSINESS.has_secondary_contacts && (
          <Card>
            <p className="text-[12px] text-slate-700">
              Patricia atende casal — o segundo contato ({BUSINESS.secondary_contact_role}) tem campos próprios:
              {' '}
              {BUSINESS.secondary_contact_fields.map(f => (
                <code key={f} className="font-mono bg-slate-100 px-1 rounded text-[11px] text-slate-900 ml-0.5">{f}</code>
              ))}
            </p>
          </Card>
        )}
      </div>
    </article>
  )
}
