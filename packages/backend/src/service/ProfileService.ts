import {DeleteAccountRequest, UpdateProfileRequest, UserResponse} from "@wattwerk/shared"
import {failure, Response, Server} from "../server"
import {PasswordService} from "./PasswordService"
import {optionalIntInRange, optionalNumberInRange, sanitizeName} from "./Validation"

/**
 * Das Fahrerprofil - dieselben Werte, die in der App unter "Profil" stehen.
 */
export class ProfileService {
    constructor(private readonly passwordService: PasswordService) {}

    public configure(server: Server) {
        server
            .route("/me", {authenticated: true, includeUser: true})
            .get<UserResponse>(async (request) => Response.json(200, request.user.toResponse()))

        server
            .route("/me", {authenticated: true, includeUser: true})
            .putJSON<UpdateProfileRequest, UserResponse>(async (request) => {
                const body = request.body
                if (body === null || typeof body !== "object") {
                    return failure(400, "INVALID_BODY", "Der Anfragekoerper fehlt.")
                }

                // Die Grenzen sind bewusst weit, aber endlich: eine FTP von
                // 30000 W ist kein Tippfehler mehr, sondern kaputte Statistik in
                // jeder Auswertung, die danach darauf rechnet.
                const ftp = optionalIntInRange(body.ftp, 50, 600)
                const maxHeartRate = optionalIntInRange(body.maxHeartRate, 120, 230)
                const restingHeartRate = optionalIntInRange(body.restingHeartRate, 30, 100)
                const weightKg = optionalNumberInRange(body.weightKg, 30, 250)

                if (ftp === null || maxHeartRate === null || restingHeartRate === null || weightKg === null) {
                    return failure(400, "INVALID_BODY", "Mindestens ein Wert liegt außerhalb des erlaubten Bereichs.")
                }

                await request.user.update({
                    ...(body.name !== undefined ? {name: sanitizeName(body.name)} : {}),
                    ...(ftp !== undefined ? {ftp} : {}),
                    ...(maxHeartRate !== undefined ? {maxHeartRate} : {}),
                    ...(restingHeartRate !== undefined ? {restingHeartRate} : {}),
                    ...(weightKg !== undefined ? {weightKg} : {}),
                    ...(body.mailContactAllowed !== undefined
                        ? {mailContactAllowed: body.mailContactAllowed === true}
                        : {}),
                })

                return Response.json(200, request.user.toResponse())
            })

        // POST statt DELETE, weil ein Koerper mitgeht: nicht jeder Client und
        // nicht jeder Proxy reicht einen Koerper bei DELETE durch.
        server
            .route("/me/delete", {authenticated: true, includeUser: true})
            .postJSON<DeleteAccountRequest, {deleted: boolean}>(async (request) => {
                const password = request.body?.password
                if (typeof password !== "string" || password.length === 0) {
                    return failure(400, "INVALID_BODY", "Zum Löschen wird das Passwort gebraucht.")
                }

                const matches = await this.passwordService.checkPassword(
                    password,
                    request.user.passwordHash
                )
                if (!matches) {
                    return failure(401, "INVALID_CREDENTIALS", "Das Passwort stimmt nicht.")
                }

                // Einheiten, Programme und Sammlungen haengen per Fremdschluessel
                // mit ON DELETE CASCADE am Konto - die Datenbank raeumt sie mit
                // weg. Auch oeffentlich geteilte Programme verschwinden: sie
                // gehoeren dem Konto, und "geloescht" soll geloescht heissen.
                await request.user.destroy()

                return Response.json(200, {deleted: true})
            })
    }
}
