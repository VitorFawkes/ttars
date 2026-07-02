import { useRef, useState } from 'react'
import {
  Check,
  Circle,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useCardAttachments, type Arquivo } from '../../hooks/useCardAttachments'
import { useWeddingDefaultAttachments } from '../../hooks/planejamento/useWeddingDefaultAttachments'
import type { DefaultAttachment } from '../../hooks/planejamento/types'

// Documentos & Anexos do casamento — a lógica de anexo da página:
// 1) ANEXOS-PADRÃO (catálogo editável por workspace): o que todo casamento deve
//    ter. Cada slot mostra se já foi anexado; subir por ali já liga o arquivo.
// 2) ANEXOS LIVRES: qualquer outro arquivo, com nome editável (titulo).
// Usa a infra NATIVA (tabela `arquivos` + bucket card-documents) — nada paralelo.

const FIELD = 'w-full px-3 py-2 border border-[#E0D6C8] rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#BD965C]/30 focus:border-[#BD965C]'

function fmtBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtData(iso: string | null): string {
  if (!iso) return ''
  const d = iso.slice(0, 10)
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`
}

export function AnexosCasamentoSection({ cardId }: { cardId: string }) {
  const anexos = useCardAttachments(cardId)
  const catalogo = useWeddingDefaultAttachments()
  const [editandoPadroes, setEditandoPadroes] = useState(false)

  const porSlot = new Map<string, Arquivo[]>()
  const livres: Arquivo[] = []
  for (const a of anexos.arquivos) {
    if (a.slot_key) {
      const arr = porSlot.get(a.slot_key)
      if (arr) arr.push(a)
      else porSlot.set(a.slot_key, [a])
    } else {
      livres.push(a)
    }
  }

  const slots = catalogo.defaults
  const cumpridos = slots.filter((s) => (porSlot.get(s.slot_key)?.length ?? 0) > 0).length

  return (
    <div className="pt-3 flex flex-col gap-4">
      {/* ── Anexos-padrão ── */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#A88C57]">
            Documentos padrão do casamento
          </span>
          {slots.length > 0 && (
            <span className="text-[11px] text-slate-400 tabular-nums">{cumpridos} de {slots.length} anexados</span>
          )}
          <button
            type="button"
            onClick={() => setEditandoPadroes((v) => !v)}
            className="ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-[#E6D3B3] bg-white text-[11.5px] font-medium text-[#8A6A33] hover:bg-[#FBF6E8]"
          >
            <Settings2 className="w-3 h-3" /> {editandoPadroes ? 'fechar edição' : 'editar padrões'}
          </button>
        </div>

        {editandoPadroes ? (
          <EditorPadroes catalogo={catalogo} onClose={() => setEditandoPadroes(false)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {slots.map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                arquivos={porSlot.get(slot.slot_key) ?? []}
                anexosApi={anexos}
              />
            ))}
            {slots.length === 0 && !catalogo.isLoading && (
              <p className="text-[12px] text-slate-400 italic col-span-full">
                Nenhum anexo padrão configurado — use "editar padrões" pra montar a lista.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Anexos livres ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#A88C57]">Outros anexos</span>
          <span className="text-[11px] text-slate-400 tabular-nums">{livres.length}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {livres.map((a) => (
            <ArquivoRow key={a.id} arquivo={a} anexosApi={anexos} />
          ))}
          <UploadLivre anexosApi={anexos} />
        </div>
      </div>
    </div>
  )
}

// ── Slot de anexo-padrão ─────────────────────────────────────────────────────
function SlotCard({
  slot,
  arquivos,
  anexosApi,
}: {
  slot: DefaultAttachment
  arquivos: Arquivo[]
  anexosApi: ReturnType<typeof useCardAttachments>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [subindo, setSubindo] = useState(false)
  const ok = arquivos.length > 0

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setSubindo(true)
    try {
      await anexosApi.uploadFiles({ files: Array.from(files), slotKey: slot.slot_key, titulo: slot.titulo })
    } finally {
      setSubindo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2.5 flex flex-col gap-1.5',
        ok ? 'border-emerald-200 bg-emerald-50/50' : slot.obrigatorio ? 'border-amber-200 bg-amber-50/50' : 'border-[#EEE7DA] bg-[#FBF9F5]',
      )}
    >
      <div className="flex items-center gap-2">
        {ok ? (
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
        ) : (
          <Circle className={cn('w-4 h-4 shrink-0', slot.obrigatorio ? 'text-amber-500' : 'text-slate-300')} />
        )}
        <span className="text-[12.5px] font-semibold text-[#3A3633] min-w-0 truncate" title={slot.descricao ?? slot.titulo}>
          {slot.titulo}
        </span>
        {slot.obrigatorio && !ok && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-1.5 py-0.5 shrink-0">
            obrigatório
          </span>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subindo}
          className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-md border border-[#E6D3B3] bg-white text-[11px] font-medium text-[#8A6A33] hover:bg-[#FBF6E8] disabled:opacity-50 shrink-0"
        >
          {subindo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {ok ? 'mais um' : 'anexar'}
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>
      {arquivos.map((a) => (
        <ArquivoRow key={a.id} arquivo={a} anexosApi={anexosApi} compact />
      ))}
    </div>
  )
}

// ── Linha de um arquivo (nome editável, abrir, remover) ─────────────────────
function ArquivoRow({
  arquivo,
  anexosApi,
  compact,
}: {
  arquivo: Arquivo
  anexosApi: ReturnType<typeof useCardAttachments>
  compact?: boolean
}) {
  const [renomeando, setRenomeando] = useState(false)
  const [nome, setNome] = useState(arquivo.titulo ?? arquivo.nome_original)
  const display = arquivo.titulo || arquivo.nome_original

  const abrir = async () => {
    const url = await anexosApi.getSignedUrl(arquivo.caminho_arquivo)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const salvarNome = async () => {
    const v = nome.trim()
    if (v && v !== display) await anexosApi.updateTitulo({ id: arquivo.id, titulo: v })
    setRenomeando(false)
  }

  return (
    <div className={cn('flex items-center gap-2 rounded-lg bg-white border border-slate-100 px-2.5', compact ? 'py-1.5' : 'py-2')}>
      <FileText className="w-4 h-4 text-[#BD965C] shrink-0" />
      {renomeando ? (
        <>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') salvarNome(); if (e.key === 'Escape') setRenomeando(false) }}
            autoFocus
            className="flex-1 min-w-0 px-2 py-1 text-[12.5px] rounded border border-[#E6D3B3] focus:outline-none focus:ring-2 focus:ring-[#BD965C]/30"
          />
          <button type="button" onClick={salvarNome} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="Salvar nome" aria-label="Salvar nome">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => setRenomeando(false)} className="p-1 rounded text-slate-400 hover:bg-slate-100" title="Cancelar" aria-label="Cancelar">
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={abrir} className="flex-1 min-w-0 text-left text-[12.5px] text-[#3A3633] hover:text-[#8A6A33] hover:underline truncate" title={`${display} — clique pra abrir`}>
            {display}
          </button>
          <span className="text-[10.5px] text-slate-400 tabular-nums shrink-0 hidden sm:inline">
            {fmtBytes(arquivo.tamanho_bytes)}{arquivo.created_at ? ` · ${fmtData(arquivo.created_at)}` : ''}
          </span>
          <button type="button" onClick={() => { setNome(display); setRenomeando(true) }} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0" title="Renomear" aria-label="Renomear arquivo">
            <Pencil className="w-3 h-3" />
          </button>
          <button type="button" onClick={abrir} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0" title="Abrir / baixar" aria-label="Abrir arquivo">
            <Download className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remover "${display}"?`)) {
                anexosApi.deleteFile({ id: arquivo.id, path: arquivo.caminho_arquivo })
              }
            }}
            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
            title="Remover"
            aria-label="Remover arquivo"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </>
      )}
    </div>
  )
}

