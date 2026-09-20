import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import {WattwerkClient} from "./api"
import {registerCollectionTools} from "./tools/collections"
import {registerProfileTools} from "./tools/profile"
import {registerSessionTools} from "./tools/sessions"
import {registerWorkoutTools} from "./tools/workouts"

const VERSION = "0.1.0"

/**
 * Die Wattwerk-API als MCP-Server.
 *
 * Damit kann ein Sprachmodell dasselbe wie App und Web-Portal: den Verlauf
 * lesen, die Bibliothek durchsuchen und eigene Programme anlegen. Die Werkzeuge
 * sind eins zu eins die Routen der API - es gibt hier keine zweite
 * Geschaeftslogik, die mit der API auseinanderlaufen koennte.
 */
export function createMcpServer(client: WattwerkClient = new WattwerkClient()): McpServer {
    const server = new McpServer(
        {name: "wattwerk", version: VERSION},
        {
            instructions:
                "Wattwerk ist strukturiertes Indoor-Radtraining. Ein Programm besteht aus Blöcken " +
                "mit Dauer und Leistungsvorgabe; Vorgaben in Prozent der FTP passen sich jedem Fahrer " +
                "an, absolute Watt nicht. Eine Sammlung ist Ordner und Playlist zugleich, etwa ein " +
                "Trainingsplan. TSS ist die Belastung einer Einheit - eine harte Stunde liegt bei 100. " +
                "Beim Planen lohnt sich zuerst get_profile (FTP) und list_sessions (was zuletzt " +
                "gefahren wurde); Vorlagen findet browse_library oder search_workouts.",
        }
    )

    registerWorkoutTools(server, client)
    registerCollectionTools(server, client)
    registerSessionTools(server, client)
    registerProfileTools(server, client)

    return server
}
