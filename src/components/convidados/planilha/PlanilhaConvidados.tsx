import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Check, X, HelpCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
  useUpsertConvitePublic,
  useDeleteConvitePublic,
  useUpsertPessoaPublic,
  useDeletePessoaPublic,
  type UpsertPessoaInput,
} from '../../../hooks/convidados/casais/useListaCasalPublica'
import { calcStatsConvites } from '../../../lib/convidados/calcStatsConvites'
import { exportConvitesCSV, importConvitesCSV, downloadCSV } from '../../../lib/convidados/csvConvites'
import { StatsStrip } from './StatsStrip'
import { PlanilhaToolbar } from './PlanilhaToolbar'
import { ConviteGroup } from './ConviteGroup'
import { BotaoFinalizarLista } from './BotaoFinalizarLista'
import type { Pessoa, Convite, LadoKey, TipoKey, CasalPublic } from '../../../lib/convidados/types'

interface Props {
  casal: CasalPublic
  convites: Convite[]
}

// Grid template compartilhado entre header e linhas
export const PLANILHA_GRID = '40px minmax(180px, 1.6fr) 110px minmax(160px, 1.1fr) 200px 150px minmax(160px, 1.3fr) 40px'

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedAt(new Date())
    }
  }, [upsertConvite.isSuccess, deleteConvite.isSuccess, upsertPessoa.isSuccess, deletePessoa.isSuccess])

  // Surface erro de mutação via toast (pessoa nova com erro de constraint, etc)
  useEffect(() => {
    const err = upsertConvite.error || upsertPessoa.error || deleteConvite.error || deletePessoa.error
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (err) setToast(err.message)
  }, [upsertConvite.error, upsertPessoa.error, deleteConvite.error, deletePessoa.error])

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

  // Map<guest_id, timer> — timers só pra campos de texto livre (digitação).
  // Campos discretos (clique único) salvam imediato e não usam timer.
  const pendingPessoaTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const handlePessoaChange = useCallback(
    (guest_id: string, convite_id: string, patch: Partial<Pessoa>) => {
      const input: UpsertPessoaInput = { guest_id, convite_id }
      // Só campos efetivamente presentes no patch vão pro upsert — evita
      // sobrescrever campo que outro editor pode estar salvando em paralelo.
      if ('nome_raw' in patch) input.nome = patch.nome_raw
      if ('telefone_raw' in patch) input.telefone = patch.telefone_raw
      if ('email_raw' in patch) input.email = patch.email_raw
      if ('faixa' in patch) input.faixa = patch.faixa
      if ('lado' in patch) input.lado = patch.lado
      if ('tipo' in patch) input.tipo = patch.tipo
      if ('observacoes' in patch) input.observacoes = patch.observacoes

      const textKeys: Array<keyof Pessoa> = ['nome_raw', 'telefone_raw', 'email_raw', 'observacoes']
      const isTextOnly = Object.keys(patch).every((k) => textKeys.includes(k as keyof Pessoa))

      if (isTextOnly) {
        // Digitação — debounce 350ms pra coalescer keystrokes.
        const existing = pendingPessoaTimers.current.get(guest_id)
        if (existing) clearTimeout(existing)
        const timer = setTimeout(() => {
          upsertPessoa.mutate(input)
          pendingPessoaTimers.current.delete(guest_id)
        }, 350)
        pendingPessoaTimers.current.set(guest_id, timer)
      } else {
        // Clique discreto (lado/tipo/faixa) — dispara imediato pra UI responder
        // na hora via optimistic update do react-query (sem aguardar debounce).
        upsertPessoa.mutate(input)
      }
    }, [upsertPessoa])

  const handleAddConvite = useCallback(async () => {
    try {
      const id = await upsertConvite.mutateAsync({ nome: '', posicao: convites.length })
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
    <div className="flex flex-col">
      {/* Bloco sticky unificado: header + toolbar + cabeçalho de colunas
          ficam grudados visualmente em um único container sólido */}
      <div className="sticky top-0 z-30 bg-white shadow-sm">
        {/* Linha 1: Welcome Weddings + nome casal + stats */}
        <header className="border-b border-ww-sand px-3 py-2 sm:px-6 sm:py-3 flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-4">
            <img src="/brand/ww/welcome-weddings-horizontal.png" alt="Welcome Weddings" className="h-6 sm:h-8 w-auto object-contain" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ww-gold">Lista de Convidados</p>
              <h1 className="font-ww-serif italic text-[17px] sm:text-[22px] text-ww-n700 leading-tight">{casal.nome_casal}</h1>
            </div>
          </div>
          <StatsStrip stats={stats} />
        </header>

        {/* Linha 2: Toolbar */}
        <div className="bg-ww-paper border-b border-ww-sand px-3 sm:px-6">
          <PlanilhaToolbar
            search={search} setSearch={setSearch}
            filterLado={filterLado} setFilterLado={setFilterLado}
            filterTipo={filterTipo} setFilterTipo={setFilterTipo}
            onAddConvite={handleAddConvite} onImport={handleImport} onExport={handleExport}
          />
        </div>

        {/* Linha 3: Cabeçalho de colunas — todos centralizados */}
        <div
          className="hidden md:grid items-center bg-ww-cream border-b-2 border-ww-sand-dk text-[11px] font-semibold uppercase tracking-[0.14em] text-ww-n700"
          style={{ gridTemplateColumns: PLANILHA_GRID }}
        >
          <span className="py-2.5 px-2 text-center">#</span>
          <span className="py-2.5 px-2 text-center border-l border-ww-sand-dk/60">Pessoa</span>
          <span className="py-2.5 px-2 text-center border-l border-ww-sand-dk/60">Idade</span>
          <span className="py-2.5 px-2 text-center border-l border-ww-sand-dk/60">Telefone</span>
          <span className="py-2.5 px-2 text-center border-l border-ww-sand-dk/60">Lado</span>
          <span className="py-2.5 px-2 text-center border-l border-ww-sand-dk/60">Tipo</span>
          <span className="py-2.5 px-2 text-center border-l border-ww-sand-dk/60">Observação</span>
          <span className="py-2.5 px-2 border-l border-ww-sand-dk/60"></span>
        </div>
      </div>

      {/* Body com scroll natural — pb maior pra footer fixo não cobrir conteúdo */}
      <div className="px-3 sm:px-6 pt-3 pb-32 sm:pb-28 flex flex-col gap-3">
        {/* Banner de boas-vindas / chip "Como funciona?" — componente decide
            internamente o que mostrar (banner cheio, chip discreto ou nada). */}
        <PrimeiraVezBanner
          codigo={casal.codigo}
          listaVazia={convites.every((c) => c.pessoas.every((p) => !p.nome_raw?.trim()))}
        />

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
                onChangePessoa={(p, patch) => handlePessoaChange(p.id, c.id, patch)}
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

      {/* Footer fixo: salvo + atalhos à esquerda, botão Pronto à direita */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-ww-sand shadow-[0_-4px_12px_rgba(78,24,32,0.04)] px-3 py-2 sm:px-6 sm:py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <SavedIndicator at={savedAt} isSaving={upsertConvite.isPending || upsertPessoa.isPending} />
          <div className="hidden lg:flex items-center gap-3 text-[11px] text-ww-n500 overflow-x-auto">
            <Kbd label="Tab" desc="Próxima célula" />
            <Kbd label="↵" desc="Linha de baixo" />
            <Kbd label="⌘N" desc="Novo convite" />
          </div>
        </div>
        <BotaoFinalizarLista codigo={casal.codigo} totalPessoas={stats.totalPessoas} />
      </footer>

      {toast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 bg-ww-n700 text-white px-4 py-2 rounded-full text-xs shadow-ww-toast">
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
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
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

/**
 * Banner explicativo quando a lista é nova. Some sozinho quando o casal
 * preenche a primeira pessoa, OU quando clica em "Já entendi" (persiste
 * em localStorage por código do casal). Dispensado, vira um chip discreto
 * "Como funciona?" que reabre o banner ao clicar.
 */
function PrimeiraVezBanner({ codigo, listaVazia }: { codigo: string; listaVazia: boolean }) {
  const storageKey = `welcomecrm:lista-convidados:onboarding-dispensado:${codigo}`
  const [dispensado, setDispensado] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  })

  const dispensar = () => {
    setDispensado(true)
    try {
      window.localStorage.setItem(storageKey, '1')
    } catch { /* ignore */ }
  }

  const reabrir = () => {
    setDispensado(false)
    try {
      window.localStorage.removeItem(storageKey)
    } catch { /* ignore */ }
  }

  // Regra:
  // - Nunca dispensou + lista vazia → banner cheio
  // - Nunca dispensou + lista cheia → nada (não interrompe)
  // - Dispensado → chip "Como funciona?" sempre visível (ajuda contextual)
  if (dispensado) {
    return (
      <button
        type="button"
        onClick={reabrir}
        className="inline-flex items-center gap-1.5 self-start px-3 h-7 text-[11.5px] font-medium rounded-full border border-ww-gold/40 bg-ww-gold-soft/50 text-ww-gold-ink hover:bg-ww-gold-soft hover:border-ww-gold transition-colors mb-1"
        title="Mostrar de novo o passo a passo"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        Como funciona?
      </button>
    )
  }

  if (!listaVazia) return null

  return (
    <div className="relative bg-gradient-to-br from-ww-gold-soft to-ww-paper border border-ww-gold/30 rounded-xl p-5 md:p-6 mb-2">
      <button
        type="button"
        onClick={dispensar}
        className="absolute top-3 right-3 p-1 rounded-full text-ww-n500 hover:text-ww-n700 hover:bg-white/60 transition-colors"
        aria-label="Fechar este aviso"
        title="Fechar este aviso"
      >
        <X className="w-4 h-4" />
      </button>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ww-gold mb-1.5">
        Como funciona
      </p>
      <h2 className="font-ww-serif italic text-xl text-ww-n700 mb-3">
        Sua lista é organizada em grupos.
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-ww-n600 leading-relaxed">
        <div>
          <p className="font-semibold text-ww-n700 mb-1">1. Crie um convite (grupo)</p>
          <p className="text-[13px]">
            Um convite agrupa pessoas que vão chegar juntas, como uma família, casal ou círculo de amigos.
          </p>
          <p className="text-[11px] italic text-ww-n400 mt-1">
            Ex: <strong className="text-ww-n600">Família Silva</strong>, <strong className="text-ww-n600">Padrinhos</strong>, <strong className="text-ww-n600">Amigos da faculdade</strong>
          </p>
        </div>
        <div>
          <p className="font-semibold text-ww-n700 mb-1">2. Coloque as pessoas dentro</p>
          <p className="text-[13px]">
            Cada pessoa do grupo vira uma linha, com nome, idade e telefone (se for adulto).
          </p>
        </div>
        <div>
          <p className="font-semibold text-ww-n700 mb-1">3. Quando terminar, clique em <span className="text-ww-gold-ink">Pronto</span></p>
          <p className="text-[13px]">
            A equipe Welcome Weddings recebe a lista. Você pode voltar e mexer sempre que quiser.
          </p>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={dispensar}
          className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-md bg-white/70 border border-ww-gold/40 text-ww-gold-ink hover:bg-white transition-colors"
        >
          <Check className="w-3.5 h-3.5" /> Já entendi
        </button>
      </div>
    </div>
  )
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
