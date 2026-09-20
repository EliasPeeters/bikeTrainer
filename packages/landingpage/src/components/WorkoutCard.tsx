import type {WorkoutDTO} from "@wattwerk/shared"
import {WorkoutProfileChart} from "./WorkoutProfileChart"
import {formatDuration} from "./workoutVisuals"

export function WorkoutCard({
    workout,
    onClick,
    compact = false,
}: {
    workout: WorkoutDTO
    onClick?: () => void
    compact?: boolean
}) {
    return (
        <button
            type="button"
            className={compact ? "workout-card compact" : "workout-card"}
            onClick={onClick}
        >
            <WorkoutProfileChart segments={workout.segments} height={compact ? 56 : 76} showFTPLine={false} />
            <div className="workout-card-body">
                <h3>{workout.name}</h3>
                {!compact && workout.summary.length > 0 && <p className="muted">{workout.summary}</p>}
                <div className="workout-card-meta">
                    <span>{formatDuration(workout.durationSeconds)}</span>
                    <span>{workout.plannedTSS} TSS</span>
                    {workout.isBuiltIn ? (
                        <span className="badge">Katalog</span>
                    ) : workout.visibility === "public" ? (
                        <span className="badge public">Öffentlich</span>
                    ) : (
                        <span className="badge">Privat</span>
                    )}
                </div>
                {workout.ownerName !== null && !workout.isBuiltIn && (
                    <p className="muted tiny">von {workout.ownerName}</p>
                )}
            </div>
        </button>
    )
}
