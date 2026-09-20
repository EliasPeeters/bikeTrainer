/**
 * Die CORS-Regel entscheidet, welche fremde Seite im Browser eines angemeldeten
 * Nutzers die API ansprechen darf. Sie wird beim Laden des Moduls einmal aus der
 * Umgebung gelesen, deshalb setzt jeder Fall sie neu und lädt das Modul frisch.
 */
function loadCorsOrigins(value: string | undefined, nodeEnv: string): string[] {
    jest.resetModules()
    if (value === undefined) {
        delete process.env.CORS_ORIGINS
    } else {
        process.env.CORS_ORIGINS = value
    }
    process.env.NODE_ENV = nodeEnv
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("../../src/config/env").CORS_ORIGINS as string[]
}

const originalEnv = {...process.env}

afterEach(() => {
    process.env = {...originalEnv}
})

describe("Erlaubte Herkünfte", () => {
    it("liest eine kommagetrennte Liste", () => {
        expect(loadCorsOrigins("https://a.de, https://b.de", "production")).toEqual([
            "https://a.de",
            "https://b.de",
        ])
    })

    it("verträgt Leerzeichen und leere Einträge", () => {
        expect(loadCorsOrigins(" https://a.de ,, ", "production")).toEqual(["https://a.de"])
    })

    it("ist leer, wenn nichts gesetzt ist", () => {
        expect(loadCorsOrigins(undefined, "production")).toEqual([])
        expect(loadCorsOrigins("", "development")).toEqual([])
    })
})
