import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Minus, Maximize2 } from "lucide-react";
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

function savePosition(pos: { x: number; y: number }) {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
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
    const [minimized, setMinimized] = useState(() => localStorage.getItem(MIN_KEY) === "true");
    const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);

    // Position: null = default (left:16, top:50%), otherwise absolute coordinates
    const [position, setPosition] = useState<{ x: number; y: number } | null>(loadPosition);
    const buttonRef = useRef<HTMLDivElement>(null);

    // Drag state via refs to avoid re-renders during drag
    const draggingRef = useRef(false);
    const hasDraggedRef = useRef(false);
    const dragStartRef = useRef({ mouseX: 0, mouseY: 0, elX: 0, elY: 0 });

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

        const pos: PanelPosition = { originX: 0, originY: 0.5 };

        if (spaceRight >= panelWidth) {
            pos.left = buttonSize + 8;
            pos.originX = 0;
        } else if (spaceLeft >= panelWidth) {
            pos.right = buttonSize + 8;
            pos.originX = 1;
        } else {
            const centeredLeft = (viewportWidth - panelWidth) / 2 - buttonRect.left;
            pos.left = centeredLeft;
            pos.originX = 0.5;
        }

        const idealTop = -panelHeight / 2 + buttonSize / 2;
        const panelTopInViewport = buttonRect.top + idealTop;
        const panelBottomInViewport = panelTopInViewport + panelHeight;

        if (panelTopInViewport < padding) {
            pos.top = -buttonRect.top + padding;
            pos.originY = 0;
        } else if (panelBottomInViewport > viewportHeight - padding) {
            pos.bottom = -(viewportHeight - buttonRect.bottom - padding);
            pos.originY = 1;
        } else {
            pos.top = idealTop;
            pos.originY = 0.5;
        }

        return pos;
    }, []);

    // --- Pointer-based drag ---
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        draggingRef.current = true;
        hasDraggedRef.current = false;
        const el = buttonRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        dragStartRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            elX: rect.left,
            elY: rect.top,
        };
        el.setPointerCapture(e.pointerId);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!draggingRef.current) return;
        const dx = e.clientX - dragStartRef.current.mouseX;
        const dy = e.clientY - dragStartRef.current.mouseY;
        if (!hasDraggedRef.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        hasDraggedRef.current = true;

        const btnSize = minimized ? 32 : 56;
        const newX = Math.max(0, Math.min(window.innerWidth - btnSize, dragStartRef.current.elX + dx));
        const newY = Math.max(0, Math.min(window.innerHeight - btnSize, dragStartRef.current.elY + dy));
        setPosition({ x: newX, y: newY });
    }, [minimized]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        const el = buttonRef.current;
        if (el) el.releasePointerCapture(e.pointerId);
        if (hasDraggedRef.current && position) {
            savePosition(position);
        }
    }, [position]);

    const handleButtonClick = () => {
        if (hasDraggedRef.current) return;
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

    const handleMinimize = (e: React.MouseEvent) => {
        e.stopPropagation();
        setMinimized(true);
        setIsExpanded(false);
        localStorage.setItem(MIN_KEY, "true");
    };

    useEffect(() => {
        if (!isExpanded) return;
        const handleResize = () => setPanelPosition(calculatePanelPosition());
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [isExpanded, calculatePanelPosition]);

    // Compute inline style for wrapper position
    const wrapperStyle: React.CSSProperties = position
        ? { position: "fixed", left: position.x, top: position.y, bottom: "auto", right: "auto" }
        : { position: "fixed", left: 16, top: "50%" };

    const btnSize = minimized ? "w-8 h-8" : "w-12 h-12 sm:w-14 sm:h-14";
    const iconSize = minimized ? "w-4 h-4" : "w-6 h-6 sm:w-7 sm:h-7";

    return (
        <div
            className="group z-50"
            style={{ ...wrapperStyle, touchAction: "none" }}
        >
            {/* Button — plain div, NO framer-motion (it intercepts pointer events) */}
            <div
                ref={buttonRef}
                onClick={handleButtonClick}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className={cn(
                    btnSize,
                    "rounded-full",
                    "bg-indigo-600 shadow-lg shadow-indigo-500/30",
                    "flex items-center justify-center",
                    "hover:bg-indigo-700 hover:scale-105 active:scale-95",
                    "transition-all duration-150",
                    "cursor-grab active:cursor-grabbing",
                    "touch-none select-none"
                )}
                role="button"
                aria-label={isExpanded ? "Fechar feedback" : "Enviar feedback"}
                aria-expanded={isExpanded}
            >
                <MessageCircle className={cn(iconSize, "text-white")} />
            </div>

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

            {/* Expand button — appears on hover when minimized */}
            {minimized && (
                <button
                    type="button"
                    onClick={() => { setMinimized(false); localStorage.setItem(MIN_KEY, "false"); }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-indigo-900 shadow-sm"
                    title="Expandir"
                    aria-label="Expandir feedback"
                >
                    <Maximize2 className="w-2.5 h-2.5" />
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
        </div>
    );
}
