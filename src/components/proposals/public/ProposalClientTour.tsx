import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { desktopSteps, mobileSteps, type TourCtx } from './ProposalClientTour.steps'

interface ProposalClientTourProps {
  device: 'desktop' | 'mobile'
  isOpen: boolean
  ctx: TourCtx
  onCompleted: () => void
  onSkipped: (stepIndex: number) => void
  onStepView: (stepIndex: number) => void
}

export function ProposalClientTour({
  device,
  isOpen,
  ctx,
  onCompleted,
  onSkipped,
  onStepView,
}: ProposalClientTourProps) {
  const onCompletedRef = useRef(onCompleted)
  const onSkippedRef = useRef(onSkipped)
  const onStepViewRef = useRef(onStepView)
  onCompletedRef.current = onCompleted
  onSkippedRef.current = onSkipped
  onStepViewRef.current = onStepView

  useEffect(() => {
    if (!isOpen) return

    const raw = device === 'mobile' ? mobileSteps(ctx) : desktopSteps(ctx)
    const available = raw.filter((s) => document.querySelector(s.element))

    if (available.length === 0) {
      onCompletedRef.current()
      return
    }

    let externallyDestroying = false
    let alreadyDestroyed = false

    const d = driver({
      showProgress: true,
      allowClose: true,
      nextBtnText: 'Próximo',
      prevBtnText: 'Voltar',
      doneBtnText: 'Pronto',
      progressText: '{{current}} de {{total}}',
      popoverClass: 'wc-proposal-tour',
      steps: available.map((s) => ({
        element: s.element,
        popover: {
          title: s.title,
          description: s.description,
          side: s.side,
          align: s.align,
        },
      })),
      onHighlightStarted: () => {
        const idx = d.getActiveIndex() ?? 0
        onStepViewRef.current(idx)
      },
      onDestroyStarted: () => {
        if (alreadyDestroyed) return
        alreadyDestroyed = true
        if (externallyDestroying) {
          d.destroy()
          return
        }
        const idx = d.getActiveIndex() ?? 0
        const isLast = idx === available.length - 1
        if (isLast) {
          onCompletedRef.current()
        } else {
          onSkippedRef.current(idx)
        }
        d.destroy()
      },
    })

    d.drive()

    return () => {
      externallyDestroying = true
      d.destroy()
    }
  }, [isOpen, device, ctx])

  return null
}