// ── Upload de anexo livre ────────────────────────────────────────────────────
function UploadLivre({ anexosApi }: { anexosApi: ReturnType<typeof useCardAttachments> }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={anexosApi.isUploading}
        className="self-start inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-[#8A6A33] border border-dashed border-[#D9CFC2] rounded-md hover:bg-[#FBF6E8] disabled:opacity-50"
      >
        {anexosApi.isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
        {anexosApi.uploadProgress
          ? `Subindo ${anexosApi.uploadProgress.current} de ${anexosApi.uploadProgress.total}…`
          : 'Adicionar anexo (qualquer arquivo)'}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={async (e) => {
          if (e.target.files?.length) await anexosApi.uploadFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
    </>
  )
}

// ── Editor do catálogo de padrões (por workspace) ────────────────────────────
function EditorPadroes({
  catalogo,
  onClose,
}: {
  catalogo: ReturnType<typeof useWeddingDefaultAttachments>
  onClose: () => void
}) {
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novoObrigatorio, setNovoObrigatorio] = useState(false)

  const adicionar = () => {
    if (!novoTitulo.trim()) return
    catalogo.add.mutate(
      { titulo: novoTitulo, obrigatorio: novoObrigatorio },
      { onSuccess: () => { setNovoTitulo(''); setNovoObrigatorio(false) } },
    )
  }

  return (
    <div className="rounded-xl border border-[#E6D3B3] bg-[#FCF9F2] p-3 flex flex-col gap-2">
      <p className="text-[11.5px] text-[#9A9082]">
        Esta lista vale pra <b>todos os casamentos</b> do workspace. Marque "obrigatório" no que não pode faltar.
      </p>
      {catalogo.all.map((d) => (
        <PadraoRow key={d.id} item={d} catalogo={catalogo} />
      ))}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <input
          value={novoTitulo}
          onChange={(e) => setNovoTitulo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }}
          placeholder="Novo anexo padrão (ex.: Contrato do buffet)"
          className={cn(FIELD, 'flex-1 min-w-[200px] mt-0')}
        />
        <label className="flex items-center gap-1.5 text-[12px] text-[#5C5751] select-none cursor-pointer">
          <input type="checkbox" checked={novoObrigatorio} onChange={(e) => setNovoObrigatorio(e.target.checked)} className="rounded border-slate-300 text-[#BD965C] focus:ring-[#BD965C]/30" />
          obrigatório
        </label>
        <button
          type="button"
          onClick={adicionar}
          disabled={!novoTitulo.trim() || catalogo.add.isPending}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-[#BD965C] text-white text-[12.5px] font-semibold hover:bg-[#a37f47] disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </button>
      </div>
      <button type="button" onClick={onClose} className="self-end text-[11.5px] text-[#8A6A33] underline">
        fechar edição
      </button>
    </div>
  )
}

function PadraoRow({
  item,
  catalogo,
}: {
  item: DefaultAttachment
  catalogo: ReturnType<typeof useWeddingDefaultAttachments>
}) {
  const [titulo, setTitulo] = useState(item.titulo)
  return (
    <div className={cn('flex items-center gap-2 rounded-lg bg-white border border-slate-100 px-2.5 py-1.5', !item.ativo && 'opacity-50')}>
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onBlur={() => {
          const v = titulo.trim()
          if (v && v !== item.titulo) catalogo.update.mutate({ id: item.id, titulo: v, descricao: item.descricao, obrigatorio: item.obrigatorio, ativo: item.ativo })
          else setTitulo(item.titulo)
        }}
        className="flex-1 min-w-0 px-2 py-1 text-[12.5px] rounded border border-transparent hover:border-slate-200 focus:border-[#E6D3B3] focus:outline-none focus:ring-2 focus:ring-[#BD965C]/20 bg-transparent"
      />
      <label className="flex items-center gap-1 text-[11px] text-[#5C5751] select-none cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={item.obrigatorio}
          onChange={(e) => catalogo.update.mutate({ id: item.id, titulo: item.titulo, descricao: item.descricao, obrigatorio: e.target.checked, ativo: item.ativo })}
          className="rounded border-slate-300 text-[#BD965C] focus:ring-[#BD965C]/30"
        />
        obrigatório
      </label>
      <button
        type="button"
        onClick={() => catalogo.update.mutate({ id: item.id, titulo: item.titulo, descricao: item.descricao, obrigatorio: item.obrigatorio, ativo: !item.ativo })}
        className={cn('text-[11px] underline shrink-0', item.ativo ? 'text-slate-400 hover:text-slate-600' : 'text-emerald-600')}
        title={item.ativo ? 'Desativar (some da lista sem apagar)' : 'Reativar'}
      >
        {item.ativo ? 'desativar' : 'reativar'}
      </button>
      <button
        type="button"
        onClick={() => { if (window.confirm(`Apagar o padrão "${item.titulo}"?`)) catalogo.remove.mutate(item.id) }}
        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
        title="Apagar"
        aria-label="Apagar anexo padrão"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
