import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Check, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
  useUpsertConvitePublic,
  useDeleteConvitePublic,
  useUpsertPessoaPublic,
  useDeletePessoaPublic,
} from '../../../hooks/convidados/casais/useListaCasalPublica'
import { calcStatsConvites } from '../../../lib/convidados/calcStatsConvites'
import { exportConvitesCSV, importConvitesCSV, downloadCSV } from '../../../lib/convidados/csvConvites'
import { StatsStrip } from './StatsStrip'
import { PlanilhaToolbar } from './PlanilhaToolbar'
import { ConviteGroup } from './ConviteGroup'
import type { Pessoa, Convite, LadoKey, TipoKey, CasalPublic } from '../../../lib/convidados/types'

interface Props {
  casal: CasalPublic
  convites: Convite[]
}

export function PlanilhaConvidados({ casal, convites }: Props) {
  const [search, setSearch] = useState('')
  const [filterLado, setFilterLado] = useState<LadoKey | ''>('')
  const [filterTipo, setFilterTipo] = useState<TipoKey | ''>('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const upsertConvite = useUpsertConvitePublic(casal.codigo)
  const deleteConvite = useDeleteConvitePublic(casal.codigo)
  const upsertPessoa = useUpsertPessoaPublic(casal.codigo)
  const deletePessoa = useDeletePessoaPublic(casal.codigo)

  useEffect(() => {
    if (upsertConvite.isSuccess || deleteConvite.isSuccess || upsertPessoa.isSuccess || deletePessoa.isSuccess) {
      setSavedAt(new Date())
    }
  }, [upsertConvite.isSuccess, deleteConvite.isSuccess, upsertPessoa.isSuccess, deletePessoa.isSuccess])

  const visibleConvites = useMemo(() => {
    const q = search.trim().toLowerCase()
    return convites
      .map((c) => {
        const conviteMatchesQ = !q || c.nome.toLowerCase().includes(q)
        const pessoas = c.pessoas.filter((p) => {
          const matchLado = !filterLado || p.lado === filterLado
          const matchTipo = !filterTipo || p.tipo === filterTipo
          if (!matchLado || !matchTipo) return false
          if (!q) return true
          return conviteMatchesQ || (p.nome_raw || '').toLowerCase().includes(q) || (p.telefone_raw || '').includes(q)
        })
        if (!q && !filterLado && !filterTipo) return c
        return pessoas.length > 0 ? { ...c, pessoas } : null
      })
      .filter((c): c is Convite => c !== null)
  }, [convites, search, filterLado, filterTipo])

  const stats = useMemo(() => calcStatsConvites(convites), [convites])

  const pendingPessoaTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const debouncedPessoa = useCallback(
    (guest_id: string, convite_id: string, patch: Partial<Pessoa>) => {
      const existing = pendingPessoaTimers.current.get(guest_id)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        upsertPessoa.mutate({
          guest_id, convite_id,
          nome: patch.nome_raw, telefone: patch.telefone_raw, email: patch.email_raw,
          faixa: patch.faixa, lado: patch.lado, tipo: patch.tipo, observacoes: patch.observacoes,
        })
        pendingPessoaTimers.current.delete(guest_id)
      }, 350)
      pendingPessoaTimers.current.set(guest_id, timer)
    }, [upsertPessoa])

  const handleAddConvite = useCallback(async () => {
    try {
      const id = await upsertConvite.mutateAsync({ nome: 'Novo convite', posicao: convites.length })
      await upsertPessoa.mutateAsync({ convite_id: id, nome: '', faixa: 'adulto', posicao: 0 })
    } catch (e) { setToast((e as Error).message) }
  }, [convites.length, upsertConvite, upsertPessoa])

  const handleRenameConvite = useCallback((convite_id: string, nome: string) => {
    upsertConvite.mutate({ convite_id, nome })
  }, [upsertConvite])

  const handleDeleteConvite = useCallback(async (convite_id: string) => {
    if (!confirm('Excluir este convite e todas suas pessoas?')) return
    await deleteConvite.mutateAsync(convite_id)
  }, [deleteConvite])

  const handleAddPessoa = useCallback((convite: Convite) => {
    const ladoCounts: Record<string, number> = {}
    const tipoCounts: Record<string, number> = {}
    convite.pessoas.forEach((p) => {
      if (p.lado) ladoCounts[p.lado] = (ladoCounts[p.lado] || 0) + 1
      if (p.tipo) tipoCounts[p.tipo] = (tipoCounts[p.tipo] || 0) + 1
    })
    const pickMax = (m: Record<string, number>) =>
      Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    upsertPessoa.mutate({
      convite_id: convite.id, nome: '', faixa: 'adulto',
      lado: pickMax(ladoCounts) || null, tipo: pickMax(tipoCounts) || null,
      posicao: convite.pessoas.length,
    })
  }, [upsertPessoa])

  const handleDeletePessoa = useCallback((pessoa: Pessoa) => {
    deletePessoa.mutate(pessoa.id)
  }, [deletePessoa])

  const handleImport = useCallback(async (csvText: string) => {
    try {
      const imported = importConvitesCSV(csvText)
      if (imported.length === 0) { setToast('Nenhum convite encontrado no CSV'); return }
      for (let i = 0; i < imported.length; i++) {
        const item = imported[i]
        const conviteId = await upsertConvite.mutateAsync({ nome: item.nome, posicao: convites.length + i })
        for (let j = 0; j < item.pessoas.length; j++) {
          const p = item.pessoas[j]
          await upsertPessoa.mutateAsync({
            convite_id: conviteId,
            nome: p.nome_raw, telefone: p.telefone_raw, email: p.email_raw,
            faixa: p.faixa, lado: p.lado || null, tipo: p.tipo || null,
            observacoes: p.observacoes, posicao: j,
          })
        }
      }
      setToast(`Importados ${imported.length} convites do CSV`)
    } catch (e) { setToast((e as Error).message) }
  }, [upsertConvite, upsertPessoa, convites.length])

  const handleExport = useCallback(() => {
    const csv = exportConvitesCSV(convites)
    downloadCSV(`lista-${casal.codigo}-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }, [convites, casal.codigo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'search') return
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault(); handleAddConvite()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleAddConvite])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2400)
      return () => clearTimeout(t)
    }
  }, [toast])

  return (
    <div className="flex flex-col gap-3">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-ww-sand px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <img src="/brand/ww/welcome-weddings-horizontal.png" alt="Welcome Weddings" className="h-8 w-auto object-contain" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ww-gold">Lista de Convidados</p>
            <h1 className="font-ww-serif italic text-[22px] text-ww-n700 leading-tight">{casal.nome_casal}</h1>
          </div>
        </div>
        <StatsStrip stats={stats} />
      </header>

      <div className="sticky top-[68px] z-10 bg-ww-paper/95 backdrop-blur border-b border-ww-sand px-6">
        <PlanilhaToolbar
          search={search} setSearch={setSearch}
          filterLado={filterLado} setFilterLado={setFilterLado}
          filterTipo={filterTipo} setFilterTipo={setFilterTipo}
          onAddConvite={handleAddConvite} onImport={handleImport} onExport={handleExport}
        />
        <div className="hidden md:grid items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-wider text-ww-n500 border-t border-ww-sand"
          style={{ gridTemplateColumns: '32px 1.4fr 104px 1fr 180px 0.9fr 1.2fr 28px' }}>
          <span>#</span><span>Pessoa</span><span>Idade</span><span>Telefone</span>
          <span>Lado</span><span>Tipo</span><span>Observação</span><span></span>
        </div>
      </div>

      <div className="px-6 pb-24 flex flex-col gap-2">
        {visibleConvites.length === 0 && convites.length === 0 ? (
          <EmptyState onAddConvite={handleAddConvite} />
        ) : visibleConvites.length === 0 ? (
          <p className="text-sm text-ww-n500 text-center py-10">Nenhum convite corresponde aos filtros.</p>
        ) : (
          <>
            {visibleConvites.map((c, idx) => (
              <ConviteGroup
                key={c.id}
                convite={c}
                isLast={idx === visibleConvites.length - 1}
                collapsed={!!collapsed[c.id]}
                onToggleCollapse={() => setCollapsed((s) => ({ ...s, [c.id]: !s[c.id] }))}
                onRenameConvite={(nome) => handleRenameConvite(c.id, nome)}
                onDeleteConvite={() => handleDeleteConvite(c.id)}
                onAddPessoa={() => handleAddPessoa(c)}
                onDeletePessoa={handleDeletePessoa}
                onChangePessoa={(p, patch) => debouncedPessoa(p.id, c.id, patch)}
                onEnterCreate={() => handleAddPessoa(c)}
              />
            ))}
            <button type="button" onClick={handleAddConvite}
              className="mt-2 inline-flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium rounded-md border-2 border-dashed border-ww-sand-dk text-ww-n500 hover:text-ww-gold-ink hover:border-ww-gold hover:bg-ww-gold-soft/30 transition-colors">
              <Plus className="w-4 h-4" /> Novo convite
            </button>
          </>
        )}
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-10 bg-white/95 backdrop-blur border-t border-ww-sand px-6 py-2 flex items-center justify-between gap-4 text-[11px] text-ww-n500">
        <div className="flex items-center gap-3">
          <Kbd label="Tab" desc="Próxima célula" />
          <Kbd label="↵" desc="Linha de baixo" />
          <Kbd label="⌘N" desc="Novo convite" />
          <Kbd label="⌘F" desc="Buscar" />
        </div>
        <SavedIndicator at={savedAt} isSaving={upsertConvite.isPending || upsertPessoa.isPending} />
      </footer>

      {toast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-20 bg-ww-n700 text-white px-4 py-2 rounded-full text-xs shadow-ww-toast">
          {toast}
          <button type="button" onClick={() => setToast(null)} className="ml-2 text-white/70 hover:text-white">
            <X className="w-3 h-3 inline" />
          </button>
        </div>
      )}
    </div>
  )
}

function Kbd({ label, desc }: { label: string; desc: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="font-mono px-1 py-0.5 bg-ww-cream border border-ww-sand rounded text-ww-n700">{label}</kbd>
      <span className="text-ww-n400">{desc}</span>
    </span>
  )
}

function SavedIndicator({ at, isSaving }: { at: Date | null; isSaving: boolean }) {
  if (isSaving) return <span className="inline-flex items-center gap-1 text-ww-n500"><Loader2 className="w-3 h-3 animate-spin" />salvando…</span>
  if (at) return <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="w-3 h-3" />salvo</span>
  return null
}

function EmptyState({ onAddConvite }: { onAddConvite: () => void }) {
  return (
    <div className="text-center py-12 bg-white border border-dashed border-ww-sand rounded-xl">
      <img src="/brand/ww/w-mark.png" alt="" className="w-12 h-12 mx-auto opacity-60 mb-3" />
      <h2 className="font-ww-serif italic text-2xl text-ww-n700 mb-2">Vamos começar?</h2>
      <p className="text-sm text-ww-n500 mb-5 max-w-md mx-auto">
        Crie seu primeiro convite (uma família, um grupo de amigos) e adicione as pessoas que você quer convidar. Tudo salva automaticamente.
      </p>
      <button type="button" onClick={onAddConvite}
        className={cn('inline-flex items-center gap-1.5 px-4 h-10 text-sm font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors')}>
        <Plus className="w-4 h-4" /> Novo convite
      </button>
    </div>
  )
}
