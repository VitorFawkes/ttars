import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { MAX_FILE_SIZE, ACCEPTED_MIME_TYPES } from '../lib/fileUtils'
import { toast } from 'sonner'

export interface Arquivo {
  id: string
  card_id: string
  caminho_arquivo: string
  nome_original: string
  mime_type: string | null
  tamanho_bytes: number | null
  descricao: string | null
  created_by: string | null
  created_at: string | null
  pessoa_id: string | null
  signedUrl?: string
}

export function useCardAttachments(cardId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)

  const { data: rawArquivos = [], isLoading } = useQuery({
    queryKey: ['card-attachments', cardId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('arquivos') as any)
        .select('*')
        .eq('card_id', cardId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []) as Arquivo[]
    },
    enabled: !!cardId,
  })

  // Fetch signed URLs for all files
  const [arquivos, setArquivos] = useState<Arquivo[]>([])

  useEffect(() => {
    if (rawArquivos.length === 0) {
      setArquivos([])
      return
    }

    let cancelled = false

    async function fetchUrls() {
      const withUrls = await Promise.all(
        rawArquivos.map(async (arq) => {
          const { data } = await supabase.storage
            .from('card-documents')
            .createSignedUrl(arq.caminho_arquivo, 3600) // 1 hour
          return { ...arq, signedUrl: data?.signedUrl || undefined }
        })
      )
      if (!cancelled) setArquivos(withUrls)
    }

    fetchUrls()
    return () => { cancelled = true }
  }, [rawArquivos])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['card-attachments', cardId] })
    queryClient.invalidateQueries({ queryKey: ['cards'] })
  }

  const uploadFiles = useMutation({
    mutationFn: async (files: File[]) => {
      const validFiles = files.filter((f) => {
        if (f.size > MAX_FILE_SIZE) {
          toast.error(`${f.name}: arquivo muito grande (max 25MB)`)
          return false
        }
        // Allow any file if MIME check passes or if type is empty (some browsers)
        const acceptedTypes = ACCEPTED_MIME_TYPES.split(',')
        if (f.type && !acceptedTypes.includes(f.type)) {
          toast.error(`${f.name}: tipo não suportado`)
          return false
        }
        return true
      })

      if (validFiles.length === 0) return

      setUploadProgress({ current: 0, total: validFiles.length })

      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i]
        setUploadProgress({ current: i + 1, total: validFiles.length })

        // Sanitize filename
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${cardId}/${Date.now()}_${safeName}`

        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('card-documents')
          .upload(path, file, { upsert: false })

        if (uploadError) {
          toast.error(`Erro ao enviar ${file.name}: ${uploadError.message}`)
          continue
        }

        // Insert metadata
        const { error: insertError } = await (supabase.from('arquivos') as any)
          .insert({
            card_id: cardId,
            caminho_arquivo: uploadData.path,
            nome_original: file.name,
            mime_type: file.type || null,
            tamanho_bytes: file.size,
            created_by: user?.id ?? null,
          })

        if (insertError) {
          toast.error(`Erro ao registrar ${file.name}`)
          // Cleanup storage
          await supabase.storage.from('card-documents').remove([uploadData.path])
        }
      }

      setUploadProgress(null)
    },
    onSuccess: invalidateAll,
  })

  const deleteFile = useMutation({
    mutationFn: async ({ id, path }: { id: string; path: string }) => {
      // Delete from storage
      await supabase.storage.from('card-documents').remove([path])

      // Delete from DB
      const { error } = await (supabase.from('arquivos') as any)
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll()
      toast.success('Anexo removido')
    },
    onError: () => {
      toast.error('Erro ao remover anexo')
    },
  })

  const updateDescricao = useMutation({
    mutationFn: async ({ id, descricao }: { id: string; descricao: string }) => {
      const { error } = await (supabase.from('arquivos') as any)
        .update({ descricao: descricao || null })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: invalidateAll,
  })

  return {
    arquivos,
    isLoading,
    uploadFiles: uploadFiles.mutateAsync,
    deleteFile: deleteFile.mutateAsync,
    updateDescricao: updateDescricao.mutateAsync,
    isUploading: uploadFiles.isPending,
    uploadProgress,
  }
}
