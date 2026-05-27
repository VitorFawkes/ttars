import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, ChevronDown, ChevronRight, Plus, Minus, Pencil, Check } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useCasalEnvios, useMarcarVisto, type EnvioSnapshot, type SnapshotPessoa } from '../../../hooks/convidados/casais/useCasalEnvios'
import type { CasalAdminRow } from '../../../lib/convidados/types'

interface Props { open: boolean; onClose: () => void; casal: CasalAdminRow | null }

export function HistoricoEnviosModal({ open, onClose, casal }: Props) {
  const { data: envios = [], isLoading } = useCasalEnvios(casal?.id ?? null)
  const marcarVisto = useMarcarVisto()
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  if (!open || !casal) return null
  const handleMarcarVisto = async () => { if (!casal) return; await marcarVisto.mutateAsync(casal.id) }

  const node = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(33,31,29,0.42)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true">
      <div className="w-full max-w-[720px] max-h-[90vh] bg-white rounded-xl shadow-ww-modal flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-ww-sand">
          <div>
            <h2 className="font-ww-serif italic text-lg text-ww-n700">Histórico de envios</h2>
            <p className="text-xs text-ww-n500 mt-0.5">Cada vez que <strong className="text-ww-n700">{casal.nome_casal}</strong> apertou "Pronto" geramos uma foto da lista.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-ww-cream text-ww-n500" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="text-center py-10 text-sm text-ww-n500"><Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando...</div>
          ) : envios.length === 0 ? (
            <div className="text-center py-10 text-sm text-ww-n500">O casal ainda não clicou em "Pronto".</div>
          ) : (
            <ol className="flex flex-col gap-3">
              {envios.map((envio, idx) => {
                const previo = envios[idx + 1] ?? null
                const isMaisRecente = idx === 0
                const isExpanded = expandedIdx === idx
                const diff = previo ? computeDiff(previo, envio) : { adicionadas: envio.total_pessoas, removidas: 0, modificadas: 0 }
                return (
                  <li key={envio.id} className={cn('border rounded-lg transition-colors', isMaisRecente ? 'border-ww-gold/60 bg-ww-gold-soft/30' : 'border-ww-sand bg-white')}>
                    <button type="button" onClick={() => setExpandedIdx(isExpanded ? null : idx)} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-ww-n500" /> : <ChevronRight className="w-4 h-4 text-ww-n500" />}
                        <div>
                          <p className="text-sm font-medium text-ww-n700">
                            {isMaisRecente && (<span className="inline-block mr-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-ww-gold text-white rounded">Versão atual</span>)}
                            Envio #{envios.length - idx} — {formatLong(envio.enviado_em)}
                          </p>
                          <p className="text-xs text-ww-n500 mt-0.5">
                            {envio.total_convites} convites · {envio.total_pessoas} pessoas
                            {envio.total_sem_telefone > 0 && (<span className="text-rose-600"> · {envio.total_sem_telefone} sem telefone</span>)}
                          </p>
                        </div>
                      </div>
                      {previo && (
                        <div className="flex items-center gap-2 text-xs">
                          {diff.adicionadas > 0 && <span className="inline-flex items-center gap-0.5 text-emerald-700"><Plus className="w-3 h-3" /> {diff.adicionadas}</span>}
                          {diff.removidas > 0 && <span className="inline-flex items-center gap-0.5 text-rose-600"><Minus className="w-3 h-3" /> {diff.removidas}</span>}
                          {diff.modificadas > 0 && <span className="inline-flex items-center gap-0.5 text-amber-600"><Pencil className="w-3 h-3" /> {diff.modificadas}</span>}
                          {diff.adicionadas === 0 && diff.removidas === 0 && diff.modificadas === 0 && (<span className="text-ww-n400 italic">sem mudanças</span>)}
                        </div>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-ww-sand px-4 py-3 bg-white/60">
                        {previo ? <DiffDetail previo={previo} atual={envio} /> : <FirstVersionDetail envio={envio} />}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-ww-sand">
          <div className="text-[11px] text-ww-n500">
            {casal.alterado_depois_do_envio && (<span className="inline-flex items-center gap-1 text-amber-700"><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" /> Há mudanças não verificadas</span>)}
          </div>
          <div className="flex items-center gap-2">
            {casal.alterado_depois_do_envio && (
              <button type="button" onClick={handleMarcarVisto} disabled={marcarVisto.isPending}
                className="inline-flex items-center gap-1.5 px-3 h-9 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-60">
                {marcarVisto.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Marcar como verificado
              </button>
            )}
            <button type="button" onClick={onClose} className="px-3 h-9 text-sm text-ww-n600 hover:text-ww-n700">Fechar</button>
          </div>
        </footer>
      </div>
    </div>
  )
  return createPortal(node, document.body)
}

function indexPessoasById(envio: EnvioSnapshot): Map<string, SnapshotPessoa> {
  const map = new Map<string, SnapshotPessoa>()
  for (const c of envio.snapshot || []) for (const p of c.pessoas || []) map.set(p.id, p)
  return map
}

function computeDiff(previo: EnvioSnapshot, atual: EnvioSnapshot) {
  const mPrev = indexPessoasById(previo)
  const mAtu = indexPessoasById(atual)
  let adicionadas = 0, removidas = 0, modificadas = 0
  for (const id of mAtu.keys()) {
    if (!mPrev.has(id)) adicionadas++
    else if (!sameContent(mPrev.get(id)!, mAtu.get(id)!)) modificadas++
  }
  for (const id of mPrev.keys()) if (!mAtu.has(id)) removidas++
  return { adicionadas, removidas, modificadas }
}

function sameContent(a: SnapshotPessoa, b: SnapshotPessoa): boolean {
  return a.nome_raw === b.nome_raw && a.telefone_raw === b.telefone_raw && a.email_raw === b.email_raw
    && a.faixa === b.faixa && a.lado === b.lado && a.tipo === b.tipo && a.observacoes === b.observacoes
}

function DiffDetail({ previo, atual }: { previo: EnvioSnapshot; atual: EnvioSnapshot }) {
  const { added, removed, changed } = useMemo(() => {
    const mPrev = indexPessoasById(previo); const mAtu = indexPessoasById(atual)
    const added: SnapshotPessoa[] = []; const removed: SnapshotPessoa[] = []
    const changed: Array<{ prev: SnapshotPessoa; cur: SnapshotPessoa }> = []
    for (const [id, p] of mAtu) {
      if (!mPrev.has(id)) added.push(p)
      else if (!sameContent(mPrev.get(id)!, p)) changed.push({ prev: mPrev.get(id)!, cur: p })
    }
    for (const [id, p] of mPrev) if (!mAtu.has(id)) removed.push(p)
    return { added, removed, changed }
  }, [previo, atual])

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    return <p className="text-xs text-ww-n500 italic py-2">Nenhuma diferença em relação ao envio anterior.</p>
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {added.length > 0 && (<DiffSection label="Adicionados" color="emerald" icon={<Plus className="w-3 h-3" />}>{added.map((p) => <PessoaLine key={p.id} pessoa={p} variant="added" />)}</DiffSection>)}
      {removed.length > 0 && (<DiffSection label="Removidos" color="rose" icon={<Minus className="w-3 h-3" />}>{removed.map((p) => <PessoaLine key={p.id} pessoa={p} variant="removed" />)}</DiffSection>)}
      {changed.length > 0 && (<DiffSection label="Modificados" color="amber" icon={<Pencil className="w-3 h-3" />}>
        {changed.map(({ prev, cur }) => (
          <div key={cur.id} className="text-xs">
            <div className="font-medium text-ww-n700">{cur.nome_raw || '(sem nome)'}</div>
            <div className="ml-3 mt-0.5 flex flex-col gap-0.5">
              {fieldDiffs(prev, cur).map((d, i) => (
                <div key={i} className="text-ww-n500">
                  <span className="font-medium text-ww-n600">{d.label}:</span>{' '}
                  <span className="line-through text-rose-600">{d.from || '—'}</span><span className="mx-1">→</span>
                  <span className="text-emerald-700">{d.to || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </DiffSection>)}
    </div>
  )
}

function fieldDiffs(prev: SnapshotPessoa, cur: SnapshotPessoa) {
  const out: Array<{ label: string; from: string; to: string }> = []
  const fields: Array<[keyof SnapshotPessoa, string]> = [
    ['nome_raw', 'Nome'], ['telefone_raw', 'Telefone'], ['email_raw', 'Email'],
    ['faixa', 'Idade'], ['lado', 'Lado'], ['tipo', 'Tipo'], ['observacoes', 'Observação'],
  ]
  for (const [k, label] of fields) {
    const a = (prev[k] ?? '') as string; const b = (cur[k] ?? '') as string
    if (a !== b) out.push({ label, from: a, to: b })
  }
  return out
}

function FirstVersionDetail({ envio }: { envio: EnvioSnapshot }) {
  return (
    <div className="text-xs text-ww-n500">
      <p className="italic mb-2">Esta é a primeira versão enviada pelo casal.</p>
      <ul className="grid grid-cols-2 gap-1">
        {envio.snapshot.map((c) => (<li key={c.id} className="text-ww-n700"><strong>{c.nome}</strong> — {c.pessoas.length} {c.pessoas.length === 1 ? 'pessoa' : 'pessoas'}</li>))}
      </ul>
    </div>
  )
}

function DiffSection({ label, color, icon, children }: { label: string; color: 'emerald' | 'rose' | 'amber'; icon: React.ReactNode; children: React.ReactNode }) {
  const colorCls = { emerald: 'border-emerald-200 bg-emerald-50/50 text-emerald-700', rose: 'border-rose-200 bg-rose-50/50 text-rose-700', amber: 'border-amber-200 bg-amber-50/50 text-amber-700' }[color]
  return (
    <div className={cn('border rounded-md p-2.5', colorCls)}>
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 inline-flex items-center gap-1">{icon} {label}</div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function PessoaLine({ pessoa, variant }: { pessoa: SnapshotPessoa; variant: 'added' | 'removed' }) {
  return (
    <div className="text-xs">
      <span className={cn('font-medium', variant === 'removed' && 'line-through text-rose-600')}>{pessoa.nome_raw || '(sem nome)'}</span>
      <span className="text-ww-n500 ml-2">{pessoa.faixa}{pessoa.telefone_raw && ` · ${pessoa.telefone_raw}`}{pessoa.lado && ` · ${pessoa.lado}`}</span>
    </div>
  )
}

function formatLong(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
