import {
    isUUID,
    isValidEmail,
    MAX_PASSWORD_BYTES,
    optionalIntInRange,
    optionalNumberInRange,
    passwordIssue,
    sanitizeName,
} from "../../src/service/Validation"

describe("E-Mail-Pruefung", () => {
    it("nimmt normale Adressen an", () => {
        expect(isValidEmail("max@example.com")).toBe(true)
        expect(isValidEmail("max.mueller+wattwerk@sub.example.co.uk")).toBe(true)
        expect(isValidEmail("  max@example.com  ")).toBe(true)
    })

    it("weist ab, was sicher keine Adresse ist", () => {
        expect(isValidEmail("")).toBe(false)
        expect(isValidEmail("max")).toBe(false)
        expect(isValidEmail("max@")).toBe(false)
        expect(isValidEmail("max@localhost")).toBe(false)
        expect(isValidEmail("max @example.com")).toBe(false)
        expect(isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false)
    })
})

describe("Passwortregeln", () => {
    it("laesst ausreichend lange Passwoerter durch", () => {
        expect(passwordIssue("geheim12")).toBeNull()
    })

    it("lehnt zu kurze ab", () => {
        expect(passwordIssue("kurz")).not.toBeNull()
        expect(passwordIssue("")).not.toBeNull()
    })

    it("lehnt ab, was bcrypt ohnehin abschneiden wuerde", () => {
        // Genau an der Grenze noch erlaubt, ein Byte darueber nicht mehr.
        expect(passwordIssue("a".repeat(MAX_PASSWORD_BYTES))).toBeNull()
        expect(passwordIssue("a".repeat(MAX_PASSWORD_BYTES + 1))).not.toBeNull()
        // Umlaute zaehlen doppelt - die Grenze ist in Bytes, nicht in Zeichen.
        expect(passwordIssue("ä".repeat(MAX_PASSWORD_BYTES / 2 + 1))).not.toBeNull()
    })
})

describe("Namen", () => {
    it("trimmt und kuerzt", () => {
        expect(sanitizeName("  Elias  ")).toBe("Elias")
        expect(sanitizeName("x".repeat(200))).toHaveLength(120)
        expect(sanitizeName(undefined)).toBe("")
        expect(sanitizeName(42)).toBe("")
    })
})

describe("Zahlen aus dem Netz", () => {
    it("unterscheidet fehlend von ungueltig", () => {
        // undefined heisst "nicht mitgeschickt", null heisst "abgelehnt" - die
        // Profilroute darf ein weggelassenes Feld nicht wie einen Fehler behandeln.
        expect(optionalIntInRange(undefined, 50, 600)).toBeUndefined()
        expect(optionalIntInRange(250, 50, 600)).toBe(250)
        expect(optionalIntInRange(49, 50, 600)).toBeNull()
        expect(optionalIntInRange(601, 50, 600)).toBeNull()
        expect(optionalIntInRange("250", 50, 600)).toBeNull()
        expect(optionalIntInRange(NaN, 50, 600)).toBeNull()
        expect(optionalIntInRange(249.6, 50, 600)).toBe(250)
    })

    it("laesst Kommazahlen zu, wo sie hingehoeren", () => {
        expect(optionalNumberInRange(72.5, 30, 250)).toBe(72.5)
        expect(optionalNumberInRange(Infinity, 30, 250)).toBeNull()
    })
})

describe("UUID-Pruefung", () => {
    it("nimmt Kennungen aus Swift und aus dem Katalog an", () => {
        expect(isUUID("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(true)
        expect(isUUID("a1000000-0000-4000-8000-00000000000a")).toBe(true)
    })

    it("weist ab, was keine Kennung ist", () => {
        expect(isUUID("")).toBe(false)
        expect(isUUID("sweet-spot")).toBe(false)
        expect(isUUID("3f2504e0-4f89-41d3-9a0c-0305e82c330")).toBe(false)
        expect(isUUID(" 3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(false)
        expect(isUUID("3f2504e0-4f89-41d3-9a0c-0305e82c3301' OR 1=1")).toBe(false)
        expect(isUUID(42)).toBe(false)
        expect(isUUID(null)).toBe(false)
    })
})
