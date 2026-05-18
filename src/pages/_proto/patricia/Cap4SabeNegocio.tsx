/**
 * Capítulo 4 — O que ela sabe sobre seu negócio? (EDITÁVEL)
 */

import { useState } from 'react'
import { Calendar, Clock, BookOpen, ShieldCheck, GripVertical } from 'lucide-react'
import {
  Card, Pill, Btn, TextInput, ChapterHeader,
  RowActions, AddButton, InlineAdd, InlineEdit,
} from './Ui'
import { BUSINESS } from './data-real'

const DAY_LABEL: Record<string, string> = {
  mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
}

export function Cap4SabeNegocio() {
  const [steps, setSteps] = useState<string[]>(BUSINESS.process_steps)
  const [days, setDays] = useState<string[]>(BUSINESS.calendar_config.working_days)
  const [hours, setHours] = useState(BUSINESS.calendar_config.working_hours)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)

  const addStep = (text: string) => { setSteps([...steps, text]); setAdding(false) }
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i))
  const editStep = (i: number, text: string) => {
    setSteps(steps.map((s, idx) => idx === i ? text : s))
    setEditing(null)
  }
  const toggleDay = (d: string) => {
    setDays(days.includes(d) ? days.filter(x => x !== d) : [...days, d])
  }

  return (
    <article>
      <ChapterHeader
        num={4}
        total={7}
        title="O que ela sabe sobre seu negócio?"
        subtitle="Processo, agenda e base de conhecimento. Patricia consulta isso pra responder com a verdade."
      />

      <div className="space-y-5">
        <Card
          title={`O caminho do casamento Welcome (${steps.length} passos)`}
          hint="Patricia explica o caminho quando o cliente pergunta 'e agora?'."
          actions={<AddButton label="Adicionar passo" onClick={() => setAdding(true)} />}
        >
          <ol className="space-y-1">
            {steps.map((step, i) => (
              <li key={i} className="group flex items-start gap-3 px-2 py-2 rounded hover:bg-slate-50 transition-colors">
                <GripVertical className="w-3.5 h-3.5 text-slate-300 cursor-grab mt-1.5 flex-shrink-0" />
                <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 font-mono text-[11px] font-semibold grid place-items-center flex-shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 pt-1">
                  {editing === i ? (
                    <InlineEdit value={step} onSave={(v) => editStep(i, v)} onCancel={() => setEditing(null)} multiline />
                  ) : (
                    <p
                      className="text-[13px] text-slate-700 leading-relaxed cursor-pointer hover:text-indigo-700"
                      onClick={() => setEditing(i)}
                    >
                      {step}
                    </p>
                  )}
                </div>
                <RowActions onEdit={() => setEditing(i)} onRemove={() => removeStep(i)} />
              </li>
            ))}
            {adding && (
              <li className="pt-2 pl-12">
                <InlineAdd placeholder="Descrição do passo" onAdd={addStep} onCancel={() => setAdding(false)} multiline />
              </li>
            )}
          </ol>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 grid place-items-center flex-shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <h4 className="text-[13px] font-semibold text-slate-900">Política de preço</h4>
                <Pill tone="amber">never</Pill>
              </div>
              <p className="text-[12px] text-slate-600 mt-1.5 leading-relaxed">
                Patricia <strong>nunca apresenta preço</strong>. Quem fala valor é a especialista em destination wedding.
              </p>
              <select
                defaultValue="never"
                className="mt-2 px-2 py-1 text-[12px] bg-white border border-slate-200 rounded focus:ring-2 focus:ring-amber-100 outline-none"
              >
                <option value="never">never — Patricia nunca fala preço</option>
                <option value="after_qualify">after_qualify — só depois de qualificar</option>
                <option value="always">always — sempre fala</option>
              </select>
            </div>
          </div>
        </Card>

        <Card title="Quando Patricia pode agendar reuniões" hint="Janela em que ela oferece horários.">
          <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
            <div>
              <p className="flex items-center gap-2 text-[12px] text-slate-500 mb-1.5">
                <Clock className="w-3.5 h-3.5" />
                Horário comercial
              </p>
              <TextInput value={hours} onChange={(e) => setHours(e.target.value)} className="font-mono" />
            </div>
            <div>
              <p className="flex items-center gap-2 text-[12px] text-slate-500 mb-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Dias úteis (clique pra ligar/desligar)
              </p>
              <div className="flex gap-1">
                {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map(d => {
                  const active = days.includes(d)
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDay(d)}
                      className={`w-9 h-9 rounded-md grid place-items-center text-[11px] font-semibold transition-colors ${
                        active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {DAY_LABEL[d]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>

        <Card
          title="Base de conhecimento"
          hint="Documentos e FAQs que Patricia consulta."
          actions={<Btn variant="outline" icon={<BookOpen className="w-3 h-3" />}>Adicionar documento</Btn>}
        >
          <div className="bg-amber-50/40 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <BookOpen className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-amber-900">Nenhum documento carregado ainda</p>
              <p className="text-[12px] text-amber-800 mt-1 leading-relaxed">
                Sem base, Patricia responde tudo do prompt principal — menos preciso.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </article>
  )
}
