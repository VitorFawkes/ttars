import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Store, Plus, Trash2, X, Search, MapPin, Pencil } from 'lucide-react'
import { setorIcon } from '../../lib/planejamento/setorIcons'
import { useFornecedorBank } from '../../hooks/planejamento/useFornecedorBank'
import { FORNECEDOR_SETORES, type FornecedorBankEntry } from '../../hooks/planejamento/types'
import { WipBadge } from '../../components/planejamento/WipBadge'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export default function BancoFornecedoresPage() {
  const navigate = useNavigate()
  const { bank, add, remove, update } = useFornecedorBank()

  const [modal, setModal] = useState<{ edit: FornecedorBankEntry | null } | null>(null)
  const [search, setSearch] = useState('')
  const [setorFilter, setSetorFilter] = useState<string>('all')
  const [localFilter, setLocalFilter] = useState<string>('all')

  // Localizações distintas presentes no banco (para o filtro).
  const localizacoes = useMemo(() => {
    const set = new Set<string>()
    for (const e of bank) if (e.localizacao.trim()) set.add(e.localizacao.trim())
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
  }, [bank])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return bank.filter((e) => {
      if (setorFilter !== 'all' && e.setor !== setorFilter) return false
      if (localFilter !== 'all' && e.localizacao !== localFilter) return false
      if (!term) return true
      return (
        e.nome.toLowerCase().includes(term) ||
        (e.contato ?? '').toLowerCase().includes(term) ||
        e.localizacao.toLowerCase().includes(term)
      )
    })
  }, [bank, search, setorFilter, localFilter])

  // Agrupa por localização.
  const grouped = useMemo(() => {
    const map = new Map<string, FornecedorBankEntry[]>()
    for (const e of filtered) {
      const loc = e.localizacao.trim() || 'Sem localização'
      const list = map.get(loc) ?? []
      list.push(e)
      map.set(loc, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { sensitivity: 'base' }))
  }, [filtered])

  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={() => navigate('/planejamento')}
            className="mt-1 p-1.5 rounded-md hover:bg-slate-100 text-slate-500 shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-indigo-500" />
              <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Banco de fornecedores</h1>
              <WipBadge />
            </div>
            <p className="text-sm text-slate-500">
              Catálogo de fornecedores por localização e setor — reutilize entre os casamentos.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModal({ edit: null })}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" /> Adicionar ao banco
        </button>
      </header>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar fornecedor…"
            className="h-8 w-56 pl-8 pr-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <select
          value={setorFilter}
          onChange={(e) => setSetorFilter(e.target.value)}
          className="h-8 px-2.5 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="all">Todos os setores</option>
          {FORNECEDOR_SETORES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={localFilter}
          onChange={(e) => setLocalFilter(e.target.value)}
          className="h-8 px-2.5 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="all">Todas as localizações</option>
          {localizacoes.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          {filtered.length} {filtered.length === 1 ? 'fornecedor' : 'fornecedores'}
        </span>
      </div>

      {bank.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <Store className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">Banco vazio</h3>
          <p className="text-sm text-slate-500 mt-1.5">
            Cadastre fornecedores que você usa em vários casamentos — eles ficam disponíveis para reuso.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([loc, itens]) => (
            <section key={loc} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <header className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
                <MapPin className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">{loc}</h2>
                <span className="font-mono text-[11px] px-1.5 h-5 inline-flex items-center rounded-md font-semibold tabular-nums bg-slate-100 text-slate-600 border border-slate-200">
                  {itens.length}
                </span>
              </header>
              <ul className="divide-y divide-slate-100">
                {itens.map((e) => {
                  const icon = setorIcon(e.setor)
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        {icon ? (
                          <img src={icon} alt="" aria-hidden className="w-7 h-7 object-contain shrink-0" />
                        ) : (
                          <span className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200 inline-flex items-center justify-center shrink-0">
                            <Store className="w-3.5 h-3.5 text-slate-400" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{e.nome}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {[e.setor, e.contato, e.valor != null ? brl.format(e.valor) : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setModal({ edit: e })}
                          className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                          title="Editar"
                          aria-label={`Editar ${e.nome}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove.mutate(e.id)}
                          disabled={remove.isPending}
                          className="p-1.5 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          title="Remover do banco"
                          aria-label={`Remover ${e.nome}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          {grouped.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">Nenhum fornecedor com esses filtros.</p>
          )}
        </div>
      )}

      {modal && (
        <AddBankModal
          key={modal.edit?.id ?? 'new'}
          initial={modal.edit}
          existing={bank}
          saving={add.isPending || update.isPending}
          onClose={() => setModal(null)}
          onEditExisting={(e) => setModal({ edit: e })}
          onSubmit={(payload) => {
            if (modal.edit) {
              update.mutate({ ...modal.edit, ...payload }, { onSuccess: () => setModal(null) })
            } else {
              add.mutate(payload, { onSuccess: () => setModal(null) })
            }
          }}
        />
      )}
    </div>
  )
}

const FIELD_CLS =
  'w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'

function AddBankModal({
  initial,
  existing,
  saving,
  onClose,
  onEditExisting,
  onSubmit,
}: {
  initial?: FornecedorBankEntry | null
  existing: FornecedorBankEntry[]
  saving: boolean
  onClose: () => void
  onEditExisting: (entry: FornecedorBankEntry) => void
  onSubmit: (payload: Omit<FornecedorBankEntry, 'id'>) => void
}) {
  const isEdit = !!initial
  const [setor, setSetor] = useState(initial?.setor ?? FORNECEDOR_SETORES[0] ?? '')
  const [nome, setNome] = useState(initial?.nome ?? '')
  const [localizacao, setLocalizacao] = useState(initial?.localizacao ?? '')
  const [contato, setContato] = useState(initial?.contato ?? '')
  const [valor, setValor] = useState(initial?.valor != null ? String(initial.valor) : '')
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? '')

  // Busca por parecidos enquanto digita o nome — evita cadastrar o mesmo
  // fornecedor com nomes diferentes. Clicar abre o registro existente p/ editar.
  const parecidos = useMemo(() => {
    const termo = nome.trim().toLowerCase()
    return termo.length >= 2
      ? existing.filter((e) => e.id !== initial?.id && e.nome.toLowerCase().includes(termo)).slice(0, 5)
      : []
  }, [nome, existing, initial?.id])

  // Localizações já cadastradas — sugeridas no campo (autocomplete) p/ reusar
  // a mesma grafia em vez de criar variações ("Riviera Maya" vs "riviera maya").
  const locOptions = useMemo(
    () =>
      [...new Set(existing.map((e) => e.localizacao.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
      ),
    [existing],
  )

  const canSave = nome.trim().length > 0 && localizacao.trim().length > 0 && !!setor

  const handleSave = () => {
    if (!canSave) return
    const parsed = valor.trim() ? Number(valor.replace(/\./g, '').replace(',', '.')) : null
    onSubmit({
      nome: nome.trim(),
      setor,
      localizacao: localizacao.trim(),
      contato: contato.trim() || null,
      valor: parsed != null && !Number.isNaN(parsed) ? parsed : null,
      observacoes: observacoes.trim() || null,
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg rounded-xl flex flex-col max-h-[90vh]">
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? 'Editar fornecedor' : 'Adicionar ao banco'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          <label className="text-xs font-medium text-slate-700 block">
            Setor
            <select value={setor} onChange={(e) => setSetor(e.target.value)} className={FIELD_CLS}>
              {FORNECEDOR_SETORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-700 block">
            Nome / empresa *
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: DJ Marcos Eventos"
              className={FIELD_CLS}
            />
          </label>

          {parecidos.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 -mt-1">
              <p className="text-[11px] font-medium text-amber-800 mb-1">
                Já no banco — talvez seja um destes (clique para abrir):
              </p>
              <ul className="flex flex-col gap-0.5">
                {parecidos.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onEditExisting(m)}
                      className="w-full text-left text-xs px-2 py-1 rounded hover:bg-amber-100 text-slate-700"
                    >
                      <span className="font-medium">{m.nome}</span>
                      <span className="text-slate-500">
                        {' '}
                        · {m.setor}
                        {m.localizacao ? ` · ${m.localizacao}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label className="text-xs font-medium text-slate-700 block">
            Localização *
            <input
              value={localizacao}
              onChange={(e) => setLocalizacao(e.target.value)}
              placeholder="Ex.: Riviera Maya, Búzios, Itália…"
              className={FIELD_CLS}
              list="bank-localizacoes"
            />
            <datalist id="bank-localizacoes">
              {locOptions.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </label>
          <label className="text-xs font-medium text-slate-700 block">
            Contato (opcional)
            <input
              value={contato}
              onChange={(e) => setContato(e.target.value)}
              placeholder="telefone, e-mail ou @"
              className={FIELD_CLS}
            />
          </label>
          <label className="text-xs font-medium text-slate-700 block">
            Valor de referência (opcional)
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={FIELD_CLS}
            />
          </label>
          <label className="text-xs font-medium text-slate-700 block">
            Observações (opcional)
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Detalhes, condições, etc."
              className={FIELD_CLS}
            />
          </label>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-9 rounded-md px-3 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="inline-flex items-center justify-center h-9 rounded-md px-3 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
