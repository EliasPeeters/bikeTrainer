import type {
    SaveWorkoutRequest,
    WorkoutDTO,
    WorkoutListResponse,
    WorkoutSyncRequest,
} from "@wattwerk/shared"
import {randomUUID} from "node:crypto"
import {cast, col, Op, where as whereClause, WhereOptions} from "sequelize"
import {DBUser} from "../db/DBUser"
import {DBWorkout} from "../db/DBWorkout"
import {failure, Response, Server} from "../server"
import {workoutMetrics} from "./WorkoutMetrics"
import {validateWorkout} from "./WorkoutValidation"

const MAX_SYNC_WORKOUTS = 200

/** Damit Listen den Namen des Urhebers zeigen können, ohne ihn nachzuladen. */
export const ownerInclude = [{model: DBUser, as: "owner", attributes: ["id", "name"]}]

export class WorkoutService {
    public configure(server: Server) {
        // Reihenfolge ist hier keine Kosmetik: Express nimmt die erste passende
        // Route, und "/workouts/:id" würde sonst auch "/workouts/public"
        // schlucken - mit "public" als Kennung.
        server
            .route("/workouts/public", {authenticated: false})
            .get<WorkoutListResponse>(async (request) => {
                const workouts = await DBWorkout.findAll({
                    where: buildSearchWhere(request.query),
                    include: ownerInclude,
                    order: [["updatedAt", "DESC"]],
                    limit: parseLimit(request.query.limit),
                })
                return Response.json(200, {workouts: workouts.map((workout) => workout.toDTO())})
            })

        server
            .route("/workouts/sync", {authenticated: true, includeUser: true})
            .postJSON<WorkoutSyncRequest, WorkoutListResponse>(async (request) => {
                const incoming = request.body?.workouts
                if (!Array.isArray(incoming)) {
                    return failure(400, "INVALID_BODY", "workouts fehlt.")
                }
                if (incoming.length > MAX_SYNC_WORKOUTS) {
                    return failure(400, "INVALID_BODY", `Mehr als ${MAX_SYNC_WORKOUTS} Programme auf einmal gehen nicht.`)
                }

                // Das ist der Weg, auf dem eine App nach der Anmeldung alles
                // mitbringt, was sie offline angelegt hat.
                for (const entry of incoming) {
                    const problem = await upsertWorkout(entry, request.user.id)
                    if (typeof problem === "string") {
                        return failure(400, "INVALID_BODY", problem)
                    }
                }

                return Response.json(200, {workouts: await ownWorkouts(request.user.id)})
            })

        server
            .route("/workouts", {authenticated: true, includeUser: true})
            .get<WorkoutListResponse>(async (request) => {
                return Response.json(200, {workouts: await ownWorkouts(request.user.id)})
            })

        server
            .route("/workouts", {authenticated: true, includeUser: true})
            .postJSON<SaveWorkoutRequest, WorkoutDTO>(async (request) => {
                const result = await upsertWorkout(request.body, request.user.id)
                if (typeof result === "string") {
                    return failure(400, "INVALID_BODY", result)
                }
                return Response.json(result.created ? 201 : 200, result.workout.toDTO())
            })

        server
            .route("/workouts/:id", {authenticated: true, includeUser: true})
            .putJSON<SaveWorkoutRequest, WorkoutDTO>(async (request) => {
                const existing = await DBWorkout.findByPk(request.parameter.id)
                if (existing === null) {
                    return failure(404, "NOT_FOUND", "Dieses Programm gibt es nicht.")
                }
                // Der mitgelieferte Katalog gehört niemandem und bleibt, wie er
                // ist - wer ihn ändern will, legt sich eine Kopie an.
                if (existing.isBuiltIn || existing.ownerUserID !== request.user.id) {
                    return failure(403, "UNAUTHORIZED", "Dieses Programm gehört dir nicht.")
                }

                const result = await upsertWorkout(
                    {...request.body, id: request.parameter.id},
                    request.user.id
                )
                if (typeof result === "string") {
                    return failure(400, "INVALID_BODY", result)
                }
                return Response.json(200, result.workout.toDTO())
            })

        server.route("/workouts/:id", {authenticated: false}).get<WorkoutDTO>(async (request) => {
            const workout = await DBWorkout.findByPk(request.parameter.id, {include: ownerInclude})
            // Ein privates Programm ist für Fremde nicht "verboten", sondern
            // gar nicht vorhanden - alles andere verrät, dass es existiert.
            if (workout === null || !workout.isVisibleTo(request.authenticatedUserID)) {
                return failure(404, "NOT_FOUND", "Dieses Programm gibt es nicht.")
            }
            return Response.json(200, workout.toDTO())
        })

        server
            .route("/workouts/:id", {authenticated: true, includeUser: true})
            .delete<{deleted: boolean}>(async (request) => {
                const removed = await DBWorkout.destroy({
                    where: {id: request.parameter.id, ownerUserID: request.user.id, isBuiltIn: false},
                })
                if (removed === 0) {
                    return failure(404, "NOT_FOUND", "Dieses Programm gibt es nicht.")
                }
                return Response.json(200, {deleted: true})
            })
    }
}

