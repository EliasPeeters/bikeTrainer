/**
 * `config.ts` liest die Umgebung beim Laden des Moduls. Die Werte muessen also
 * stehen, bevor der erste Test etwas importiert.
 */
process.env.WATTWERK_API_URL = "http://api.test"
process.env.WATTWERK_EMAIL = "test@example.com"
process.env.WATTWERK_PASSWORD = "geheim12345"
delete process.env.WATTWERK_ACCESS_TOKEN
delete process.env.WATTWERK_REFRESH_TOKEN
