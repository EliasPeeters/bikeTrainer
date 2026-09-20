import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js"
import {WattwerkClient} from "./api"
import {API_URL} from "./config"
import {createMcpServer} from "./index"

/**
 * Der stdio-Einstieg: der Client startet diesen Prozess und spricht ueber
 * stdin und stdout mit ihm.
 *
 * Eine eigene Datei und nicht das Ende von `index.ts`: esbuild buendelt
 * `index.ts` auch in `serve.js` mit hinein, und dort ist `require.main` das
 * Buendel selbst. Ein Start am Ende von `index.ts` wuerde damit im
 * HTTP-Dienst ebenfalls losgehen - und ein stdio-Server, der ungefragt auf
 * stdout schreibt, zerlegt dessen Ausgabe.
 */
async function main() {
    const client = new WattwerkClient()

    // Auf stdout laeuft das Protokoll - jede Ausgabe dorthin wuerde die
    // Verbindung zerlegen. Hinweise gehen deshalb nach stderr, wo der Client
    // sie ins Log schreibt.
    console.error(`[wattwerk-mcp] API: ${API_URL}`)
    if (!client.hasCredentials) {
        console.error(
            "[wattwerk-mcp] Ohne WATTWERK_EMAIL/WATTWERK_PASSWORD sind nur die öffentlichen " +
                "Werkzeuge nutzbar (search_workouts, browse_library, api_health)."
        )
    }

    await createMcpServer(client).connect(new StdioServerTransport())
}

main().catch((error) => {
    console.error("[wattwerk-mcp] Start fehlgeschlagen", error)
    process.exit(1)
})
