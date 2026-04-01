import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import FeedbackForm from "./FeedbackForm";

const POS_KEY = "feedback-btn-pos";
const MIN_KEY = "feedback-btn-minimized";

function loadPosition(): { x: number; y: number } | null {
    try {
        const raw = localStorage.getItem(POS_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
}

interface PanelPosition {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    originX: number;
    originY: number;
}

export function FeedbackPopup() {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [minimized, setMinimized] = useState(() => localStorage.getItem(MIN_KEY) === "true");
    const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
    const [savedPos] = useState<{ x: number; y: number } | null>(loadPosition);
    const constraintsRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLDivElement>(null);

    const calculatePanelPosition = useCallback(() => {
        if (!buttonRef.current) return null;

        const buttonRect = buttonRef.current.getBoundingClientRect();
        const panelWidth = 320;
        const panelHeight = 450;
        const padding = 16;
        const buttonSize = buttonRect.width;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const spaceRight = viewportWidth - buttonRect.right - padding;
        const spaceLeft = buttonRect.left - padding;

        const position: PanelPosition = { originX: 0, originY: 0.5 };

        // Horizontal
        if (spaceRight >= panelWidth) {
            position.left = buttonSize + 8;
            position.originX = 0;
        } else if (spaceLeft >= panelWidth) {
            position.right = buttonSize + 8;
            position.originX = 1;
        } else {
            const centeredLeft = (viewportWidth - panelWidth) / 2 - buttonRect.left;
            position.left = centeredLeft;
            position.originX = 0.5;
        }

        // Vertical
        const idealTop = -panelHeight / 2 + buttonSize / 2;
        const panelTopInViewport = buttonRect.top + idealTop;
        const panelBottomInViewport = panelTopInViewport + panelHeight;

        if (panelTopInViewport < padding) {
            position.top = -buttonRect.top + padding;
            position.originY = 0;
        } else if (panelBottomInViewport > viewportHeight - padding) {
            position.bottom = -(viewportHeight - buttonRect.bottom - padding);
            position.originY = 1;
        } else {
            position.top = idealTop;
            position.originY = 0.5;
        }

        return position;
    }, []);

    const handleButtonClick = () => {
        if (isDragging) return;
        if (minimized) {
            setMinimized(false);
            localStorage.setItem(MIN_KEY, "false");
            return;
        }
        if (!isExpanded) {
            setPanelPosition(calculatePanelPosition());
        }
        setIsExpanded(!isExpanded);
    };

    const handleDragEnd = () => {
        // Save position after drag
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            localStorage.setItem(POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
        }

        setTimeout(() => {
            setIsDragging(false);
            if (isExpanded) {
                setPanelPosition(calculatePanelPosition());
            }
        }, 100);

    };

    const handleMinimize = (e: React.MouseEvent) => {
        e.stopPropagation();
        setMinimized(true);
        setIsExpanded(false);
        localStorage.setItem(MIN_KEY, "true");
    };

    useEffect(() => {
        if (!isExpanded) return;

        const handleResize = () => {
            setPanelPosition(calculatePanelPosition());
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [isExpanded, calculatePanelPosition]);

    // Convert saved absolute position to offset from default position (computed once)
    const [initialOffset] = useState(() =>
        savedPos
            ? {
                x: savedPos.x - 16, // 16 = left-4 (1rem)
                y: savedPos.y - (window.innerHeight / 2), // default is top-1/2
            }
            : { x: 0, y: 0 }
    );

    const btnSize = minimized ? "w-8 h-8" : "w-12 h-12 sm:w-14 sm:h-14";
    const iconSize = minimized ? "w-4 h-4" : "w-6 h-6 sm:w-7 sm:h-7";

    return (
        <>
            <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-40" />

            <motion.div
                drag
                dragMomentum={false}
                dragElastic={0.1}
                dragConstraints={constraintsRef}
                initial={initialOffset}
                onDragStart={() => setIsDragging(true)}
                onDragEnd={handleDragEnd}
                onDrag={() => {
                    if (isExpanded) {
                        setPanelPosition(calculatePanelPosition());
                    }
                }}
                className={cn(
                    "fixed z-50 group",
                    "left-4 bottom-20 sm:bottom-auto sm:top-1/2"
                )}
                style={{ touchAction: "none" }}
            >
                <motion.div
                    ref={buttonRef}
                    onTap={handleButtonClick}
                    className={cn(
                        btnSize,
                        "rounded-full",
                        "bg-indigo-600 shadow-lg shadow-indigo-500/30",
                        "flex items-center justify-center",
                        "hover:bg-indigo-700 transition-colors",
                        "cursor-grab active:cursor-grabbing"
                    )}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    role="button"
                    aria-label={isExpanded ? "Fechar feedback" : "Enviar feedback"}
                    aria-expanded={isExpanded}
                >
                    <MessageCircle className={cn(iconSize, "text-white")} />
                </motion.div>

                {/* Minimize button — appears on hover */}
                {!minimized && !isExpanded && (
                    <button
                        type="button"
                        onClick={handleMinimize}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-slate-900 shadow-sm"
                        title="Minimizar"
                        aria-label="Minimizar feedback"
                    >
                        <Minus className="w-3 h-3" />
                    </button>
                )}

                <AnimatePresence>
                    {isExpanded && panelPosition && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            onPointerDownCapture={(e) => e.stopPropagation()}
                            className="absolute w-80 max-w-[calc(100vw-2rem)]"
                            style={{
                                top: panelPosition.top,
                                bottom: panelPosition.bottom,
                                left: panelPosition.left,
                                right: panelPosition.right,
                                transformOrigin: `${panelPosition.originX * 100}% ${panelPosition.originY * 100}%`,
                            }}
                        >
                            <FeedbackForm onClose={() => setIsExpanded(false)} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </>
    );
}
