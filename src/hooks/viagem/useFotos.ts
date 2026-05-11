import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface TripFoto {
  id: string
  file_url: string
  caption: string | null
  width: number | null
  height: number | null
  created_at: string
  autor_id: string | null
  autor_nome: string | null
  autor_relacao: string | null
}

export const fotosKeys = {
  all: ['trip-fotos'] as const,
  byToken: (token: string) => ['trip-fotos', token] as const,
}

export function useFotos(token: string | undefined) {
  return useQuery({
    queryKey: token ? fotosKeys.byToken(token) : ['trip-fotos', 'none'],
    queryFn: async (): Promise<TripFoto[]> => {
      if (!token) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('listar_fotos', { p_token: token })
      if (error) throw error
      return (data ?? []) as TripFoto[]
    },
    enabled: !!token,
    staleTime: 20_000,
  })
}

interface UploadInput {
  token: string
  participantId: string
  viagemId: string
  file: File
  caption?: string
}

export function useCompartilharFoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UploadInput): Promise<TripFoto> => {
      if (!input.file.type.startsWith('image/')) {
        throw new Error('Arquivo precisa ser imagem')
      }

      // Upload para o bucket trip-plan-assets
      const ext = input.file.name.split('.').pop() ?? 'jpg'
      const path = `fotos-cliente/${input.viagemId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('trip-plan-assets')
        .upload(path, input.file, { cacheControl: '31536000', upsert: false })
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage
        .from('trip-plan-assets')
        .getPublicUrl(path)

      // Lê dimensões (best-effort)
      const dims = await readImageDimensions(input.file).catch(() => ({ width: null, height: null }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('compartilhar_foto', {
        p_token: input.token,
        p_participant_id: input.participantId,
        p_file_url: urlData.publicUrl,
        p_caption: input.caption ?? null,
        p_width: dims.width,
        p_height: dims.height,
      })
      if (error) throw error

      return {
        id: (data as { photo_id: string }).photo_id,
        file_url: urlData.publicUrl,
        caption: input.caption ?? null,
        width: dims.width,
        height: dims.height,
        created_at: new Date().toISOString(),
        autor_id: input.participantId,
        autor_nome: null,
        autor_relacao: null,
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: fotosKeys.byToken(variables.token) })
      toast.success('Foto compartilhada com a viagem')
    },
    onError: (err: Error) => {
      toast.error('Erro ao compartilhar foto', { description: err.message })
    },
  })
}

async function readImageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
