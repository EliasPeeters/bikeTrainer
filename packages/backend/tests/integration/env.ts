/**
 * Laeuft vor dem Laden der Testdateien (jest `setupFiles`), also bevor
 * `config/env.ts` die Werte einmalig einliest.
 *
 * Die Anmelderouten sind bewusst eng begrenzt; ein Testlauf legt ein Dutzend
 * Konten an und liefe sonst nach dem fuenften in die Bremse. Dass die Bremse
 * wirkt, prueft `rateLimit.test.ts` mit einem eigenen Server.
 */
process.env.REGISTER_RATE_LIMIT = "10000"
process.env.LOGIN_RATE_LIMIT = "10000"
