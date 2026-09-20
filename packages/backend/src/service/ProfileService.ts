import {UpdateProfileRequest, UserResponse} from "@wattwerk/shared"
import {failure, Response, Server} from "../server"
import {optionalIntInRange, optionalNumberInRange, sanitizeName} from "./Validation"

/**
 * Das Fahrerprofil - dieselben Werte, die in der App unter "Profil" stehen.
 */
export class ProfileService {
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
    }
}
