import type {WorkoutDTO} from "@wattwerk/shared"
import {HorizontalScroller} from "./HorizontalScroller"
import {WorkoutCard} from "./WorkoutCard"

/**
 * Eine waagerechte Reihe, wie man sie von Streaming-Diensten kennt.
 *
 * Welche Reihen es gibt und wie sie heißen, entscheidet der Server - hier wird
 * nur gezeichnet, was kommt.
 */
export function WorkoutRow({
    title,
    subtitle,
    workouts,
    onSelect,
}: {
    title: string
    subtitle?: string
    workouts: WorkoutDTO[]
    onSelect: (workout: WorkoutDTO) => void
}) {
    if (workouts.length === 0) {
        return null
    }

    return (
        <section className="row">
            <header className="row-header">
                <h2>{title}</h2>
                {subtitle !== undefined && <span className="muted">{subtitle}</span>}
            </header>
            <HorizontalScroller className="row-scroller" label={title}>
                {workouts.map((workout) => (
                    <WorkoutCard key={workout.id} workout={workout} onClick={() => onSelect(workout)} />
                ))}
            </HorizontalScroller>
        </section>
    )
}
