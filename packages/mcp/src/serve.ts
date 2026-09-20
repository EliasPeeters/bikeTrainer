import {createHttpServer, MCP_PATH} from "./http"
import {API_URL, HTTP_ALLOWED_ORIGINS, HTTP_PORT} from "./config"

/**
 * Der HTTP-Einstieg.
 *
 * Eine eigene Datei, so wie `stdio.ts` neben `index.ts`: ein Modul, das beim
 * Import einen Sockel oeffnet, laesst sich weder testen noch woanders
 * einbinden - und ein `require.main`-Wachposten hilft nicht, weil esbuild die
 * Datei in ein Buendel legt, in dem sie selbst das Hauptmodul waere.
 */
function main() {
    const server = createHttpServer()
    server.listen(HTTP_PORT, () => {
        console.log(`[wattwerk-mcp] HTTP auf Port ${HTTP_PORT}${MCP_PATH}, API: ${API_URL}`)
        if (HTTP_ALLOWED_ORIGINS.length === 0) {
            console.log("[wattwerk-mcp] Keine Browser-Herkünfte freigegeben (WATTWERK_MCP_ALLOWED_ORIGINS).")
        }
    })

    // Laufende Aufrufe zu Ende bedienen, statt sie beim Deploy abzuschneiden.
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
        process.once(signal, () => {
            console.log(`[wattwerk-mcp] ${signal} erhalten, fahre herunter`)
            server.close(() => process.exit(0))
        })
    }
}

main()
