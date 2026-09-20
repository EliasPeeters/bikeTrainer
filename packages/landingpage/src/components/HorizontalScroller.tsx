import {useCallback, useEffect, useRef, useState} from "react"
import type {ReactNode} from "react"

/**
 * Waagerechte Reihe ohne sichtbare Scrollleiste.
 *
 * Gescrollt wird wie gewohnt - mit Trackpad, Finger oder Shift+Mausrad. Wer
 * eine Maus ohne Querrad hat, nimmt die Pfeile, die nur dann auftauchen, wenn
 * es in die jeweilige Richtung auch wirklich weitergeht.
 */
export function HorizontalScroller({
    children,
    className,
    label,
}: {
    children: ReactNode
    className?: string
    label?: string
}) {
    const scroller = useRef<HTMLDivElement | null>(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(false)

    const measure = useCallback(() => {
        const node = scroller.current
        if (node === null) {
            return
        }
        // Ein Pixel Spielraum, sonst flackern die Pfeile bei krummen Zoomstufen.
        const rest = node.scrollWidth - node.clientWidth - node.scrollLeft
        setCanScrollLeft(node.scrollLeft > 1)
        setCanScrollRight(rest > 1)
    }, [])

    useEffect(() => {
        const node = scroller.current
        if (node === null) {
            return
        }
        measure()
        node.addEventListener("scroll", measure, {passive: true})
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        for (const child of Array.from(node.children)) {
            observer.observe(child)
        }
        return () => {
            node.removeEventListener("scroll", measure)
            observer.disconnect()
        }
    }, [measure, children])

    const nudge = (direction: -1 | 1) => {
        const node = scroller.current
        if (node === null) {
            return
        }
        const gentle = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        node.scrollBy({left: direction * node.clientWidth * 0.85, behavior: gentle ? "auto" : "smooth"})
    }

    return (
        <div className="scroller">
            <button
                type="button"
                className="scroller-arrow left"
                aria-label={label === undefined ? "Zurück" : `${label}: zurück`}
                tabIndex={canScrollLeft ? 0 : -1}
                aria-hidden={!canScrollLeft}
                hidden={!canScrollLeft}
                onClick={() => nudge(-1)}
            >
                <Chevron direction="left" />
            </button>
            <div ref={scroller} className={className === undefined ? "scroller-track" : `scroller-track ${className}`}>
                {children}
            </div>
            <button
                type="button"
                className="scroller-arrow right"
                aria-label={label === undefined ? "Weiter" : `${label}: weiter`}
                tabIndex={canScrollRight ? 0 : -1}
                aria-hidden={!canScrollRight}
                hidden={!canScrollRight}
                onClick={() => nudge(1)}
            >
                <Chevron direction="right" />
            </button>
        </div>
    )
}

function Chevron({direction}: {direction: "left" | "right"}) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path
                d={direction === "left" ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}
