import { useState } from 'react'
import { FileText, Upload, Wand2, ExternalLink, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { TripItemInterno } from '@/hooks/viagem/useViagemInterna'
import { useUpdateTripItem } from '@/hooks/viagem/useViagemInterna'
import {
  useTripVoucherExtract,
  voucherToOperacional,
  type VoucherType,
} from '@/hooks/viagem/useVoucherExtract'

const TIPO_TO_VOUCHER: Record<string, VoucherType> = {
  hotel: 'hotel',
  voo: 'flight',
  transfer: 'transfer',
  passeio: 'experience',
  refeicao: 'experience',
  seguro: 'generic',
  voucher: 'generic',
  dica: 'generic',
  contato: 'generic',
  texto: 'generic',
  checklist: 'generic',
}

interface Props {
  item: TripItemInterno
}

export function VoucherUploader({ item }: Props) {
  const extract = useTripVoucherExtract()
  const updateItem = useUpdateTripItem()
  const [uploading, setUploading] = useState(false)
  const op = item.operacional as Record<string, string | undefined>
  const voucherUrl = op?.voucher_url as string | undefined
  const voucherName = op?.voucher_name as string | undefined

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      // 1. Upload do arquivo para o Storage
      const ext = file.name.split('.').pop() || 'pdf'
      const path = `vouchers/${item.viagem_id}/${item.id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('trip-plan-assets')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (uploadErr) {
        toast.error('Erro ao enviar arquivo', { description: uploadErr.message })
        return
      }
      const { data: urlData } = supabase.storage.from('trip-plan-assets').getPublicUrl(path)
      const url = urlData.publicUrl

      // 2. Extrair dados via IA (só se for imagem, por ora — edge function não lê PDF ainda)
      const voucherType = TIPO_TO_VOUCHER[item.tipo] ?? 'generic'
      let extracted: Record<string, unknown> = {}
      const isImage = file.type.startsWith('image/')
      if (isImage) {
        try {
          const result = await extract.mutateAsync({ file, voucherType })
          if (result.success) {
            extracted = voucherToOperacional(voucherType, result.extracted)
            toast.success('Voucher lido e dados preenchidos', {
              description: 'Confira os campos abaixo antes de salvar.',
            })
          } else {
            toast.warning('Voucher subido, mas a IA não extraiu dados', {
              description: result.error ?? 'Preencha manualmente os campos.',
            })
          }
        } catch {
          // já mostrou toast no onError
        }
      } else {
        toast.info('PDF salvo. IA lê só imagens por ora — preencha os campos à mão.')
      }

      // 3. Salvar tudo no operacional
      updateItem.mutate({
        id: item.id,
        operacional: {
          ...item.operacional,
          ...extracted,
          voucher_url: url,
          voucher_name: file.name,
          voucher_uploaded_at: new Date().toISOString(),
        },
        editado_por_papel: 'pv',
      })
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = () => {
    const next = { ...item.operacional } as Record<string, unknown>
    delete next.voucher_url
    delete next.voucher_name
    delete next.voucher_uploaded_at
    updateItem.mutate({ id: item.id, operacional: next, editado_por_papel: 'pv' })
  }

  const busy = uploading || extract.isPending

  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs font-medium text-slate-600">Voucher</label>

      {voucherUrl ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
          <FileText className="h-4 w-4 shrink-0 text-emerald-700" />
          <span className="min-w-0 flex-1 truncate text-emerald-900">{voucherName ?? 'voucher'}</span>
          <a
            href={voucherUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-emerald-700 hover:text-emerald-900"
            aria-label="Abrir voucher"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={handleRemove}
            className="shrink-0 rounded p-0.5 text-emerald-700 hover:bg-emerald-100 hover:text-red-700"
            aria-label="Remover voucher"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600">
          {busy ? (
            <>
              <Wand2 className="h-4 w-4 animate-pulse" />
              {extract.isPending ? 'Lendo voucher com IA...' : 'Enviando...'}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Subir voucher (PDF, JPG ou PNG) — IA preenche os campos
            </>
          )}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              e.target.value = ''
            }}
          />
        </label>
      )}

      {voucherUrl && (
        <div className="mt-1.5">
          <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-600">
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
            <Wand2 className="h-3 w-3" />
            {busy ? 'Processando...' : 'Substituir por outro arquivo'}
          </label>
        </div>
      )}
    </div>
  )
}

