import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, LogOut, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export function ImpersonateBanner() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [impersonatedOrgName, setImpersonatedOrgName] = useState<string | null>(null)

  const impersonating =
    (profile as unknown as { impersonating_org_id?: string | null })?.impersonating_org_id ?? null

  // Buscar nome da org impersonada diretamente (useOrg reflete membership,
  // não a org impersonada — platform admin raramente é membro do tenant).
  useEffect(() => {
    if (!impersonating) { setImpersonatedOrgName(null); return }
    let cancelled = false
    db.from('organizations').select('name').eq('id', impersonating).single().then((r: { data: { name: string } | null }) => {
      if (!cancelled) setImpersonatedOrgName(r.data?.name ?? null)
    })
    return () => { cancelled = true }
  }, [impersonating])

  if (!impersonating) return null

  const handleExit = async () => {
    setBusy(true)
    try {
      const { error } = await db.rpc('platform_end_impersonation')
      if (error) throw error
      const { error: refreshErr } = await supabase.auth.refreshSession()
      if (refreshErr) {
        // Sessão inválida — deslogar para forçar login limpo com JWT novo
        await supabase.auth.signOut()
        window.location.href = '/login'
        return
      }
      toast({ title: 'Modo impersonate encerrado', type: 'success' })
      navigate('/platform/organizations')
      window.location.reload()
    } catch (err) {
      toast({
        title: 'Erro ao sair do impersonate',
        description: err instanceof Error ? err.message : 'Tente novamente',
        type: 'error',
      })
      setBusy(false)
    }
  }

  return (
    <div className="bg-rose-600 text-white px-4 py-2 flex items-center justify-between shadow-md z-50">
      <div className="flex items-center gap-2 text-sm">
        <ShieldAlert className="h-4 w-4 flex-shrink-0" />
        <span>
          Você está em modo <strong>impersonate</strong>
          {impersonatedOrgName && <> como admin de <strong>{impersonatedOrgName}</strong></>}. Ações podem afetar dados do cliente.
        </span>
      </div>
      <button
        onClick={handleExit}
        disabled={busy}
        className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
        Sair do modo impersonate
      </button>
    </div>
  )
}
