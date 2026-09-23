import {
    RideTrackResponse,
    TrainingSessionListResponse,
    TrainingSessionPayload,
    TrainingSessionResponse,
} from "@wattwerk/shared"
import {Op} from "sequelize"
import {DBTrainingSession} from "../db/DBTrainingSession"
import {DBTrainingSessionTrack} from "../db/DBTrainingSessionTrack"
import {DBWorkout} from "../db/DBWorkout"
import {failure, Response, Server} from "../server"
import {validateTrack} from "./RideTrackValidation"
import {isNonEmptyString} from "./Validation"

const MAX_SESSIONS_PER_PAGE = 200

/**
 * Die gefahrenen Einheiten aus der App.
 */
export class TrainingSessionService {
    public configure(server: Server) {
        server
            .route("/sessions", {authenticated: true, includeUser: true})
            // Grosser Koerper: mit Sekundenspur ist eine lange Fahrt ein paar
            // hundert Kilobyte, und die Standardgrenze von 1 MB schneidet sie
            // ohne brauchbare Meldung ab.
            .postLargeJSON<TrainingSessionPayload, TrainingSessionResponse>(async (request) => {
                const body = request.body
                const problem = validatePayload(body)
                if (problem !== null) {
                    return failure(400, "INVALID_BODY", problem)
                }

                // Die Spur wird vor dem Schreiben geprueft, nicht danach: eine
                // Einheit anzulegen und die Kurve dann still fallen zu lassen
                // waere der Fall, den niemand bemerkt.
                let track = null
                if (body.track !== undefined && body.track !== null) {
                    const checked = validateTrack(body.track, body.durationSeconds)
                    if (!checked.ok) {
                        return failure(400, "INVALID_BODY", checked.problem)
                    }
                    track = checked.track
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

                if (track !== null) {
                    await DBTrainingSessionTrack.upsert({sessionID: session.id, ...track})
                }
                // Kam kein `track` mit, bleibt eine vorhandene Spur stehen.
                // Version 1.0 der App kennt das Feld nicht, und auf dem Apple
                // TV faellt es weg - beide duerfen eine Kurve, die schon da
                // ist, nicht loeschen, indem sie dieselbe Einheit noch einmal
                // hochladen.
                const hasTrack =
                    track !== null ||
                    (await DBTrainingSessionTrack.count({where: {sessionID: session.id}})) > 0

                return Response.json(existing === null ? 201 : 200, session.toResponse(hasTrack))
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

                // Eine Abfrage fuer alle: welche der geladenen Einheiten eine
                // Spur haben. Je Zeile nachzusehen waere ein Roundtrip pro
                // Kachel im Verlauf.
                const trackIDs = new Set<number>()
                if (sessions.length > 0) {
                    const withTrack = await DBTrainingSessionTrack.findAll({
                        where: {sessionID: {[Op.in]: sessions.map((session) => session.id)}},
                        attributes: ["sessionID"],
                    })
                    for (const entry of withTrack) {
                        trackIDs.add(entry.sessionID)
                    }
                }

                return Response.json(200, {
                    sessions: sessions.map((session) => session.toResponse(trackIDs.has(session.id))),
                    stressLastSevenDays: recent.reduce((sum, entry) => sum + entry.trainingStressScore, 0),
                })
            })

        // Einzelne Einheit: das Web-Portal zeigt eine Kurve auf einer eigenen
        // Seite und soll dafuer nicht den ganzen Verlauf laden.
        server
            .route("/sessions/:id", {authenticated: true, includeUser: true})
            .get<TrainingSessionResponse>(async (request) => {
                const id = parseInt(request.parameter.id, 10)
                if (!Number.isFinite(id)) {
                    return failure(400, "INVALID_BODY", "Ungültige Kennung.")
                }

                const session = await DBTrainingSession.findOne({
                    where: {id, userID: request.user.id},
                })
                if (session === null) {
                    return failure(404, "NOT_FOUND", "Diese Einheit gibt es nicht.")
                }

                const hasTrack = (await DBTrainingSessionTrack.count({where: {sessionID: id}})) > 0
                return Response.json(200, session.toResponse(hasTrack))
            })

        server
            .route("/sessions/:id/track", {authenticated: true, includeUser: true})
            .get<RideTrackResponse>(async (request) => {
                const id = parseInt(request.parameter.id, 10)
                if (!Number.isFinite(id)) {
                    return failure(400, "INVALID_BODY", "Ungültige Kennung.")
                }

                // Erst die Einheit, dann die Spur: gehoert die Einheit jemand
                // anderem, darf die Antwort nicht verraten, ob es zu dieser
                // Kennung ueberhaupt eine Kurve gibt.
                const session = await DBTrainingSession.findOne({
                    where: {id, userID: request.user.id},
                    attributes: ["id"],
                })
                if (session === null) {
                    return failure(404, "NOT_FOUND", "Diese Einheit gibt es nicht.")
                }

                const track = await DBTrainingSessionTrack.findByPk(id)
                if (track === null) {
                    return failure(
                        404,
                        "NOT_FOUND",
                        "Zu dieser Einheit liegt kein Sekundenverlauf - sie wurde vor Version 1.1 " +
                            "aufgezeichnet oder auf einem Gerät, das keinen speichert."
                    )
                }

                return Response.json(200, {sessionID: id, track: track.toDTO()})
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
