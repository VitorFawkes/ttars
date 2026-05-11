import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useAllowedStages } from '../../hooks/useCardCreationRules'
import { useProductContext } from '../../hooks/useProductContext'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { processBriefingIA } from '../../hooks/useBriefingIA'
import { ORIGEM_OPTIONS } from '../../lib/constants/origem'
import AudioRecorder from '../../components/card/AudioRecorder'
import MobileContactPicker from './MobileContactPicker'
import { cn } from '../../lib/utils'
import {
  ArrowLeft, User, ChevronDown, ChevronRight, Check,
  Loader2, Mic, PenLine, CheckCircle, Plus, X
} from 'lucide-react'
import { toast } from 'sonner'
import { getPhaseColor } from '../../lib/pipeline/phaseLabels'
import { SystemPhase } from '../../types/pipeline'

// Classe Tailwind composta para mobile: monta a partir de getPhaseColor (tokens por slug).
function phaseChipClass(slug: string | null | undefined): string {
  const c = getPhaseColor(slug)
  return `${c.activeBg} ${c.text} ${c.border}`
}

export default function MobileCardCreate() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile, loading: authLoading } = useAuth()
  const { currentProduct } = useProductContext()

  // Auth guard — redirect to login with return URL
  useEffect(() => {
    if (!authLoading && !profile) {
      navigate('/login?redirect=/m/novo-card', { replace: true })
    }
  }, [authLoading, profile, navigate])

  // Form state
  const [titulo, setTitulo] = useState('')
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([])
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [origem, setOrigem] = useState<string | null>(null)
  const [observacao, setObservacao] = useState('')
  const [briefingMode, setBriefingMode] = useState<'audio' | 'text'>('audio')
  const [briefingText, setBriefingText] = useState('')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)

  // UI state
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [showStages, setShowStages] = useState(false)
  const [showOrigem, setShowOrigem] = useState(false)
  const [showBriefing, setShowBriefing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdCardId, setCreatedCardId] = useState<string | null>(null)

  // Hooks
  const { allowedStages } = useAllowedStages(currentProduct)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userPhaseSlug = (profile as any)?.team?.phase?.slug as string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userPhaseId = (profile as any)?.team?.phase?.id as string | undefined
  // Auto-select stage
  const effectiveStageId = useMemo(() => {
    if (selectedStageId) return selectedStageId
    if (allowedStages.length === 0) return null
    if (userPhaseId) {
      const phaseStages = allowedStages
        .filter(s => s.phase_id === userPhaseId)
        .sort((a, b) => a.ordem - b.ordem)
      if (phaseStages.length > 0) {
        const idx = userPhaseSlug === 'planner' && phaseStages.length > 1 ? 1 : 0
        return phaseStages[idx].id
      }
    }
    return allowedStages[0].id
  }, [selectedStageId, allowedStages, userPhaseId, userPhaseSlug])

  const selectedStageName = allowedStages.find(s => s.id === effectiveStageId)?.nome

  // Pipeline ID vem direto do produto da org ativa (1 org = 1 produto pós-Fase 5 Org Split)
  const { pipelineId } = useCurrentProductMeta()
  const pipeline = pipelineId ? { id: pipelineId } : null

  // Owner auto-assignment
  const owners = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const phaseSlug = (profile as any)?.team?.phase?.slug as string | undefined
    const isAdmin = profile?.is_admin === true
    const effectivePhase = phaseSlug ?? (isAdmin ? 'planner' : undefined)
    const userId = profile?.id || null

    return {
      sdr_owner_id: effectivePhase === 'sdr' ? userId : null,
      vendas_owner_id: effectivePhase === 'planner' ? userId : null,
      pos_owner_id: effectivePhase === 'pos_venda' ? userId : null,
    }
  }, [profile])

  const canSubmit = titulo.trim().length > 0 && !!effectiveStageId && !!pipeline && !isSubmitting

  const handleSubmit = async () => {
    if (!canSubmit || !pipeline || !effectiveStageId) return

    setIsSubmitting(true)
    try {
      const currentOwnerId = owners.sdr_owner_id ?? owners.vendas_owner_id ?? owners.pos_owner_id ?? profile?.id

      const obsText = [observacao.trim(), briefingText.trim()].filter(Boolean).join('\n\n')
      const briefingInicial = obsText ? { observacao_livre: obsText } : {}

      // 1. Create card
      const { data: card, error } = await supabase
        .from('cards')
        .insert({
          titulo: titulo.trim(),
          produto: currentProduct,
          pessoa_principal_id: contacts[0]?.id || null,
          pipeline_id: pipeline.id,
          pipeline_stage_id: effectiveStageId,
          sdr_owner_id: owners.sdr_owner_id,
          vendas_owner_id: owners.vendas_owner_id,
          pos_owner_id: owners.pos_owner_id,
          dono_atual_id: currentOwnerId,
          origem: origem || null,
          status_comercial: 'aberto',
          moeda: 'BRL',
          briefing_inicial: briefingInicial
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select('id')
        .single()

      if (error) throw error

      // 2. Link additional contacts (index > 0) to card via cards_contatos
      if (contacts.length > 1) {
        const rows = contacts.slice(1).map((c, i) => ({
          card_id: card.id,
          contato_id: c.id,
          tipo_viajante: 'acompanhante' as const,
          ordem: i + 1
        }))
        await supabase.from('cards_contatos').insert(rows)
      }

      queryClient.invalidateQueries({ queryKey: ['cards'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })

      // 3. Process audio briefing if exists
      if (audioBlob && briefingMode === 'audio') {
        toast.success('Card criado! Processando briefing com IA...')
        setCreatedCardId(card.id)

        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) throw new Error('Usuário não autenticado')

          const result = await processBriefingIA(card.id, audioBlob, user.id, 'novo')

          if (result.status === 'success') {
            const count = result.campos_extraidos?.length || 0
            toast.success(`Briefing gerado! ${count} campo${count !== 1 ? 's' : ''} preenchido${count !== 1 ? 's' : ''}`)

            // Bidirectional sync (same logic as CreateCardModal)
            const selectedStage = allowedStages.find(s => s.id === effectiveStageId)
            if (selectedStage?.fase) {
              try {
                const { data: freshCard } = await supabase
                  .from('cards')
                  .select('briefing_inicial, produto_data')
                  .eq('id', card.id)
                  .single()

                if (freshCard) {
                  const pd = (freshCard.produto_data as Record<string, unknown>) || {}
                  const bi = (freshCard.briefing_inicial as Record<string, unknown>) || {}
                  const obsKeys = ['observacoes_criticas', 'observacoes_pos_venda', 'observacoes', 'resumo_consultor', 'resumo_consultor_at']
                  let changed = false

                  if (userPhaseSlug !== 'sdr') {
                    for (const [key, value] of Object.entries(pd)) {
                      if (!obsKeys.includes(key) && value !== null && value !== undefined && (bi[key] === null || bi[key] === undefined)) {
                        bi[key] = value
                        changed = true
                      }
                    }
                    if (pd.resumo_consultor && !bi.resumo_consultor) {
                      bi.resumo_consultor = pd.resumo_consultor
                      bi.resumo_consultor_at = pd.resumo_consultor_at
                      changed = true
                    }
                  } else {
                    for (const [key, value] of Object.entries(bi)) {
                      if (!obsKeys.includes(key) && value !== null && value !== undefined && (pd[key] === null || pd[key] === undefined)) {
                        pd[key] = value
                        changed = true
                      }
                    }
                  }

                  if (changed) {
                    await supabase.rpc('update_card_from_ai_extraction', {
                      p_card_id: card.id,
                      p_produto_data: pd as unknown as Record<string, never>,
                      p_briefing_inicial: bi as unknown as Record<string, never>
                    })
                  }
                }
              } catch (syncErr) {
                console.warn('[MobileCardCreate] Bidirectional sync warning:', syncErr)
              }
            }
          } else {
            toast.info('Briefing processado, sem dados novos extraídos')
          }

          queryClient.invalidateQueries({ queryKey: ['card-detail', card.id] })
        } catch (err) {
          console.error('[MobileCardCreate] BriefingIA error:', err)
          toast.warning('Card criado, mas erro ao processar briefing. Processe depois no card.')
        }
      } else {
        toast.success('Card criado com sucesso!')
        setCreatedCardId(card.id)
      }

      setIsSubmitting(false)
    } catch (err) {
      console.error('Erro ao criar card:', err)
      toast.error('Erro ao criar card: ' + (err instanceof Error ? err.message : 'Erro desconhecido'))
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setTitulo('')
    setContacts([])
    setSelectedStageId(null)
    setOrigem(null)
    setObservacao('')
    setBriefingMode('audio')
    setBriefingText('')
    setAudioBlob(null)
    setShowStages(false)
    setShowOrigem(false)
    setShowBriefing(false)
    setCreatedCardId(null)
  }

  // Loading or not authenticated — show spinner (useEffect handles redirect)
  if (authLoading || !profile) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  // Contact Picker overlay
  if (showContactPicker) {
    return (
      <MobileContactPicker
        alreadySelected={contacts.map(c => c.id)}
        onConfirm={(newContacts) => {
          setContacts(prev => {
            const existingIds = new Set(prev.map(c => c.id))
            const unique = newContacts.filter(c => !existingIds.has(c.id))
            return [...prev, ...unique]
          })
          setShowContactPicker(false)
        }}
        onClose={() => setShowContactPicker(false)}
      />
    )
  }

  // Success screen — resumo do que foi criado
  if (createdCardId && !isSubmitting) {
    const selectedStage = allowedStages.find(s => s.id === effectiveStageId)
    const origemLabel = origem ? ORIGEM_OPTIONS.find(o => o.value === origem)?.label : null

    return (
      <div className="h-[100dvh] flex flex-col bg-slate-50">
        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col items-center justify-center">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 w-full max-w-sm space-y-5">
            {/* Header */}
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Card criado!</h2>
            </div>

            {/* Resumo */}
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-start gap-2">
                <span className="text-slate-500 flex-shrink-0">Título</span>
                <span className="text-slate-900 font-medium text-right truncate">{titulo}</span>
              </div>

              {contacts.length > 0 && (
                <div className="flex justify-between items-start gap-2">
                  <span className="text-slate-500 flex-shrink-0">
                    {contacts.length === 1 ? 'Contato' : 'Contatos'}
                  </span>
                  <div className="text-right">
                    {contacts.map((c, i) => (
                      <p key={c.id} className={cn('text-slate-900', i === 0 && 'font-medium')}>
                        {c.name}{i === 0 && contacts.length > 1 && <span className="text-indigo-600 text-xs ml-1">(principal)</span>}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {selectedStage && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-500">Estágio</span>
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium border',
                    phaseChipClass(selectedStage.phase_slug)
                  )}>
                    {selectedStage.nome}
                  </span>
                </div>
              )}

              {origemLabel && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-500">Origem</span>
                  <span className="text-slate-900">{origemLabel}</span>
                </div>
              )}

              {observacao.trim() && (
                <div className="flex justify-between items-start gap-2">
                  <span className="text-slate-500 flex-shrink-0">Nota</span>
                  <p className="text-slate-700 text-right line-clamp-2">{observacao.trim()}</p>
                </div>
              )}

              {audioBlob && briefingMode === 'audio' && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-500">Briefing IA</span>
                  <span className="text-emerald-600 font-medium">Processado</span>
                </div>
              )}
            </div>

            {/* CTA */}
            <button
              onClick={resetForm}
              className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm active:bg-indigo-700 min-h-[52px]"
              style={{ touchAction: 'manipulation' }}
            >
              Criar Outro Card
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Agrupar etapas por fase — chave estável é phase_id; label vem de phase_name do banco.
  // Terminais (phase_is_terminal=true ou slug=RESOLUCAO) são ocultas da UI de criação.
  type MobilePhaseGroup = {
    phaseId: string
    slug: string | null
    label: string
    order: number
    stages: typeof allowedStages
  }
  const stagesByPhase: MobilePhaseGroup[] = (() => {
    const map = new Map<string, MobilePhaseGroup>()
    for (const s of allowedStages) {
      const terminal = s.phase_is_terminal === true || s.phase_slug === SystemPhase.RESOLUCAO
      if (terminal) continue
      const key = s.phase_id ?? '__none__'
      let g = map.get(key)
      if (!g) {
        g = {
          phaseId: key,
          slug: s.phase_slug,
          label: s.phase_name || s.fase || 'Outros',
          order: s.phase_order ?? 999,
          stages: [],
        }
        map.set(key, g)
      }
      g.stages.push(s)
    }
    return [...map.values()].sort((a, b) => a.order - b.order)
  })()

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-lg active:bg-slate-100"
            style={{ touchAction: 'manipulation' }}
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <h1 className="text-base font-semibold text-slate-900 tracking-tight">Novo Card</h1>
        </div>
      </div>

      {/* Form — único scroll container */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 pb-4"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >

        {/* ── Section 1: Título ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <label className="text-sm font-medium text-slate-700">Título *</label>
          <input
            type="text"
            autoCapitalize="words"
            autoFocus
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Nome do cliente ou viagem"
          />
        </div>

        {/* ── Section 2: Contatos ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <label className="text-sm font-medium text-slate-700">Contatos</label>

          {contacts.length > 0 && (
            <div className="mt-2 space-y-2">
              {contacts.map((contact, idx) => (
                <div key={contact.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                      idx === 0 ? 'bg-indigo-100' : 'bg-slate-100'
                    )}>
                      <User className={cn('w-4 h-4', idx === 0 ? 'text-indigo-600' : 'text-slate-500')} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-slate-900 truncate block">{contact.name}</span>
                      {idx === 0 && <span className="text-[10px] text-indigo-600 font-medium">Principal</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => setContacts(prev => prev.filter(c => c.id !== contact.id))}
                    className="p-1.5 rounded-lg active:bg-slate-100 flex-shrink-0"
                    style={{ touchAction: 'manipulation' }}
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowContactPicker(true)}
            className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-600 active:bg-slate-50 min-h-[48px]"
            style={{ touchAction: 'manipulation' }}
          >
            <Plus className="w-4 h-4" />
            {contacts.length === 0 ? 'Selecionar Contato' : 'Adicionar Pessoa'}
          </button>
        </div>

        {/* ── Section 3: Estágio ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <button
            onClick={() => setShowStages(!showStages)}
            className="w-full flex items-center justify-between"
            style={{ touchAction: 'manipulation' }}
          >
            <div>
              <span className="text-sm font-medium text-slate-700">Estágio</span>
              {selectedStageName && (
                <span className={cn(
                  'ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                  phaseChipClass(allowedStages.find(s => s.id === effectiveStageId)?.phase_slug)
                )}>
                  {selectedStageName}
                </span>
              )}
            </div>
            {showStages ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>

          {showStages && (
            <div className="mt-3 space-y-3">
              {stagesByPhase.map(g => {
                const colors = phaseChipClass(g.slug)
                return (
                  <div key={g.phaseId}>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">{g.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {g.stages.map(stage => {
                        const isSelected = effectiveStageId === stage.id
                        return (
                          <button
                            key={stage.id}
                            onClick={() => { setSelectedStageId(stage.id); setShowStages(false) }}
                            className={cn(
                              'px-3 py-2 rounded-lg text-xs font-medium border transition-all min-h-[44px]',
                              isSelected ? cn(colors, 'ring-2 ring-indigo-500') : 'bg-white border-slate-200 text-slate-600 active:bg-slate-50'
                            )}
                            style={{ touchAction: 'manipulation' }}
                          >
                            {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                            {stage.nome}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Section 4: Origem ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <button
            onClick={() => setShowOrigem(!showOrigem)}
            className="w-full flex items-center justify-between"
            style={{ touchAction: 'manipulation' }}
          >
            <div>
              <span className="text-sm font-medium text-slate-700">Origem</span>
              {origem && (
                <span className="ml-2 text-xs text-slate-500">
                  {ORIGEM_OPTIONS.find(o => o.value === origem)?.label}
                </span>
              )}
            </div>
            {showOrigem ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>

          {showOrigem && (
            <div className="mt-3 flex flex-wrap gap-2">
              {ORIGEM_OPTIONS.map(opt => {
                const isSelected = origem === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setOrigem(isSelected ? null : opt.value)}
                    className={cn(
                      'px-3 py-2 rounded-lg text-xs font-medium border transition-all min-h-[44px]',
                      isSelected ? cn(opt.color, 'ring-2 ring-indigo-500') : 'bg-white border-slate-200 text-slate-600 active:bg-slate-50'
                    )}
                    style={{ touchAction: 'manipulation' }}
                  >
                    {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Section 5: Observação + Briefing ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <button
            onClick={() => setShowBriefing(!showBriefing)}
            className="w-full flex items-center justify-between"
            style={{ touchAction: 'manipulation' }}
          >
            <span className="text-sm font-medium text-slate-700">Observação & Briefing</span>
            {showBriefing ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>

          {showBriefing && (
            <div className="mt-3 space-y-3">
              {/* Observação */}
              <textarea
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={3}
                placeholder="Observações sobre o lead..."
              />

              {/* Briefing mode toggle */}
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setBriefingMode('audio')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors min-h-[44px]',
                    briefingMode === 'audio' ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-slate-500'
                  )}
                  style={{ touchAction: 'manipulation' }}
                >
                  <Mic className="w-3.5 h-3.5" />
                  Áudio
                </button>
                <button
                  onClick={() => setBriefingMode('text')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors min-h-[44px]',
                    briefingMode === 'text' ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-slate-500'
                  )}
                  style={{ touchAction: 'manipulation' }}
                >
                  <PenLine className="w-3.5 h-3.5" />
                  Texto
                </button>
              </div>

              {briefingMode === 'audio' ? (
                <AudioRecorder onAudioReady={setAudioBlob} />
              ) : (
                <textarea
                  value={briefingText}
                  onChange={e => setBriefingText(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={4}
                  placeholder="Descreva o briefing do cliente..."
                />
              )}

              {audioBlob && briefingMode === 'audio' && (
                <p className="text-xs text-emerald-600 font-medium">
                  Áudio pronto. Será processado pela IA após criar o card.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom CTA ── */}
      <div className="flex-shrink-0 bg-white border-t border-slate-200">
        <div className="px-4 py-3">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "w-full py-3.5 rounded-xl font-semibold text-sm transition-all min-h-[52px]",
              "bg-indigo-600 text-white active:bg-indigo-700",
              "disabled:bg-slate-300 disabled:cursor-not-allowed",
              "shadow-lg shadow-indigo-600/20"
            )}
            style={{ touchAction: 'manipulation' }}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Criando...
              </span>
            ) : (
              audioBlob && briefingMode === 'audio' ? 'Criar & Processar IA' : 'Criar Card'
            )}
          </button>
        </div>
        <div className="safe-area-inset-bottom bg-white" />
      </div>
    </div>
  )
}
