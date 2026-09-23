import type {RideTrackDTO} from "@wattwerk/shared"
import {useEffect, useMemo, useRef, useState} from "react"
import {formatClock} from "./workoutVisuals"
import {
    formatMetric,
    metricScale,
    metricValues,
    reduce,
    RIDE_METRICS,
    type RideMetricKey,
} from "./rideMetrics"

const HEIGHT = 300
/** Platz unten für die Zeitachse. */
const AXIS = 22
/** Mehr Punkte als das bringen nichts - sie lägen auf demselben Pixel. */
const MAX_POINTS = 1400

/**
 * Der Sekundenverlauf einer Fahrt, eine Kurve je gewählter Messgröße.
 *
 * Ohne Diagrammbibliothek, wie schon `WorkoutProfileChart`: es sind Polylinien
 * auf einer Fläche, und die Zeichnung ist kleiner als der Rechtsklick auf die
 * erste Abhängigkeit. Die Breite wird gemessen statt über `preserveAspectRatio`
 * gestreckt - gestreckt stünde die Beschriftung schief.
 */
export function RideTrackChart({
    track,
    ftp,
    metrics,
}: {
    track: RideTrackDTO
    ftp: number
    metrics: Set<RideMetricKey>
}) {
    const container = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(900)
    const [hover, setHover] = useState<number | null>(null)

    useEffect(() => {
        const element = container.current
        if (element === null) {
            return
        }
        const observer = new ResizeObserver((entries) => {
            // Die tatsaechliche Breite, kein Mindestmass: eine breitere
            // Zeichenflaeche als der Kasten laeuft rechts aus dem Bild, und
            // die letzte Marke der Zeitachse verschwindet mit ihr.
            setWidth(Math.max(200, entries[0].contentRect.width))
        })
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    const interval = Math.max(1, track.sampleIntervalSeconds)
    const plotHeight = HEIGHT - AXIS

    /**
     * Ausgedünnt wird einmal für alle Größen gemeinsam und nur, wenn sich
     * Spur oder Breite ändern - sonst rechnet jede Mausbewegung ein paar
     * tausend Punkte neu.
     */
    const series = useMemo(() => {
        const points = Math.min(MAX_POINTS, Math.round(width * 2))
        return RIDE_METRICS.map((metric) => {
            const raw = metricValues(track, metric.key)
            return {
                metric,
                values: reduce(raw, points),
                scale: metricScale(track, metric.key, ftp),
            }
        })
    }, [track, ftp, width])

    const targets = useMemo(
        () => reduce(track.targetPower ?? [], Math.min(MAX_POINTS, Math.round(width * 2))),
        [track, width]
    )

    const count = series[0].values.length
    const stepX = count > 1 ? width / (count - 1) : width
    /** Wie viele Original-Sekunden auf einen gezeichneten Punkt fallen. */
    const bucket = track.sampleCount / Math.max(1, count)

    function line(values: (number | null)[], scale: {lower: number; upper: number}): string {
        const span = Math.max(1, scale.upper - scale.lower)
        let path = ""
        let open = false
        values.forEach((value, index) => {
            if (value === null) {
                // Eine Lücke bleibt eine Lücke. Eine Gerade darüber sähe aus
                // wie eine Messung, die es nicht gab.
                open = false
                return
            }
            const x = index * stepX
            const y = plotHeight - plotHeight * ((value - scale.lower) / span)
            path += `${open ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `
            open = true
        })
        return path.trim()
    }

    const power = series[0]
    const powerSpan = Math.max(1, power.scale.upper - power.scale.lower)
    const ftpY = plotHeight - plotHeight * ((ftp - power.scale.lower) / powerSpan)

    const hoverSecond =
        hover === null ? null : track.startOffsetSeconds + Math.round(hover * bucket) * interval

    // Kann der Server heute nicht liefern - eine Spur ohne Leistungswerte wird
    // abgelehnt. Eine Achse ohne Kurve zu zeichnen waere trotzdem schlechter
    // als nichts zu zeichnen.
    if (count < 2) {
        return <p className="muted">Diese Spur hat zu wenige Punkte für eine Kurve.</p>
    }

    return (
        <div className="track-chart" ref={container}>
            <svg
                width={width}
                height={HEIGHT}
                role="img"
                aria-label="Sekundenverlauf der Einheit"
                onMouseMove={(event) => {
                    const box = event.currentTarget.getBoundingClientRect()
                    const index = Math.round((event.clientX - box.left) / stepX)
                    setHover(Math.min(count - 1, Math.max(0, index)))
                }}
                onMouseLeave={() => setHover(null)}
            >
                {[0.25, 0.5, 0.75].map((fraction) => (
                    <line
                        key={fraction}
                        x1={0}
                        x2={width}
                        y1={plotHeight * fraction}
                        y2={plotHeight * fraction}
                        stroke="rgba(255,255,255,0.05)"
                    />
                ))}

                {metrics.has("power") && ftpY > 0 && ftpY < plotHeight && (
                    <>
                        <line
                            x1={0}
                            x2={width}
                            y1={ftpY}
                            y2={ftpY}
                            stroke="rgba(255,255,255,0.22)"
                            strokeDasharray="4 4"
                        />
                        <text x={4} y={ftpY - 4} className="track-axis">
                            FTP {ftp} W
                        </text>
                    </>
                )}

                {metrics.has("power") && targets.some((value) => value !== null) && (
                    <path
                        d={line(targets, power.scale)}
                        fill="none"
                        stroke="rgba(255,255,255,0.5)"
                        strokeWidth={1.2}
                        strokeDasharray="5 3"
                    />
                )}

                {series.map(({metric, values, scale}) =>
                    metrics.has(metric.key) ? (
                        <path
                            key={metric.key}
                            d={line(values, scale)}
                            fill="none"
                            stroke={metric.color}
                            strokeWidth={metric.key === "power" ? 1.3 : 1.8}
                            strokeLinejoin="round"
                        />
                    ) : null
                )}

                <line x1={0} x2={width} y1={plotHeight} y2={plotHeight} stroke="var(--border)" />
                {timeTicks(track, count).map((tick, position, all) => (
                    <text
                        key={tick.index}
                        x={tick.index * stepX}
                        y={HEIGHT - 6}
                        className="track-axis"
                        // Die erste Marke hängt am linken Rand, die letzte am
                        // rechten - sonst steht die Beschriftung halb draußen.
                        textAnchor={
                            position === 0 ? "start" : position === all.length - 1 ? "end" : "middle"
                        }
                    >
                        {formatClock(tick.seconds)}
                    </text>
                ))}

                {hover !== null && (
                    <line
                        x1={hover * stepX}
                        x2={hover * stepX}
                        y1={0}
                        y2={plotHeight}
                        stroke="rgba(255,255,255,0.35)"
                    />
                )}
            </svg>

            <div className="track-readout">
                <span className="track-readout-time">
                    {hoverSecond === null ? "Fahrzeit" : formatClock(hoverSecond)}
                </span>
                {series.map(({metric, values}) => {
                    if (!metrics.has(metric.key)) {
                        return null
                    }
                    const value = hover === null ? null : values[hover]
                    return (
                        <span key={metric.key} className="track-readout-value">
                            <i style={{background: metric.color}} />
                            {value === null || value === undefined
                                ? "–"
                                : `${formatMetric(value, metric)} ${metric.unit}`}
                        </span>
                    )
                })}
            </div>
        </div>
    )
}

/** Vier Marken auf der Zeitachse - mehr wird auf dem Telefon eine Zeile Brei. */
function timeTicks(track: RideTrackDTO, count: number): Array<{index: number; seconds: number}> {
    const interval = Math.max(1, track.sampleIntervalSeconds)
    const bucket = track.sampleCount / Math.max(1, count)
    return [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const index = Math.round((count - 1) * fraction)
        return {index, seconds: track.startOffsetSeconds + Math.round(index * bucket) * interval}
    })
}
