import { useEffect, useState } from 'react'
import { Download, Share2, X } from 'lucide-react'

const DISMISSED_KEY = 'wc_pwa_install_dismissed'

// BeforeInstallPromptEvent é não-padrão — definido apenas por Chromium
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/**
 * Banner discreto que aparece no rodapé em mobile sugerindo "instalar" o
 * portal da viagem como PWA. Some após aceite ou descarte, não volta a
 * incomodar (localStorage).
 */
export function PWAInstallHint() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const ios = isIOS()

  useEffect(() => {
    if (isInStandaloneMode()) return
    if (typeof window === 'undefined') return
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return
    } catch {
      return
    }

    // Chromium: beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS Safari não tem beforeinstallprompt — mostra instrução estática
    // após 5s (evita incomodar quem acabou de abrir).
    let iosTimer: number | undefined
    if (ios) {
      iosTimer = window.setTimeout(() => setShow(true), 5000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      if (iosTimer !== undefined) clearTimeout(iosTimer)
    }
  }, [ios])

  const dismiss = () => {
    setShow(false)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // noop
    }
  }

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      dismiss()
    }
    setDeferredPrompt(null)
  }

  if (!show) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 sm:hidden">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          {ios ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            Instale na tela inicial
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {ios
              ? 'Toque em Compartilhar e "Adicionar à tela de início" — acessa offline durante a viagem.'
              : 'Abre offline durante a viagem, com vouchers e contatos sempre à mão.'}
          </p>
          {!ios && deferredPrompt && (
            <button
              type="button"
              onClick={install}
              className="mt-2 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Instalar
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dispensar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
