import {RateLimiter} from "../../src/service/RateLimiter"

describe("Ratenbegrenzung", () => {
    it("laesst das Kontingent durch und bremst danach", () => {
        const limiter = new RateLimiter(3, 60_000)
        const now = 1_000_000

        expect(limiter.check("ip", now)).toBe(true)
        expect(limiter.check("ip", now)).toBe(true)
        expect(limiter.check("ip", now)).toBe(true)
        expect(limiter.check("ip", now)).toBe(false)
    })

    it("zaehlt je Schluessel getrennt", () => {
        const limiter = new RateLimiter(1, 60_000)
        const now = 1_000_000

        expect(limiter.check("a", now)).toBe(true)
        expect(limiter.check("a", now)).toBe(false)
        expect(limiter.check("b", now)).toBe(true)
    })

    it("gibt nach Ablauf des Fensters wieder frei", () => {
        const limiter = new RateLimiter(2, 60_000)
        const start = 1_000_000

        expect(limiter.check("ip", start)).toBe(true)
        expect(limiter.check("ip", start)).toBe(true)
        expect(limiter.check("ip", start + 59_000)).toBe(false)
        expect(limiter.check("ip", start + 61_000)).toBe(true)
    })

    it("verlaengert die Sperre nicht durch weiteres Klopfen", () => {
        // Abgelehnte Versuche duerfen nicht mitzaehlen, sonst haelt jemand, der
        // stur weiterprobiert, sich selbst dauerhaft aus.
        const limiter = new RateLimiter(1, 60_000)
        const start = 1_000_000

        expect(limiter.check("ip", start)).toBe(true)
        for (let i = 0; i < 50; i++) {
            expect(limiter.check("ip", start + 1000 + i)).toBe(false)
        }
        expect(limiter.check("ip", start + 61_000)).toBe(true)
    })

    it("raeumt abgelaufene Schluessel weg", () => {
        const limiter = new RateLimiter(5, 1000)
        limiter.check("a", 1000)
        limiter.check("b", 1000)
        expect(limiter.size).toBe(2)

        limiter.cleanup(5000)
        expect(limiter.size).toBe(0)
    })
})
