import type {PlanEntryDTO, PlanResponse, SavePlanRequest} from "@wattwerk/shared"
import {UniqueConstraintError} from "sequelize"
import {DBPlanEntry} from "../db/DBPlanEntry"
import {DBWorkout} from "../db/DBWorkout"
import {failure, Response, Server} from "../server"
import {validatePlan} from "./PlanValidation"
import {ownerInclude} from "./WorkoutService"

/**
 * Der Wochenplan: welches Programm an welchem Wochentag.
 *
 * Nur zwei Routen, Lesen und Ersetzen. Warum der Plan als Ganzes geht und
 * nicht Eintrag für Eintrag, steht bei `SavePlanRequest` in `@wattwerk/shared`.
 */
export class PlanService {
    public configure(server: Server) {
        server
            .route("/plan", {authenticated: true, includeUser: true})
            .get<PlanResponse>(async (request) => {
                return Response.json(200, {entries: await loadPlan(request.user.id)})
            })

        // Auch mit Zugangsschlüssel erlaubt: den Plan zu pflegen ist genau
        // das, wofür ein Assistent da ist. Ein Schlüssel mit `read` bekommt
        // sein 403 schon in `wrapRequest`.
        server
            .route("/plan", {authenticated: true, includeUser: true})
            .putJSON<SavePlanRequest, PlanResponse>(async (request) => {
                const entries = validatePlan(request.body)
                if (typeof entries === "string") {
                    return failure(400, "INVALID_BODY", entries)
                }

                const userID = request.user.id
                // Löschen und neu einfügen statt abgleichen: bei einer Handvoll
                // Zeilen ist das einfacher als jede Buchführung darüber, was
                // sich geändert hat, und in der Transaktion des Requests sieht
                // niemand einen halb ersetzten Plan.
                await DBPlanEntry.destroy({where: {userID}})
                if (entries.length > 0) {
                    try {
                        await DBPlanEntry.bulkCreate(entries.map((entry) => ({...entry, userID})))
                    } catch (error) {
                        // Die eigenen Zeilen sind in diesem Moment schon weg,
                        // doppelte Kennungen hat die Prüfung abgewiesen - ein
                        // Konflikt kann also nur mit dem Eintrag eines anderen
                        // Nutzers sein. Überschrieben wird der nicht: die
                        // Kennung ist der Primärschlüssel, und `failure` verwirft
                        // die Transaktion, sodass auch das Löschen oben
                        // zurückgenommen wird. Abgefangen statt vorher gesucht,
                        // weil nur so auch zwei gleichzeitige Anfragen sauber
                        // enden statt mit 500.
                        if (error instanceof UniqueConstraintError) {
                            return failure(
                                409,
                                "CONFLICT",
                                "Eine Kennung im Plan ist schon vergeben. Bitte neue Kennungen erzeugen."
                            )
                        }
                        throw error
                    }
                }

                return Response.json(200, {entries: await loadPlan(userID)})
            })
    }
}

/**
 * Der Plan in Anzeigereihenfolge, mit den Programmen, die der Nutzer sehen darf.
 *
 * Die Programme kommen in einer Abfrage und werden dann zugeordnet, wie bei den
 * Sammlungen. Sichtbar ist, was `isVisibleTo` sagt - dieselbe Regel wie beim
 * Abruf eines einzelnen Programms. Sonst wäre der Plan ein Weg, fremde private
 * Programme zu lesen: man müsste nur ihre Kennung einplanen.
 */
export async function loadPlan(userID: number): Promise<PlanEntryDTO[]> {
    const entries = await DBPlanEntry.findAll({
        where: {userID},
        // `id` zuletzt nur, damit gleiche sortIndex-Werte nicht bei jedem
        // Abruf anders herum stehen.
        order: [["weekday", "ASC"], ["sortIndex", "ASC"], ["id", "ASC"]],
    })
    if (entries.length === 0) {
        return []
    }

    const workoutIDs = [...new Set(entries.map((entry) => entry.workoutID))]
    const workouts = await DBWorkout.findAll({where: {id: workoutIDs}, include: ownerInclude})
    const visible = new Map(
        workouts.filter((workout) => workout.isVisibleTo(userID)).map((workout) => [workout.id, workout])
    )

    return entries.map((entry) => entry.toDTO(visible.get(entry.workoutID) ?? null))
}
