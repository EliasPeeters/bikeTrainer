import type {
    AddToCollectionRequest,
    CollectionDTO,
    CollectionListResponse,
    SaveCollectionRequest,
} from "@wattwerk/shared"
import {randomUUID} from "node:crypto"
import {DBCollection, DBCollectionItem} from "../db/DBCollection"
import {DBWorkout} from "../db/DBWorkout"
import {failure, Response, Server} from "../server"
import {ownerInclude} from "./WorkoutService"

const MAX_ITEMS_PER_COLLECTION = 200

/**
 * Sammlungen: Ordner und Playlists.
 */
export class CollectionService {
    public configure(server: Server) {
        server
            .route("/collections", {authenticated: true, includeUser: true})
            .get<CollectionListResponse>(async (request) => {
                return Response.json(200, {collections: await loadCollections(request.user.id)})
            })

        server
            .route("/collections", {authenticated: true, includeUser: true})
            .postJSON<SaveCollectionRequest, CollectionDTO>(async (request) => {
                const result = await saveCollection(request.body, request.user.id)
                if (typeof result === "string") {
                    return failure(400, "INVALID_BODY", result)
                }
                return Response.json(201, result)
            })

        server
            .route("/collections/:id", {authenticated: true, includeUser: true})
            .putJSON<SaveCollectionRequest, CollectionDTO>(async (request) => {
                const result = await saveCollection(
                    {...request.body, id: request.parameter.id},
                    request.user.id
                )
                if (typeof result === "string") {
                    return failure(400, "INVALID_BODY", result)
                }
                return Response.json(200, result)
            })

        server
            .route("/collections/:id", {authenticated: true, includeUser: true})
            .delete<{deleted: boolean}>(async (request) => {
                const removed = await DBCollection.destroy({
                    where: {id: request.parameter.id, ownerUserID: request.user.id},
                })
                if (removed === 0) {
                    return failure(404, "NOT_FOUND", "Diese Sammlung gibt es nicht.")
                }
                return Response.json(200, {deleted: true})
            })

        server
            .route("/collections/:id/items", {authenticated: true, includeUser: true})
            .postJSON<AddToCollectionRequest, CollectionDTO>(async (request) => {
                const collection = await ownCollection(request.parameter.id, request.user.id)
                if (collection === null) {
                    return failure(404, "NOT_FOUND", "Diese Sammlung gibt es nicht.")
                }

                const workoutID = request.body?.workoutID
                if (typeof workoutID !== "string" || workoutID.length === 0) {
                    return failure(400, "INVALID_BODY", "workoutID fehlt.")
                }

                const workout = await DBWorkout.findByPk(workoutID)
                // In eine Sammlung darf nur, was man auch sehen darf - sonst
                // wäre sie ein Weg, an fremde private Programme zu kommen.
                if (workout === null || !workout.isVisibleTo(request.user.id)) {
                    return failure(404, "NOT_FOUND", "Dieses Programm gibt es nicht.")
                }

                const count = await DBCollectionItem.count({where: {collectionID: collection.id}})
                if (count >= MAX_ITEMS_PER_COLLECTION) {
                    return failure(400, "INVALID_BODY", "Die Sammlung ist voll.")
                }

                await DBCollectionItem.upsert({
                    collectionID: collection.id,
                    workoutID,
                    sortIndex: count,
                    addedAt: new Date(),
                })
                // Die Sammlung hat sich geändert, auch wenn ihre eigenen Spalten
                // gleich geblieben sind - sonst sortiert sie die Übersicht falsch ein.
                await collection.update({updatedAt: new Date()})

                return Response.json(200, await loadCollection(collection))
            })

        server
            .route("/collections/:id/items/:workoutID", {authenticated: true, includeUser: true})
            .delete<CollectionDTO>(async (request) => {
                const collection = await ownCollection(request.parameter.id, request.user.id)
                if (collection === null) {
                    return failure(404, "NOT_FOUND", "Diese Sammlung gibt es nicht.")
                }

                await DBCollectionItem.destroy({
                    where: {collectionID: collection.id, workoutID: request.parameter.workoutID},
                })
                await collection.update({updatedAt: new Date()})

                return Response.json(200, await loadCollection(collection))
            })
    }
}

async function ownCollection(id: string, userID: number): Promise<DBCollection | null> {
    return await DBCollection.findOne({where: {id, ownerUserID: userID}, include: ownerInclude})
}

export async function loadCollections(userID: number): Promise<CollectionDTO[]> {
    const collections = await DBCollection.findAll({
        where: {ownerUserID: userID},
        include: ownerInclude,
        order: [["updatedAt", "DESC"]],
    })
    return await Promise.all(collections.map(loadCollection))
}

/**
 * Lädt den Inhalt in der gespeicherten Reihenfolge.
 *
 * Erst die Einträge, dann die Programme in einer Abfrage, dann in der
 * Reihenfolge der Einträge zusammensetzen: `WHERE id IN (…)` gibt die Zeilen in
 * beliebiger Reihenfolge zurück, und eine Playlist ohne Reihenfolge ist keine.
 */
export async function loadCollection(collection: DBCollection): Promise<CollectionDTO> {
    const items = await DBCollectionItem.findAll({
        where: {collectionID: collection.id},
        order: [["sortIndex", "ASC"]],
    })
    if (items.length === 0) {
        return collection.toDTO([])
    }

    const workouts = await DBWorkout.findAll({
        where: {id: items.map((item) => item.workoutID)},
        include: ownerInclude,
    })
    const byID = new Map(workouts.map((workout) => [workout.id, workout]))
    const ordered = items
        .map((item) => byID.get(item.workoutID))
        .filter((workout): workout is DBWorkout => workout !== undefined)

    return collection.toDTO(ordered)
}

async function saveCollection(
    body: SaveCollectionRequest | null | undefined,
    userID: number
): Promise<CollectionDTO | string> {
    if (body === null || body === undefined || typeof body !== "object") {
        return "Der Anfragekörper fehlt."
    }
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return "Die Sammlung braucht einen Namen."
    }

    const id = typeof body.id === "string" && body.id.length > 0 ? body.id.toLowerCase() : randomUUID()
    const visibility = body.visibility === "public" ? "public" : "private"
    const values = {
        name: body.name.trim().slice(0, 200),
        summary: typeof body.summary === "string" ? body.summary.trim().slice(0, 500) : "",
        visibility: visibility as "private" | "public",
    }

    let collection = await DBCollection.findByPk(id, {include: ownerInclude})
    if (collection !== null) {
        if (collection.ownerUserID !== userID) {
            return "Diese Sammlung gehört dir nicht."
        }
        await collection.update(values)
    } else {
        collection = await DBCollection.create({id, ownerUserID: userID, ...values})
    }

    if (Array.isArray(body.workoutIDs)) {
        const visible = await DBWorkout.findAll({where: {id: body.workoutIDs.slice(0, MAX_ITEMS_PER_COLLECTION)}})
        const allowed = visible.filter((workout) => workout.isVisibleTo(userID)).map((workout) => workout.id)
        const ordered = body.workoutIDs.filter((workoutID) => allowed.includes(workoutID))

        await DBCollectionItem.destroy({where: {collectionID: collection.id}})
        if (ordered.length > 0) {
            await DBCollectionItem.bulkCreate(
                ordered.map((workoutID, index) => ({
                    collectionID: collection.id,
                    workoutID,
                    sortIndex: index,
                    addedAt: new Date(),
                }))
            )
        }
    }

    return await loadCollection(collection)
}
