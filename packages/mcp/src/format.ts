import type {
    CollectionDTO,
    PowerTargetDTO,
    TrainingSessionResponse,
    UserResponse,
    WorkoutDTO,
    WorkoutSegmentDTO,
} from "@wattwerk/shared"

/**
 * Wie die API-Antworten fuer ein Sprachmodell aussehen.
 *
 * Listen werden zu je einer Zeile zusammengefasst und nicht als JSON
 * ausgeliefert: eine Bibliothek mit vierzig Programmen waere sonst ein paar
 * hunderttausend Zeichen Bloecke, von denen der Aufrufer fast nichts braucht.
 * Wer die Bloecke wirklich braucht - etwa um ein Programm zu aendern -, holt
 * das einzelne Programm, und das kommt als JSON.
 */

/** "1 Programm", "3 Programme" - eine falsche Pluralform faellt in jeder Antwort auf. */
export function count(value: number, singular: string, plural: string): string {
    return `${value} ${value === 1 ? singular : plural}`
}

export function clock(seconds: number): string {
    const total = Math.max(0, Math.round(seconds))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const rest = total % 60
    const pad = (value: number) => String(value).padStart(2, "0")
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`
}

export function target(value: PowerTargetDTO | null | undefined): string {
    if (value === null || value === undefined) {
        return "frei"
    }
    switch (value.type) {
        case "watts":
            return `${Math.round(value.value ?? 0)} W`
        case "percentFTP":
            return `${Math.round((value.value ?? 0) * 100)} % FTP`
        default:
            return "frei"
    }
}

function segmentLabel(segment: WorkoutSegmentDTO): string {
    const power =
        segment.targetEnd === null || segment.targetEnd === undefined
            ? target(segment.target)
            : `${target(segment.target)} → ${target(segment.targetEnd)}`
    const cadence =
        segment.cadenceLow !== null && segment.cadenceLow !== undefined &&
        segment.cadenceHigh !== null && segment.cadenceHigh !== undefined
            ? `, ${segment.cadenceLow}–${segment.cadenceHigh} U/min`
            : ""
    const title = segment.title !== null && segment.title !== undefined ? ` (${segment.title})` : ""
    return `${clock(segment.durationSeconds)} @ ${power}${cadence}${title}`
}

/**
 * Gleiche Bloecke hintereinander werden zusammengezogen: "8× 0:30 @ 150 % FTP"
 * statt achtmal derselben Zeile.
 */
export function segments(list: WorkoutSegmentDTO[]): string {
    const lines: string[] = []
    let previous: string | null = null
    let count = 0

    const flush = () => {
        if (previous !== null) {
            lines.push(count > 1 ? `  ${count}× ${previous}` : `  ${previous}`)
        }
    }

    for (const segment of list) {
        const label = segmentLabel(segment)
        if (label === previous) {
            count += 1
            continue
        }
        flush()
        previous = label
        count = 1
    }
    flush()

    return lines.join("\n")
}

export function workoutLine(workout: WorkoutDTO): string {
    const parts = [
        clock(workout.durationSeconds),
        `${Math.round(workout.plannedTSS)} TSS`,
        workout.visibility === "public" ? "öffentlich" : "privat",
    ]
    if (workout.isBuiltIn) {
        parts.push("Katalog")
    } else if (workout.ownerName !== null) {
        parts.push(`von ${workout.ownerName}`)
    }
    if (workout.tags.length > 0) {
        parts.push(workout.tags.map((tag) => `#${tag}`).join(" "))
    }
    return `- ${workout.name} — ${parts.join(" · ")}\n  id: ${workout.id}`
}

export function workoutList(workouts: WorkoutDTO[], empty: string): string {
    if (workouts.length === 0) {
        return empty
    }
    return workouts.map(workoutLine).join("\n")
}

export function workoutDetail(workout: WorkoutDTO): string {
    const head = [
        `${workout.name} (id: ${workout.id})`,
        workout.summary.length > 0 ? workout.summary : null,
        `${clock(workout.durationSeconds)} · ${Math.round(workout.plannedTSS)} TSS · ` +
            `${count(workout.segments.length, "Block", "Blöcke")} · ` +
            `${workout.visibility === "public" ? "öffentlich" : "privat"}` +
            `${workout.isBuiltIn ? " · aus dem Katalog" : ""}`,
        workout.tags.length > 0 ? workout.tags.map((tag) => `#${tag}`).join(" ") : null,
        workout.ownerName !== null ? `Urheber: ${workout.ownerName}` : null,
    ].filter((line): line is string => line !== null)

    return `${head.join("\n")}\n\nBlöcke:\n${segments(workout.segments)}`
}

export function collectionLine(collection: CollectionDTO): string {
    const duration = collection.workouts.reduce((sum, workout) => sum + workout.durationSeconds, 0)
    const parts = [
        count(collection.workouts.length, "Programm", "Programme"),
        clock(duration),
        collection.visibility === "public" ? "öffentlich" : "privat",
    ]
    const head = `- ${collection.name} — ${parts.join(" · ")}\n  id: ${collection.id}`
    if (collection.workouts.length === 0) {
        return head
    }
    return `${head}\n${collection.workouts
        .map((workout, index) => `  ${index + 1}. ${workout.name} (${clock(workout.durationSeconds)}) — id: ${workout.id}`)
        .join("\n")}`
}

export function sessionLine(session: TrainingSessionResponse): string {
    const date = new Date(session.startedAt)
    const day = Number.isNaN(date.getTime()) ? session.startedAt : date.toISOString().slice(0, 16).replace("T", " ")
    const parts = [
        clock(session.durationSeconds),
        `${session.averagePower} W ⌀`,
        `NP ${session.normalizedPower} W`,
        `IF ${session.intensityFactor.toFixed(2)}`,
        `${session.trainingStressScore} TSS`,
        `${session.kilojoules} kJ`,
    ]
    if (session.averageHeartRate !== null && session.averageHeartRate !== undefined) {
        parts.push(`${session.averageHeartRate} bpm ⌀`)
    }
    if (!session.completed) {
        parts.push("abgebrochen")
    }
    return `- ${day} · ${session.workoutName} — ${parts.join(" · ")}\n  id: ${session.id}${
        session.workoutID !== null && session.workoutID !== undefined
            ? ` · Programm: ${session.workoutID}`
            : ""
    }`
}

export function profileText(user: UserResponse): string {
    return [
        `${user.name.length > 0 ? user.name : "(ohne Namen)"} <${user.email}> (id: ${user.id})`,
        `FTP ${user.ftp} W · Gewicht ${user.weightKg} kg · ${(user.ftp / user.weightKg).toFixed(2)} W/kg`,
        `Herzfrequenz: max ${user.maxHeartRate} · Ruhe ${user.restingHeartRate}`,
        `Produktmails: ${user.mailContactAllowed ? "ja" : "nein"}`,
        `Konto seit ${user.createdAt.slice(0, 10)}`,
    ].join("\n")
}
