import type {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import {z} from "zod"
import type {WattwerkClient} from "../api"
import {collectionLine, count} from "../format"
import {guard, text} from "../result"

/**
 * Sammlungen sind Ordner und Playlist in einem: sie haben eine Reihenfolge, und
 * wer sie als Ordner benutzt, ignoriert sie einfach.
 */
export function registerCollectionTools(server: McpServer, client: WattwerkClient) {
    server.registerTool(
        "list_collections",
        {
            title: "Sammlungen",
            description:
                "Alle eigenen Sammlungen samt Inhalt in der gespeicherten Reihenfolge. " +
                "Eine Sammlung ist Ordner und Playlist zugleich - etwa ein Trainingsplan über vier Wochen.",
            inputSchema: {},
            annotations: {readOnlyHint: true, openWorldHint: true},
        },
        async () =>
            await guard(async () => {
                const collections = await client.collections()
                if (collections.length === 0) {
                    return text("Noch keine Sammlungen.")
                }
                return text(
                    `${count(collections.length, "Sammlung", "Sammlungen")}\n\n` +
                        collections.map(collectionLine).join("\n\n")
                )
            })
    )

    server.registerTool(
        "create_collection",
        {
            title: "Sammlung anlegen",
            description:
                "Legt eine Sammlung an, wahlweise gleich mit Inhalt. Die Reihenfolge von workoutIDs " +
                "ist die Reihenfolge der Sammlung.",
            inputSchema: {
                name: z.string().min(1).describe("Name der Sammlung"),
                summary: z.string().optional().describe("Wofür die Sammlung gut ist"),
                visibility: z.enum(["private", "public"]).optional().describe("Standard ist private"),
                workoutIDs: z
                    .array(z.string())
                    .optional()
                    .describe("Kennungen der Programme in der gewünschten Reihenfolge, höchstens 200"),
            },
            annotations: {readOnlyHint: false, destructiveHint: false, openWorldHint: true},
        },
        async (args) =>
            await guard(async () => {
                const collection = await client.createCollection(args)
                return text(`Angelegt.\n\n${collectionLine(collection)}`)
            })
    )

    server.registerTool(
        "update_collection",
        {
            title: "Sammlung ändern",
            description:
                "Ändert Name, Beschreibung oder Sichtbarkeit. Wird workoutIDs mitgeschickt, ersetzt " +
                "das den Inhalt vollständig - so wird auch umsortiert. Ohne workoutIDs bleibt der " +
                "Inhalt unangetastet.",
            inputSchema: {
                id: z.string().describe("Kennung der Sammlung"),
                name: z.string().min(1).describe("Name der Sammlung"),
                summary: z.string().optional(),
                visibility: z.enum(["private", "public"]).optional(),
                workoutIDs: z
                    .array(z.string())
                    .optional()
                    .describe("Ersetzt den Inhalt vollständig, in dieser Reihenfolge"),
            },
            annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true},
        },
        async ({id, ...rest}) =>
            await guard(async () => {
                const collection = await client.updateCollection(id, rest)
                return text(`Geändert.\n\n${collectionLine(collection)}`)
            })
    )

    server.registerTool(
        "delete_collection",
        {
            title: "Sammlung löschen",
            description: "Löscht die Sammlung. Die darin liegenden Programme bleiben bestehen.",
            inputSchema: {id: z.string().describe("Kennung der Sammlung")},
            annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true},
        },
        async ({id}) =>
            await guard(async () => {
                await client.deleteCollection(id)
                return text(`Sammlung ${id} gelöscht.`)
            })
    )

    server.registerTool(
        "add_workout_to_collection",
        {
            title: "Programm in Sammlung",
            description:
                "Hängt ein Programm hinten an die Sammlung an. Es muss sichtbar sein - eigene oder " +
                "öffentliche Programme gehen, fremde private nicht.",
            inputSchema: {
                id: z.string().describe("Kennung der Sammlung"),
                workoutID: z.string().describe("Kennung des Programms"),
            },
            annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true},
        },
        async ({id, workoutID}) =>
            await guard(async () => {
                const collection = await client.addToCollection(id, workoutID)
                return text(`Hinzugefügt.\n\n${collectionLine(collection)}`)
            })
    )

    server.registerTool(
        "remove_workout_from_collection",
        {
            title: "Programm aus Sammlung",
            description: "Nimmt ein Programm aus der Sammlung. Das Programm selbst bleibt bestehen.",
            inputSchema: {
                id: z.string().describe("Kennung der Sammlung"),
                workoutID: z.string().describe("Kennung des Programms"),
            },
            annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true},
        },
        async ({id, workoutID}) =>
            await guard(async () => {
                const collection = await client.removeFromCollection(id, workoutID)
                return text(`Entfernt.\n\n${collectionLine(collection)}`)
            })
    )
}
