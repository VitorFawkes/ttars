import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

interface CardSearchResult {
  id: string
  titulo: string
  matched_by: 'titulo' | 'principal' | 'acompanhante'
  matched_name?: string
}

/**
 * Busca cards (viagens) por título OU nome do contato principal OU nome de
 * qualquer acompanhante (viajante não-titular). Usado no NovoAtendimentoModal
 * para localizar a viagem.
 *
 * Estratégia: 3 buscas em paralelo (título / pessoa principal / acompanhantes
 * via cards_contatos), com dedup pelo id na ordem título → principal →
 * acompanhante (o titular casa primeiro pela rota "principal" e nunca aparece
 * como "acompanhante", evitando duplicação semântica).
 */
async function searchCards(q: string, orgId: string): Promise<CardSearchResult[]> {
  const term = q.trim()
  if (!term || !orgId) return []

  // 1. Match no título do card
  const titlePromise = supabase
    .from('cards')
    .select('id, titulo')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .ilike('titulo', `%${term}%`)
    .limit(10)

  // 2. Contatos cujo nome casa, nessa org. Usado pra principal e viajantes.
  const contatosPromise = supabase
    .from('contatos')
    .select('id, nome')
    .eq('org_id', orgId)
    .ilike('nome', `%${term}%`)
    .limit(20)

  const [titleRes, contatosRes] = await Promise.all([titlePromise, contatosPromise])
  const matchedContatos = contatosRes.data ?? []
  const contatoIds = matchedContatos.map(c => c.id)
  const contatoNomeById = new Map<string, string>(matchedContatos.map(c => [c.id, c.nome]))

  // 3a. Cards onde o contato é a pessoa principal
  const byPrincipalPromise = contatoIds.length > 0
    ? supabase
        .from('cards')
        .select('id, titulo, pessoa_principal_id')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .in('pessoa_principal_id', contatoIds)
        .limit(10)
    : Promise.resolve({ data: [] as Array<{ id: string; titulo: string; pessoa_principal_id: string | null }> })

  // 3b. Cards onde o contato aparece como viajante (cards_contatos)
  const relsPromise = contatoIds.length > 0
    ? supabase
        .from('cards_contatos')
        .select('card_id, contato_id')
        .in('contato_id', contatoIds)
        .limit(20)
    : Promise.resolve({ data: [] as Array<{ card_id: string; contato_id: string }> })

  const [byPrincipalRes, relsRes] = await Promise.all([byPrincipalPromise, relsPromise])

  const cardIdToTraveler = new Map<string, string>()
  for (const rel of relsRes.data ?? []) {
    if (!cardIdToTraveler.has(rel.card_id)) {
      cardIdToTraveler.set(rel.card_id, rel.contato_id)
    }
  }

  let byTravelerCards: Array<{ id: string; titulo: string }> = []
  const travelerCardIds = Array.from(cardIdToTraveler.keys())
  if (travelerCardIds.length > 0) {
    const res = await supabase
      .from('cards')
      .select('id, titulo')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .in('id', travelerCardIds)
      .limit(10)
    byTravelerCards = res.data ?? []
  }

  // Combina resultados com dedup pelo id, preservando o motivo do primeiro match
  const results = new Map<string, CardSearchResult>()
  for (const c of titleRes.data ?? []) {
    if (!results.has(c.id)) {
      results.set(c.id, { id: c.id, titulo: c.titulo, matched_by: 'titulo' })
    }
  }
  for (const c of byPrincipalRes.data ?? []) {
    if (!results.has(c.id)) {
      const nome = c.pessoa_principal_id ? contatoNomeById.get(c.pessoa_principal_id) : undefined
      results.set(c.id, { id: c.id, titulo: c.titulo, matched_by: 'principal', matched_name: nome })
    }
  }
  for (const c of byTravelerCards) {
    if (!results.has(c.id)) {
      const contatoId = cardIdToTraveler.get(c.id)
      const nome = contatoId ? contatoNomeById.get(contatoId) : undefined
      results.set(c.id, { id: c.id, titulo: c.titulo, matched_by: 'acompanhante', matched_name: nome })
    }
  }

  return Array.from(results.values()).slice(0, 10)
}

interface ViagemPickerProps {
  cardId: string
  cardTitulo: string
  onChange: (cardId: string, cardTitulo: string) => void
  /** Quando true, o picker fica desabilitado (modo locked vindo do CardTasks). */
  disabled?: boolean
  orgId: string | undefined
  /** Quando true, mostra label "Viagem *" acima. Default: true. */
  showLabel?: boolean
  /** Texto a mostrar quando o ID é fornecido por prop sem título conhecido. */
  fallbackLabel?: string
}

export function ViagemPicker({
  cardId,
  cardTitulo,
  onChange,
  disabled = false,
  orgId,
  showLabel = true,
  fallbackLabel,
}: ViagemPickerProps) {
  const [search, setSearch] = useState(cardTitulo)
  const [showResults, setShowResults] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync external cardTitulo changes (ex: limpa após criar)
  useEffect(() => {
    setSearch(cardTitulo)
  }, [cardTitulo])

  // Fecha lista ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const trimmed = search.trim()
  const queryKey = ['viagem-picker', orgId, trimmed]
  const enabled = !!orgId && trimmed.length >= 2 && trimmed !== cardTitulo
  const { data: results = [], isFetching } = useQuery({
    queryKey,
    queryFn: () => searchCards(trimmed, orgId!),
    enabled,
    staleTime: 30 * 1000,
  })

  const clear = () => {
    setSearch('')
    onChange('', '')
    setShowResults(false)
  }

  return (
    <div ref={containerRef} className="relative">
      {showLabel && (
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Viagem *
        </label>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por viagem, cliente ou acompanhante…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setShowResults(true)
            if (cardId && e.target.value !== cardTitulo) {
              onChange('', '')
            }
          }}
          onFocus={() => setShowResults(true)}
          disabled={disabled}
          className="w-full pl-9 pr-9 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:bg-slate-50 disabled:text-slate-500 text-sm"
        />
        {search && !disabled && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
            title="Limpar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showResults && enabled && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-72 overflow-y-auto">
          {isFetching ? (
            <div className="px-3 py-2.5 text-xs text-slate-500">Buscando…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-slate-500">Nenhuma viagem encontrada</div>
          ) : (
            results.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onChange(r.id, r.titulo)
                  setSearch(r.titulo)
                  setShowResults(false)
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
              >
                <div className="text-sm text-slate-800 truncate">{r.titulo}</div>
                {r.matched_by !== 'titulo' && r.matched_name && (
                  <div className="text-[11px] text-slate-500">
                    {r.matched_by === 'principal' ? 'Cliente principal' : 'Acompanhante'}: {r.matched_name}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {cardId && !showResults && (
        <div className="mt-1.5 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded text-[11px] text-indigo-700 inline-flex items-center gap-1">
          ✓ {cardTitulo || fallbackLabel || 'Viagem selecionada'}
        </div>
      )}
    </div>
  )
}
