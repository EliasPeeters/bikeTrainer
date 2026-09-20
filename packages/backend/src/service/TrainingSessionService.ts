import {
    TrainingSessionListResponse,
    TrainingSessionPayload,
    TrainingSessionResponse,
} from "@wattwerk/shared"
import {Op} from "sequelize"
import {DBTrainingSession} from "../db/DBTrainingSession"
import {DBWorkout} from "../db/DBWorkout"
import {failure, Response, Server} from "../server"
import {isNonEmptyString} from "./Validation"

const MAX_SESSIONS_PER_PAGE = 200

/**
 * Die gefahrenen Einheiten aus der App.
 */
export class TrainingSessionService {
    public configure(server: Server) {
        server
            .route("/sessions", {authenticated: true, includeUser: true})
            .postJSON<TrainingSessionPayload, TrainingSessionResponse>(async (request) => {
                const body = request.body
                const problem = validatePayload(body)
                if (problem !== null) {
                    return failure(400, "INVALID_BODY", problem)
                }

                const startedAt = new Date(body.startedAt)
                const where = {userID: request.user.id, clientID: body.clientID}

                // Vorher nachsehen, weil MySQL beim Upsert nicht meldet, ob
                // eingefuegt oder aktualisiert wurde - und der Statuscode soll
                // die Wahrheit sagen.
                const existing = await DBTrainingSession.findOne({where})

                // Anlegen oder aktualisieren statt blind einfuegen: die App
                // wiederholt den Upload nach einem Netzfehler, und ein zweiter
                // Versuch soll keine zweite Einheit im Verlauf erzeugen.
                await DBTrainingSession.upsert({
                    userID: request.user.id,
                    clientID: body.clientID,
                    workoutName: body.workoutName.slice(0, 200),
                    // Die Kennung wird hier nicht gegen die Programmtabelle
                    // geprüft: ein lokal gebautes Programm, das nie hochgeladen
                    // wurde, hat trotzdem eine - und die Einheit deswegen
                    // abzulehnen wäre die schlechtere Antwort. Der
                    // Fremdschlüssel greift nur, wenn das Programm existiert.
                    workoutID: await knownWorkoutID(body.workoutID),
                    startedAt,
                    durationSeconds: Math.round(body.durationSeconds),
                    completed: body.completed === true,
                    ftp: Math.round(body.ftp),
                    averagePower: Math.round(body.averagePower),
                    maxPower: Math.round(body.maxPower),
                    normalizedPower: Math.round(body.normalizedPower),
                    intensityFactor: body.intensityFactor,
                    trainingStressScore: Math.round(body.trainingStressScore),
                    kilojoules: Math.round(body.kilojoules),
                    averageCadence: body.averageCadence ?? null,
                    averageHeartRate: body.averageHeartRate ?? null,
                    maxHeartRate: body.maxHeartRate ?? null,
                })

                // Noch einmal lesen: MySQL kennt kein RETURNING, deshalb traegt
                // die Instanz aus `upsert` nur die uebergebenen Werte - ohne id,
                // createdAt und updatedAt.
                const session = await DBTrainingSession.findOne({where})
                if (session === null) {
                    return failure(500, "INTERNAL", "Die Einheit konnte nicht gespeichert werden.")
                }

                return Response.json(existing === null ? 201 : 200, session.toResponse())
            })

        server
            .route("/sessions", {authenticated: true, includeUser: true})
            .get<TrainingSessionListResponse>(async (request) => {
                const limit = parseLimit(request.query.limit)
                const sessions = await DBTrainingSession.findAll({
                    where: {userID: request.user.id},
                    order: [["startedAt", "DESC"]],
                    limit,
                })

                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                // Eigene Abfrage statt Summe ueber die geladene Seite: sonst
                // haengt die Wochenbelastung daran, wie viele Einheiten das
                // Limit gerade durchlaesst.
                const recent = await DBTrainingSession.findAll({
                    where: {userID: request.user.id, startedAt: {[Op.gte]: sevenDaysAgo}},
                    attributes: ["trainingStressScore"],
                })

                return Response.json(200, {
                    sessions: sessions.map((session) => session.toResponse()),
                    stressLastSevenDays: recent.reduce((sum, entry) => sum + entry.trainingStressScore, 0),
                })
            })

        server
            .route("/sessions/:id", {authenticated: true, includeUser: true})
            .delete<{deleted: boolean}>(async (request) => {
                const id = parseInt(request.parameter.id, 10)
                if (!Number.isFinite(id)) {
                    return failure(400, "INVALID_BODY", "Ungültige Kennung.")
                }

                // userID gehoert in die Bedingung, nicht in eine Pruefung danach:
                // sonst loescht eine geratene Kennung fremde Einheiten.
                const removed = await DBTrainingSession.destroy({
                    where: {id, userID: request.user.id},
                })

                if (removed === 0) {
                    return failure(404, "NOT_FOUND", "Diese Einheit gibt es nicht.")
                }
                return Response.json(200, {deleted: true})
            })
    }
}

/** `null`, wenn es das Programm auf dem Server nicht gibt. */
async function knownWorkoutID(workoutID: string | null | undefined): Promise<string | null> {
    if (typeof workoutID !== "string" || workoutID.length === 0) {
        return null
    }
    const exists = await DBWorkout.findByPk(workoutID, {attributes: ["id"]})
    return exists === null ? null : exists.id
}

function parseLimit(raw: unknown): number {
    const parsed = typeof raw === "string" ? parseInt(raw, 10) : NaN
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 50
    }
    return Math.min(parsed, MAX_SESSIONS_PER_PAGE)
}

/** `null`, wenn der Koerper brauchbar ist - sonst der Grund. */
function validatePayload(body: TrainingSessionPayload | null): string | null {
    if (body === null || typeof body !== "object") {
        return "Der Anfragekoerper fehlt."
    }
    if (!isNonEmptyString(body.clientID) || body.clientID.length > 36) {
        return "clientID fehlt."
    }
    if (!isNonEmptyString(body.workoutName)) {
        return "workoutName fehlt."
    }
    if (!isNonEmptyString(body.startedAt) || Number.isNaN(new Date(body.startedAt).getTime())) {
        return "startedAt ist kein gültiges Datum."
    }

    const numbers: Array<[string, unknown]> = [
        ["durationSeconds", body.durationSeconds],
        ["ftp", body.ftp],
        ["averagePower", body.averagePower],
        ["maxPower", body.maxPower],
        ["normalizedPower", body.normalizedPower],
        ["intensityFactor", body.intensityFactor],
        ["trainingStressScore", body.trainingStressScore],
        ["kilojoules", body.kilojoules],
    ]
    for (const [name, value] of numbers) {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            return `${name} fehlt oder ist keine gültige Zahl.`
        }
    }
    if (body.durationSeconds > 24 * 3600) {
        return "durationSeconds ist unplausibel groß."
    }
    return null
}