export async function ownWorkouts(userID: number): Promise<WorkoutDTO[]> {
    const workouts = await DBWorkout.findAll({
        where: {ownerUserID: userID},
        include: ownerInclude,
        order: [["updatedAt", "DESC"]],
    })
    return workouts.map((workout) => workout.toDTO())
}

interface UpsertResult {
    workout: DBWorkout
    created: boolean
}

/** `string` ist der Grund für die Ablehnung. */
async function upsertWorkout(
    body: SaveWorkoutRequest | null | undefined,
    userID: number
): Promise<UpsertResult | string> {
    const valid = validateWorkout(body)
    if (typeof valid === "string") {
        return valid
    }

    const metrics = workoutMetrics(valid.segments)
    const id = typeof body?.id === "string" && body.id.length > 0 ? body.id.toLowerCase() : randomUUID()

    const existing = await DBWorkout.findByPk(id)
    if (existing !== null) {
        // Fremde oder mitgelieferte Programme werden nicht überschrieben, auch
        // nicht, wenn die Kennung stimmt.
        if (existing.isBuiltIn || existing.ownerUserID !== userID) {
            return "Dieses Programm gehört dir nicht."
        }
        await existing.update({
            name: valid.name,
            summary: valid.summary,
            tags: valid.tags,
            segments: valid.segments,
            visibility: valid.visibility,
            durationSeconds: metrics.durationSeconds,
            plannedTSS: metrics.plannedTSS,
        })
        // Ohne Nachladen fehlt die Verknüpfung zum Urheber, und die Antwort
        // hätte ownerName: null - obwohl sie ihn gerade selbst gesetzt hat.
        await existing.reload({include: ownerInclude})
        return {workout: existing, created: false}
    }

    const workout = await DBWorkout.create({
        id,
        ownerUserID: userID,
        name: valid.name,
        summary: valid.summary,
        tags: valid.tags,
        segments: valid.segments,
        visibility: valid.visibility,
        durationSeconds: metrics.durationSeconds,
        plannedTSS: metrics.plannedTSS,
        isBuiltIn: false,
    })
    await workout.reload({include: ownerInclude})
    return {workout, created: true}
}

function parseLimit(raw: unknown, fallback = 40, max = 100): number {
    const parsed = typeof raw === "string" ? parseInt(raw, 10) : NaN
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback
    }
    return Math.min(parsed, max)
}

function buildSearchWhere(query: Record<string, unknown>): WhereOptions {
    const conditions: WhereOptions[] = [{visibility: "public"}]

    const text = typeof query.query === "string" ? query.query.trim() : ""
    if (text.length > 0) {
        const pattern = `%${escapeLike(text)}%`
        conditions.push({[Op.or]: [{name: {[Op.like]: pattern}}, {summary: {[Op.like]: pattern}}]})
    }

    const tag = typeof query.tag === "string" ? query.tag.trim() : ""
    if (tag.length > 0) {
        // Der Umweg über CAST ist nicht kosmetisch: `tags` ist eine
        // JSON-Spalte, und Sequelize serialisiert den Vergleichswert dann
        // ebenfalls als JSON. Aus `%"Berg"%` wird `"%\"Berg\"%"`, und das
        // trifft nie etwas. Als CHAR ist es eine gewöhnliche Textsuche.
        conditions.push(
            whereClause(cast(col("tags"), "CHAR"), {[Op.like]: `%"${escapeLike(tag)}"%`})
        )
    }

    const duration: Record<symbol, number> = {}
    const min = parseInt(String(query.minDurationSeconds ?? ""), 10)
    const max = parseInt(String(query.maxDurationSeconds ?? ""), 10)
    if (Number.isFinite(min)) {
        duration[Op.gte] = min
    }
    if (Number.isFinite(max)) {
        duration[Op.lte] = max
    }
    if (Object.getOwnPropertySymbols(duration).length > 0) {
        conditions.push({durationSeconds: duration} as WhereOptions)
    }

    return {[Op.and]: conditions}
}

/** `%` und `_` sind in LIKE Platzhalter - in einer Suchanfrage sind sie es nicht. */
function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}
