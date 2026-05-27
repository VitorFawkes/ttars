import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Plus, Trash2, Users } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { PessoaRow } from './PessoaRow'
import type { Convite, Pessoa } from '../../../lib/convidados/types'

interface Props {
  convite: Convite
  isLast: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  onRenameConvite: (nome: string) => void
  onDeleteConvite: () => void
  onAddPessoa: () => void
  onDeletePessoa: (pessoa: Pessoa) => void
  onChangePessoa: (pessoa: Pessoa, patch: Partial<Pessoa>) => void
  onEnterCreate: () => void
}

const NOME_GENERICOS = new Set(['', 'Novo convite', 'Convite sem nome'])

export function ConviteGroup({
  convite, isLast, collapsed,
  onToggleCollapse, onRenameConvite, onDeleteConvite,
  onAddPessoa, onDeletePessoa, onChangePessoa, onEnterCreate,
}: Props) {
  const [nome, setNome] = useState(convite.nome)
  useEffect(() => setNome(convite.nome), [convite.nome])

  const handleNomeBlur = () => {
    const next = nome.trim()
    if (next !== convite.nome) onRenameConvite(next)
    setNome(next)
  }

  // Se o nome ainda é o default genérico (primeira vez), realça o input com hint visual
  const nomeVazio = NOME_GENERICOS.has(nome.trim())

  return (
    <section className="bg-white border-y border-ww-sand">
      <header className="grid items-center gap-2 px-3 py-2 bg-ww-cream/60 border-b border-ww-sand"
        style={{ gridTemplateColumns: '24px 24px 1fr auto auto auto' }}>
        <button type="button" className="text-ww-n400 hover:text-ww-n600 cursor-grab" title="Arrastar para reordenar" aria-label="Arrastar">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onToggleCollapse} className="text-ww-n500 hover:text-ww-n700" aria-label={collapsed ? 'Expandir' : 'Recolher'}>
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <div className="flex flex-col">
          <p
            className="text-[10px] uppercase tracking-[0.18em] text-ww-gold font-medium leading-none mb-0.5"
            title="Um convite agrupa pessoas que vão chegar juntas — tipo uma família, casal ou círculo de amigos."
          >
            Convite (grupo)
          </p>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={handleNomeBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
            placeholder="Família Silva, Padrinhos, Amigos da faculdade…"
            className={cn(
              'font-ww-serif italic text-lg bg-transparent border-b border-transparent focus:outline-none px-0.5 transition-colors',
              nomeVazio
                ? 'text-ww-n400 border-amber-300 placeholder:text-ww-n400 hover:border-amber-400 focus:border-ww-gold'
                : 'text-ww-n700 hover:border-ww-sand focus:border-ww-gold',
            )}
          />
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-ww-gold-soft text-ww-gold-ink">
          <Users className="w-3 h-3" />
          {convite.pessoas.length} {convite.pessoas.length === 1 ? 'pessoa' : 'pessoas'}
        </span>
        <button type="button" onClick={onAddPessoa}
          className="inline-flex items-center gap-1 px-2 h-7 text-[11px] font-medium rounded border border-ww-sand-dk text-ww-n600 hover:text-ww-gold-ink hover:border-ww-gold transition-colors">
          <Plus className="w-3 h-3" /> Pessoa
        </button>
        <button type="button" onClick={onDeleteConvite}
          className="p-1.5 rounded text-ww-n400 hover:text-ww-rosewood hover:bg-ww-rosewood-soft transition-colors"
          aria-label="Excluir convite" title="Excluir este grupo inteiro">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </header>

      {!collapsed && (
        <>
          <div className="divide-y divide-ww-cream">
            {convite.pessoas.map((p, idx) => (
              <PessoaRow
                key={p.id}
                index={idx + 1}
                pessoa={p}
                isLastOfLastGroup={isLast && idx === convite.pessoas.length - 1}
                canDelete={convite.pessoas.length > 1}
                onChange={(patch) => onChangePessoa(p, patch)}
                onDelete={() => onDeletePessoa(p)}
                onEnterCreate={onEnterCreate}
              />
            ))}
          </div>
          <div className="px-3 py-2">
            <button type="button" onClick={onAddPessoa}
              className={cn('w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded border border-dashed border-ww-sand-dk text-ww-n500 hover:text-ww-gold-ink hover:border-ww-gold hover:bg-ww-gold-soft/40 transition-colors')}>
              <Plus className="w-3.5 h-3.5" /> Adicionar mais alguém ao mesmo convite
            </button>
          </div>
        </>
      )}
    </section>
  )
}
