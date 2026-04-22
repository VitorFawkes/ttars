import { useState } from 'react'
import { Camera, Upload, Heart, User } from 'lucide-react'
import { useFotos, useCompartilharFoto, type TripFoto } from '@/hooks/viagem/useFotos'

interface Props {
  token: string
  viagemId: string
  participantId: string | null
  variant: 'compact' | 'album'
}

const RELACAO_LABEL: Record<string, string> = {
  marido: 'marido',
  esposa: 'esposa',
  companheiro: 'companheiro(a)',
  filho: 'filho',
  filha: 'filha',
  pai: 'pai',
  mae: 'mãe',
  amigo: 'amigo(a)',
}

function formatAutor(foto: TripFoto): string {
  if (!foto.autor_nome) return 'Alguém da viagem'
  const first = foto.autor_nome.split(' ')[0]
  const rel = foto.autor_relacao ? RELACAO_LABEL[foto.autor_relacao] : null
  return rel ? `${first} (${rel})` : first
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function FotoShare({ token, viagemId, participantId, variant }: Props) {
  const { data: fotos = [] } = useFotos(token)
  const compartilhar = useCompartilharFoto()
  const [caption, setCaption] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const handleFile = (file: File | null) => {
    if (!file || !participantId) return
    setPendingFile(file)
  }

  const handleConfirm = () => {
    if (!pendingFile || !participantId) return
    compartilhar.mutate(
      { token, viagemId, participantId, file: pendingFile, caption: caption.trim() || undefined },
      {
        onSuccess: () => {
          setPendingFile(null)
          setCaption('')
        },
      },
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        {variant === 'album'
          ? <Heart className="h-4 w-4 text-rose-500" />
          : <Camera className="h-4 w-4 text-indigo-600" />
        }
        <h3 className="text-sm font-semibold text-slate-900">
          {variant === 'album' ? 'Álbum da viagem' : 'Compartilhar foto'}
        </h3>
        <span className="ml-auto text-xs text-slate-500">{fotos.length}</span>
      </div>

      {participantId && (
        <>
          {pendingFile ? (
            <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
              <img
                src={URL.createObjectURL(pendingFile)}
                alt=""
                className="w-full aspect-video object-cover rounded-md"
              />
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Legenda (opcional)"
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setPendingFile(null); setCaption('') }}
                  disabled={compartilhar.isPending}
                  className="flex-1 rounded-full border border-slate-200 bg-white py-2 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={compartilhar.isPending}
                  className="flex-1 rounded-full bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {compartilhar.isPending ? 'Enviando...' : 'Compartilhar'}
                </button>
              </div>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600">
              <Upload className="h-4 w-4" />
              Adicionar foto à viagem
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </>
      )}

      {fotos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {fotos.map((f) => (
            <a
              key={f.id}
              href={f.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100"
            >
              <img
                src={f.file_url}
                alt={f.caption ?? ''}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                <span className="flex items-center gap-1 font-medium">
                  <User className="h-2.5 w-2.5" />
                  {formatAutor(f)}
                </span>
                <span className="opacity-80">{formatDate(f.created_at)}</span>
                {f.caption && <p className="line-clamp-2">{f.caption}</p>}
              </div>
            </a>
          ))}
        </div>
      )}

      {fotos.length === 0 && (
        <p className="text-center text-xs text-slate-400 py-4">
          {participantId
            ? 'Seja o primeiro a compartilhar uma foto.'
            : 'Nenhuma foto compartilhada ainda.'}
        </p>
      )}
    </div>
  )
}
