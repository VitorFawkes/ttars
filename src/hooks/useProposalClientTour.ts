import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Device = 'desktop' | 'mobile'

interface UseProposalClientTourParams {
  proposalId: string | undefined
  token: string | undefined
  status: string | undefined
  /** Quando definido, sobrescreve a detecção por viewport (ex: ?mode=mobile força mobile mesmo em tela grande) */
  forceDevice?: Device
}

const storageKey = (token: string) => `wc.proposalTour.seen.${token}`

function detectDevice(): Device {
  if (typeof window === 'undefined') return 'desktop'
  return window.matchMedia('(max-width: 1023px)').matches ? 'mobile' : 'desktop'
}

function logTourEvent(
  proposalId: string,
  eventType: 'tour_started' | 'tour_step_view' | 'tour_completed' | 'tour_skipped',
  payload: Record<string, unknown> = {},
  recipientToken?: string,
) {
  // Usa RPC SECURITY DEFINER pra contornar RLS de proposal_events (anon não pode
  // executar requesting_org_id() no DEFAULT).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova ainda não nos types
  void supabase.rpc('log_proposal_event' as any, {
    p_proposal_id: proposalId,
    p_event_type: eventType,
    p_payload: payload,
    p_recipient_token: recipientToken ?? null,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  })
}

export function useProposalClientTour({
  proposalId,
  token,
  status,
  forceDevice,
}: UseProposalClientTourParams) {
  const [autoDevice, setAutoDevice] = useState<Device>(() => detectDevice())
  const device: Device = forceDevice ?? autoDevice
  const [hasSeen, setHasSeen] = useState<boolean>(() => {
    if (!token || typeof window === 'undefined') return false
    return window.localStorage.getItem(storageKey(token)) === '1'
  })
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (forceDevice) return
    const mq = window.matchMedia('(max-width: 1023px)')
    const handler = (e: MediaQueryListEvent) => setAutoDevice(e.matches ? 'mobile' : 'desktop')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [forceDevice])

  const isEligibleStatus = status === 'pending' || status === 'draft' || status === 'sent'

  const shouldAutoStart = useMemo(() => {
    return Boolean(proposalId && token && isEligibleStatus && !hasSeen)
  }, [proposalId, token, isEligibleStatus, hasSeen])

  const markSeen = useCallback(() => {
    if (!token) return
    window.localStorage.setItem(storageKey(token), '1')
    setHasSeen(true)
  }, [token])

  const openTour = useCallback(() => {
    setIsOpen(true)
    if (proposalId) logTourEvent(proposalId, 'tour_started', { device, manual: hasSeen }, token)
  }, [proposalId, device, hasSeen, token])

  const closeTour = useCallback(() => setIsOpen(false), [])

  const onCompleted = useCallback(() => {
    setIsOpen(false)
    markSeen()
    if (proposalId) logTourEvent(proposalId, 'tour_completed', { device }, token)
  }, [proposalId, device, markSeen, token])

  const onSkipped = useCallback(
    (stepIndex: number) => {
      setIsOpen(false)
      markSeen()
      if (proposalId) logTourEvent(proposalId, 'tour_skipped', { device, stepIndex }, token)
    },
    [proposalId, device, markSeen, token],
  )

  const onStepView = useCallback(
    (stepIndex: number) => {
      if (proposalId) logTourEvent(proposalId, 'tour_step_view', { device, stepIndex }, token)
    },
    [proposalId, device, token],
  )

  return {
    device,
    isOpen,
    hasSeen,
    shouldAutoStart,
    isEligibleStatus,
    openTour,
    closeTour,
    onCompleted,
    onSkipped,
    onStepView,
  }
}
