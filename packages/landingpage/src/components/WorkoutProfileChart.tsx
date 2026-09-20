import type {WorkoutSegmentDTO} from "@wattwerk/shared"
import {profileBlocks} from "./workoutVisuals"

/**
 * Die Form eines Programms als SVG.
 *
 * Bewusst ohne Diagrammbibliothek: es sind Trapeze auf einer Grundlinie, und
 * eine Bibliothek dafür wäre mehr Abhängigkeit als Zeichnung.
 */
export function WorkoutProfileChart({
    segments,
    height = 90,
    showFTPLine = true,
}: {
    segments: WorkoutSegmentDTO[]
    height?: number
    showFTPLine?: boolean
}) {
    const blocks = profileBlocks(segments)

    return (
        <svg
            className="profile"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{height}}
            role="img"
            aria-label="Verlauf des Programms"
        >
            {showFTPLine && (
                <line
                    x1="0"
                    x2="100"
                    y1={100 - (100 / 1.2)}
                    y2={100 - (100 / 1.2)}
                    stroke="rgba(255,255,255,0.28)"
                    strokeWidth="0.5"
                    strokeDasharray="2 2"
                    vectorEffect="non-scaling-stroke"
                />
            )}
            {blocks.map((block, index) => (
                <polygon
                    key={index}
                    points={[
                        `${block.x},100`,
                        `${block.x},${100 - block.startHeight}`,
                        `${block.x + block.width},${100 - block.endHeight}`,
                        `${block.x + block.width},100`,
                    ].join(" ")}
                    fill={block.color}
                    fillOpacity={block.free ? 0.4 : 0.92}
                />
            ))}
        </svg>
    )
}
