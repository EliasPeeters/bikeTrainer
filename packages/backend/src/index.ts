import {ACCESS_TOKEN_SECRET, assertProductionConfig, PORT, REFRESH_TOKEN_SECRET} from "./config/env"
import {waitForDatabase} from "./db/db"
// Nur wegen der Nebenwirkung: registriert Modelle und Verknuepfungen.
import "./db/DBApiKey"
import "./db/DBOAuth"
import "./db/DBTrainingSession"
import "./db/DBCollection"
import "./db/DBWorkout"
import {Server} from "./server"
import {ApiKeyService} from "./service/ApiKeyService"
import {AuthService} from "./service/AuthService"
import {CollectionService} from "./service/CollectionService"
import {DiscoveryService} from "./service/DiscoveryService"
import {HealthService} from "./service/HealthService"
import {OAuthService} from "./service/OAuthService"
import {PasswordService} from "./service/PasswordService"
import {ProfileService} from "./service/ProfileService"
import {TokenService} from "./service/TokenService"
import {TrainingSessionService} from "./service/TrainingSessionService"
import {WorkoutService} from "./service/WorkoutService"

/**
 * Baut den Server, ohne ihn zu starten.
 *
 * Getrennt von `main`, damit die Integrationstests dieselbe Verdrahtung gegen
 * `supertest` fahren koennen. Ein zweiter Aufbau nur fuer Tests waere der Ort,
 * an dem Tests und Produktion auseinanderlaufen, ohne dass es jemand merkt.
 */
export function createServer(): Server {
    const server = new Server()

    const tokenService = new TokenService(ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET)
    const passwordService = new PasswordService()

    // Muss vor allen Routen stehen: legt die userID eines gueltigen Tokens ab.
    tokenService.configure(server)

    new HealthService().configure(server)
    new AuthService(tokenService, passwordService).configure(server)
    new ProfileService(passwordService).configure(server)
    new ApiKeyService().configure(server)
    new OAuthService(passwordService).configure(server)
    new TrainingSessionService().configure(server)
    new WorkoutService().configure(server)
    new CollectionService().configure(server)
    new DiscoveryService().configure(server)

    // Nach allen Routen: 404 und Fehlerbehandlung.
    server.finalize()

    return server
}

async function main() {
    assertProductionConfig()
    await waitForDatabase()
    createServer().listen(PORT)
}

// Beim Import aus den Tests soll nichts lauschen.
if (require.main === module) {
    main().catch((error) => {
        console.error("[SERVER] Start fehlgeschlagen", error)
        process.exit(1)
    })
}
