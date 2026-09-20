import {
    API_KEY_PREFIX,
    apiKeyPreview,
    generateApiKey,
    hashApiKey,
    hashesMatch,
    isApiKey,
} from "../../src/service/ApiKeyToken"

describe("Zugangsschluessel erzeugen", () => {
    it("traegt das Praefix und genug Zufall", () => {
        const key = generateApiKey()
        expect(key.startsWith(API_KEY_PREFIX)).toBe(true)
        // 32 Bytes base64url sind 43 Zeichen, dazu das Praefix.
        expect(key).toHaveLength(API_KEY_PREFIX.length + 43)
        expect(key).toMatch(/^wk_[A-Za-z0-9_-]+$/)
    })

    it("erzeugt jedes Mal einen anderen", () => {
        const keys = new Set(Array.from({length: 200}, generateApiKey))
        expect(keys.size).toBe(200)
    })
})

describe("Erkennen", () => {
    it("unterscheidet Schluessel von Zugangstoken", () => {
        expect(isApiKey(generateApiKey())).toBe(true)
        expect(isApiKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def")).toBe(false)
        expect(isApiKey("")).toBe(false)
    })
})

describe("Hashen", () => {
    it("ist stabil und 64 Zeichen lang", () => {
        const key = generateApiKey()
        expect(hashApiKey(key)).toBe(hashApiKey(key))
        expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/)
    })

    it("gibt fuer verschiedene Schluessel verschiedene Hashes", () => {
        expect(hashApiKey(generateApiKey())).not.toBe(hashApiKey(generateApiKey()))
    })

    it("enthaelt den Schluessel selbst nicht", () => {
        const key = generateApiKey()
        expect(hashApiKey(key)).not.toContain(key.slice(API_KEY_PREFIX.length, 20))
    })
})

describe("Vorschau", () => {
    it("zeigt genug zum Wiedererkennen und zu wenig zum Raten", () => {
        const key = generateApiKey()
        const preview = apiKeyPreview(key)
        expect(preview).toHaveLength(API_KEY_PREFIX.length + 6)
        expect(key.startsWith(preview)).toBe(true)
        expect(preview.length).toBeLessThan(key.length / 2)
    })
})

describe("Hashvergleich", () => {
    it("vergleicht gleiche und ungleiche Werte richtig", () => {
        const hash = hashApiKey(generateApiKey())
        expect(hashesMatch(hash, hash)).toBe(true)
        expect(hashesMatch(hash, hashApiKey(generateApiKey()))).toBe(false)
    })

    it("faellt bei verschiedener Laenge nicht um", () => {
        expect(hashesMatch("kurz", "etwas laenger")).toBe(false)
    })
})
