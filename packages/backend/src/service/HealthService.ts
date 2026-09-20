import {sequelize} from "../db/db"
import {Response, Server} from "../server"

interface HealthResponse {
    status: "ok" | "degraded"
    database: "up" | "down"
    uptimeSeconds: number
}

/**
 * Der Endpunkt, den Compose, Kubernetes und jeder Monitor abfragen.
 *
 * Bewusst ohne Datenbanktransaktion: eine Bereitschaftspruefung, die selbst
 * eine Transaktion oeffnet, faellt bei Last als Erstes um - und meldet dann
 * einen Ausfall, der keiner ist.
 */
export class HealthService {
    private readonly startedAt = Date.now()

    public configure(server: Server) {
        server
            .route("/health", {authenticated: false, databaseTransaction: false})
            .get<HealthResponse>(async () => {
                let database: "up" | "down" = "up"
                try {
                    await sequelize.query("SELECT 1")
                } catch {
                    database = "down"
                }

                return Response.json(database === "up" ? 200 : 503, {
                    status: database === "up" ? "ok" : "degraded",
                    database,
                    uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
                })
            })
    }
}
