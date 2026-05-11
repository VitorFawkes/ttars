import { useEffect, useRef, useState, useCallback, type RefObject } from 'react'

interface UseHorizontalScrollOptions {
    /** Enable Shift + Mouse Wheel for horizontal scroll */
    enableShiftScroll?: boolean
    /** Enable click and drag to pan */
    enableDragToPan?: boolean
    /** Enable hover arrows on edges */
    enableArrows?: boolean
    /** Scroll speed multiplier for shift+wheel */
    scrollMultiplier?: number
}

interface UseHorizontalScrollReturn {
    /** Ref to attach to the scroll container */
    containerRef: RefObject<HTMLDivElement | null>
    /** Whether user is currently dragging */
    isDragging: boolean
    /** Whether left arrow should be visible */
    showLeftArrow: boolean
    /** Whether right arrow should be visible */
    showRightArrow: boolean
    /** Scroll left by a fixed amount */
    scrollLeft: () => void
    /** Scroll right by a fixed amount */
    scrollRight: () => void
}

/**
 * Elite horizontal scroll hook with 3 techniques:
 * 1. Shift + Mouse Wheel → horizontal scroll
 * 2. Click and Drag to Pan (middle-click style)
 * 3. Scroll position indicators for arrows
 */
export function useHorizontalScroll(
    existingRef?: RefObject<HTMLDivElement | null>,
    options: UseHorizontalScrollOptions = {}
): UseHorizontalScrollReturn {
    const {
        enableShiftScroll = true,
        enableDragToPan = true,
        enableArrows = true,
        scrollMultiplier = 2,
    } = options

    const internalRef = useRef<HTMLDivElement>(null)
    const containerRef = existingRef || internalRef

    const [isDragging, setIsDragging] = useState(false)
    const [showLeftArrow, setShowLeftArrow] = useState(false)
    const [showRightArrow, setShowRightArrow] = useState(false)

    const dragState = useRef({
        isDown: false,
        startX: 0,
        scrollLeft: 0,
    })

    // Update arrow visibility based on scroll position
    const updateArrowVisibility = useCallback(() => {
        const container = containerRef.current
        if (!container || !enableArrows) return

        const { scrollLeft, scrollWidth, clientWidth } = container
        const threshold = 10 // pixels from edge

        setShowLeftArrow(scrollLeft > threshold)
        setShowRightArrow(scrollLeft < scrollWidth - clientWidth - threshold)
    }, [containerRef, enableArrows])

    // Scroll functions for arrow buttons
    const scrollLeftFn = useCallback(() => {
        const container = containerRef.current
        if (!container) return
        container.scrollBy({ left: -300, behavior: 'smooth' })
    }, [containerRef])

    const scrollRightFn = useCallback(() => {
        const container = containerRef.current
        if (!container) return
        container.scrollBy({ left: 300, behavior: 'smooth' })
    }, [containerRef])

    // Shift + Wheel Handler
    useEffect(() => {
        const container = containerRef.current
        if (!container || !enableShiftScroll) return

        const handleWheel = (e: WheelEvent) => {
            // If shift is held OR if it's a horizontal scroll (trackpad)
            if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                // Prevent default only for shift+scroll to avoid interfering with normal scroll
                if (e.shiftKey && e.deltaY !== 0) {
                    e.preventDefault()
                    container.scrollLeft += e.deltaY * scrollMultiplier
                }
            }
        }

        container.addEventListener('wheel', handleWheel, { passive: false })
        return () => container.removeEventListener('wheel', handleWheel)
    }, [containerRef, enableShiftScroll, scrollMultiplier])

    // Drag to Pan Handler
    useEffect(() => {
        const container = containerRef.current
        if (!container || !enableDragToPan) return

        const handleMouseDown = (e: MouseEvent) => {
            // Only activate on left click, and NOT on interactive elements
            if (e.button !== 0) return
            const target = e.target as HTMLElement

            // Don't activate drag if clicking on cards or interactive elements
            if (
                target.closest('[data-draggable]') ||
                target.closest('button') ||
                target.closest('a') ||
                target.closest('input') ||
                target.closest('[role="button"]')
            ) {
                return
            }

            dragState.current = {
                isDown: true,
                startX: e.pageX - container.offsetLeft,
                scrollLeft: container.scrollLeft,
            }
            setIsDragging(true)
            container.style.cursor = 'grabbing'
            container.style.userSelect = 'none'
        }

        const handleMouseMove = (e: MouseEvent) => {
            if (!dragState.current.isDown) return
            e.preventDefault()

            const x = e.pageX - container.offsetLeft
            const walk = (x - dragState.current.startX) * 1.5 // Multiplier for faster drag
            container.scrollLeft = dragState.current.scrollLeft - walk
        }

        const handleMouseUp = () => {
            if (!dragState.current.isDown) return
            dragState.current.isDown = false
            setIsDragging(false)
            container.style.cursor = ''
            container.style.userSelect = ''
        }

        const handleMouseLeave = () => {
            if (dragState.current.isDown) {
                handleMouseUp()
            }
        }

        container.addEventListener('mousedown', handleMouseDown)
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        container.addEventListener('mouseleave', handleMouseLeave)

        return () => {
            container.removeEventListener('mousedown', handleMouseDown)
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
            container.removeEventListener('mouseleave', handleMouseLeave)
        }
    }, [containerRef, enableDragToPan])

    // Scroll position observer for arrows
    useEffect(() => {
        const container = containerRef.current
        if (!container || !enableArrows) return

        // Initial check with delay to ensure content is rendered
        const initialCheck = () => {
            updateArrowVisibility()
        }

        // Immediate check
        initialCheck()

        // Delayed checks for async content loading
        const timeout1 = setTimeout(initialCheck, 100)
        const timeout2 = setTimeout(initialCheck, 500)
        const timeout3 = setTimeout(initialCheck, 1000)

        // Listen to scroll events
        container.addEventListener('scroll', updateArrowVisibility)

        // Observe resize
        const resizeObserver = new ResizeObserver(initialCheck)
        resizeObserver.observe(container)

        // Observe DOM mutations (content changes)
        const mutationObserver = new MutationObserver(initialCheck)
        mutationObserver.observe(container, {
            childList: true,
            subtree: true,
            attributes: false
        })

        return () => {
            clearTimeout(timeout1)
            clearTimeout(timeout2)
            clearTimeout(timeout3)
            container.removeEventListener('scroll', updateArrowVisibility)
            resizeObserver.disconnect()
            mutationObserver.disconnect()
        }
    }, [containerRef, enableArrows, updateArrowVisibility])

    return {
        containerRef,
        isDragging,
        showLeftArrow,
        showRightArrow,
        scrollLeft: scrollLeftFn,
        scrollRight: scrollRightFn,
    }
}
