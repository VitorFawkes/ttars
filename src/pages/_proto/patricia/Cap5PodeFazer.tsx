/**
 * Capítulo 5 — O que ela pode fazer sozinha? (EDITÁVEL)
 */

import { useState } from 'react'
import { Wrench, Zap, Search, X, type LucideIcon } from 'lucide-react'
import {
  Card, Toggle, ChapterHeader,
  RowActions, AddButton, InlineAdd,
} from './Ui'
import { SKILLS, AUTO_UPDATE_FIELDS, CONTACT_UPDATE_FIELDS, type Skill } from './data-real'

const CATEGORY_ICON: Record<'action' | 'data_retrieval', LucideIcon> = {
  action: Zap,
  data_retrieval: Search,
}

const CATEGORY_LABEL: Record<'action' | 'data_retrieval', string> = {
  action: 'Faz algo',
  data_retrieval: 'Consulta info',
}

export function Cap5PodeFazer() {
  const [skills, setSkills] = useState<Skill[]>(SKILLS)
  const [autoFields, setAutoFields] = useState<string[]>(AUTO_UPDATE_FIELDS)
  const [contactFields, setContactFields] = useState<string[]>(CONTACT_UPDATE_FIELDS)
  const [adding, setAdding] = useState<'skill' | 'auto' | 'contact' | null>(null)

  const addSkill = (name: string) => {
    const slug = name.toLowerCase().replace(/\s+/g, '_')
    setSkills([...skills, { nome: slug, descricao: name, categoria: 'action', enabled: true }])
    setAdding(null)
  }
  const removeSkill = (nome: string) => setSkills(skills.filter(s => s.nome !== nome))
  const toggleSkill = (nome: string, on: boolean) => {
    setSkills(skills.map(s => s.nome === nome ? { ...s, enabled: on } : s))
  }

  const addAutoField = (key: string) => { setAutoFields([...autoFields, key]); setAdding(null) }
  const removeAutoField = (key: string) => setAutoFields(autoFields.filter(f => f !== key))

  const addContactField = (key: string) => { setContactFields([...contactFields, key]); setAdding(null) }
  const removeContactField = (key: string) => setContactFields(contactFields.filter(f => f !== key))

  return (
    <article>
      <ChapterHeader
        num={5}
        total={7}
        title="O que ela pode fazer sozinha?"
        subtitle="Ações que Patricia executa direto, sem precisar pedir permissão pra um humano."
      />

      <div className="space-y-5">
        <Card
          title={`Ferramentas (${skills.filter(s => s.enabled).length} de ${skills.length} habilitadas)`}
          hint="Patricia decide quando usar cada uma conforme a conversa."
          actions={<AddButton label="Adicionar ferramenta" onClick={() => setAdding('skill')} />}
        >
          <ul className="space-y-2">
            {skills.map(s => {
              const Icon = CATEGORY_ICON[s.categoria]
              return (
                <li key={s.nome} className="group flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 grid place-items-center flex-shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[13px] font-semibold text-slate-900">{s.descricao}</p>
                      <code className="text-[10px] font-mono text-slate-400">{s.nome}</code>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{CATEGORY_LABEL[s.categoria]}</p>
                  </div>
                  <Toggle checked={s.enabled} onChange={(v) => toggleSkill(s.nome, v)} />
                  <RowActions onRemove={() => removeSkill(s.nome)} />
                </li>
              )
            })}
            {adding === 'skill' && (
              <li>
                <InlineAdd placeholder="Nome da ferramenta (ex: enviar SMS de confirmação)" onAdd={addSkill} onCancel={() => setAdding(null)} />
              </li>
            )}
          </ul>
        </Card>

        <Card
          title={`Campos do card que ela escreve (${autoFields.length})`}
          hint="Patricia atualiza esses campos conforme a conversa flui."
          actions={<AddButton label="Adicionar campo" onClick={() => setAdding('auto')} />}
        >
          <div className="flex flex-wrap gap-1.5">
            {autoFields.map(f => (
              <span key={f} className="group inline-flex items-center gap-1 text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-1 rounded">
                {f}
                <button
                  onClick={() => removeAutoField(f)}
                  className="opacity-30 group-hover:opacity-100 text-rose-600 hover:bg-rose-100 rounded transition-opacity"
                  aria-label="Remover"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
          {adding === 'auto' && (
            <div className="mt-3">
              <InlineAdd placeholder="Nome do campo (ex: ww_data_visita)" onAdd={addAutoField} onCancel={() => setAdding(null)} />
            </div>
          )}
        </Card>

        <Card
          title={`Campos do contato (${contactFields.length})`}
          hint="Dados do casal que Patricia preenche."
          actions={<AddButton label="Adicionar campo" onClick={() => setAdding('contact')} />}
        >
          <div className="flex flex-wrap gap-1.5">
            {contactFields.map(f => (
              <span key={f} className="group inline-flex items-center gap-1 text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-1 rounded">
                {f}
                <button
                  onClick={() => removeContactField(f)}
                  className="opacity-30 group-hover:opacity-100 text-rose-600 hover:bg-rose-100 rounded transition-opacity"
                  aria-label="Remover"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
          {adding === 'contact' && (
            <div className="mt-3">
              <InlineAdd placeholder="Nome do campo (ex: telefone_alternativo)" onAdd={addContactField} onCancel={() => setAdding(null)} />
            </div>
          )}
        </Card>

        <aside className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-[12px] text-slate-600 flex items-start gap-3">
          <Wrench className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="leading-relaxed">
            <strong className="text-slate-900">Importante:</strong> Patricia <strong>nunca inventa</strong> dados.
            Só grava o que o cliente diz explicitamente.
          </p>
        </aside>
      </div>
    </article>
  )
}
