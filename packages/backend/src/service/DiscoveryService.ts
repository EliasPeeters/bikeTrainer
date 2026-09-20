import type {DiscoveryResponse, DiscoveryRow, WorkoutDTO} from "@wattwerk/shared"
import {Op, QueryTypes} from "sequelize"
import {DBTrainingSession} from "../db/DBTrainingSession"
import {DBWorkout} from "../db/DBWorkout"
import {sequelize} from "../db/db"
import {Response, Server} from "../server"
import {loadCollections} from "./CollectionService"
import {ownerInclude} from "./WorkoutService"

const ROW_SIZE = 12

/**
 * Die Startseite der Bibliothek.
 *
 * Der Server setzt die Reihen zusammen, App und Web-Portal zeichnen nur, was
 * kommt. Dadurch lässt sich an den Empfehlungen drehen, ohne zwei Clients neu
 * auszuliefern - und beide zeigen garantiert dasselbe.
 *
 * Die Reihen sind Heuristiken, keine gelernten Empfehlungen: es gibt noch keine
 * Nutzungsdaten, aus denen sich etwas lernen ließe. "Beliebt" zählt schlicht,
 * wie oft ein Programm gefahren wurde.
 */
export class DiscoveryService {
    public configure(server: Server) {
        // Ohne Anmeldung erreichbar, damit die Landingpage den Katalog zeigen
        // kann, bevor sich jemand registriert. Angemeldet kommen die
        // persönlichen Reihen dazu.
        server.route("/discover", {authenticated: false}).get<DiscoveryResponse>(async (request) => {
            const userID = request.authenticatedUserID
            const rows: DiscoveryRow[] = []

            if (userID !== undefined) {
                const recent = await recentlyRidden(userID)
                pushRow(rows, {
                    key: "continue",
                    title: "Zuletzt gefahren",
                    subtitle: "Noch einmal, oder weitermachen",
                    workouts: recent,
                })

                const own = await DBWorkout.findAll({
                    where: {ownerUserID: userID},
                    include: ownerInclude,
                    order: [["updatedAt", "DESC"]],
                    limit: ROW_SIZE,
                })
                pushRow(rows, {
                    key: "own",
                    title: "Deine Programme",
                    workouts: own.map((workout) => workout.toDTO()),
                })
            }

            pushRow(rows, {
                key: "popular",
                title: "Top-Tipps",
                subtitle: "Am häufigsten gefahren",
                workouts: await mostRidden(),
            })

            pushRow(rows, {
                key: "fresh",
                title: "Neu veröffentlicht",
                subtitle: "Von anderen geteilt",
                workouts: await publicWorkouts({isBuiltIn: false}, [["createdAt", "DESC"]]),
            })

            pushRow(rows, {
                key: "short",
                title: "Kurz und knackig",
                subtitle: "Unter 45 Minuten",
                workouts: await publicWorkouts(
                    {durationSeconds: {[Op.lte]: 45 * 60}},
                    [["plannedTSS", "DESC"]]
                ),
            })

            pushRow(rows, {
                key: "long",
                title: "Lange Einheiten",
                subtitle: "Ab einer Stunde",
                workouts: await publicWorkouts(
                    {durationSeconds: {[Op.gte]: 60 * 60}},
                    [["durationSeconds", "DESC"]]
                ),
            })

            pushRow(rows, {
                key: "hard",
                title: "Wenn es wehtun darf",
                workouts: await publicWorkouts({plannedTSS: {[Op.gte]: 70}}, [["plannedTSS", "DESC"]]),
            })

            pushRow(rows, {
                key: "catalog",
                title: "Aus dem Katalog",
                subtitle: "Die mitgelieferten Programme",
                workouts: await publicWorkouts({isBuiltIn: true}, [["durationSeconds", "ASC"]]),
            })

            return Response.json(200, {
                rows,
                collections: userID === undefined ? [] : await loadCollections(userID),
            })
        })
    }
}

/** Leere Reihen werden weggelassen - eine Überschrift ohne Inhalt ist kein Angebot. */
function pushRow(rows: DiscoveryRow[], row: DiscoveryRow) {
    if (row.workouts.length > 0) {
        rows.push(row)
    }
}

async function publicWorkouts(
    extra: Record<string, unknown>,
    order: Array<[string, string]>
): Promise<WorkoutDTO[]> {
    const workouts = await DBWorkout.findAll({
        where: {visibility: "public", ...extra},
        include: ownerInclude,
        order,
        limit: ROW_SIZE,
    })
    return workouts.map((workout) => workout.toDTO())
}

async function recentlyRidden(userID: number): Promise<WorkoutDTO[]> {
    const sessions = await DBTrainingSession.findAll({
        where: {userID, workoutID: {[Op.ne]: null}},
        order: [["startedAt", "DESC"]],
        limit: 40,
        attributes: ["workoutID"],
    })

    // Reihenfolge der letzten Fahrten behalten, Dubletten raus.
    const seen = new Set<string>()
    const ids: string[] = []
    for (const session of sessions) {
        const id = session.workoutID
        if (id !== null && id !== undefined && !seen.has(id)) {
            seen.add(id)
            ids.push(id)
        }
    }
    if (ids.length === 0) {
        return []
    }

    const workouts = await DBWorkout.findAll({where: {id: ids}, include: ownerInclude})
    const byID = new Map(workouts.map((workout) => [workout.id, workout]))
    return ids
        .slice(0, ROW_SIZE)
        .map((id) => byID.get(id))
        .filter((workout): workout is DBWorkout => workout !== undefined)
        .filter((workout) => workout.isVisibleTo(userID))
        .map((workout) => workout.toDTO())
}

/**
 * "Beliebt" heißt hier: oft gefahren. Eine eigene Abfrage statt einer Spalte am
 * Programm, weil ein Zähler, der bei jedem Upload hochgezählt wird, bei jedem
 * gelöschten Konto falsch wird.
 */
async function mostRidden(): Promise<WorkoutDTO[]> {
    const rows = await sequelize.query<{workoutID: string}>(
        `SELECT s.workoutID AS workoutID, COUNT(*) AS rides
         FROM trainingSession s
         JOIN workout w ON w.id = s.workoutID
         WHERE w.visibility = 'public'
         GROUP BY s.workoutID
         ORDER BY rides DESC
         LIMIT :limit`,
        {replacements: {limit: ROW_SIZE}, type: QueryTypes.SELECT}
    )
    if (rows.length === 0) {
        return []
    }

    const ids = rows.map((row) => row.workoutID)
    const workouts = await DBWorkout.findAll({where: {id: ids}, include: ownerInclude})
    const byID = new Map(workouts.map((workout) => [workout.id, workout]))
    return ids
        .map((id) => byID.get(id))
        .filter((workout): workout is DBWorkout => workout !== undefined)
        .map((workout) => workout.toDTO())
}
