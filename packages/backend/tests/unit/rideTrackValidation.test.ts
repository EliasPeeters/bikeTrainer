import {MAX_TRACK_SAMPLES, validateTrack} from "../../src/service/RideTrackValidation"

function track(overrides: Record<string, unknown> = {}) {
    return {
        sampleIntervalSeconds: 1,
        sampleCount: 3,
        startOffsetSeconds: 0,
        power: [100, 200, 150],
        ...overrides,
    }
}

describe("validateTrack", () => {
    it("nimmt eine gewoehnliche Spur an", () => {
        const result = validateTrack(track({heartRate: [120, 140, 135]}), 3)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.track.sampleCount).toBe(3)
        expect(result.track.channels.power).toEqual([100, 200, 150])
        expect(result.track.channels.heartRate).toEqual([120, 140, 135])
    })

    it("laesst eine Spalte weg, in der nichts gemessen wurde", () => {
        // Ein Trainer ohne Pulsmessung schickt eine Spalte voller null. Sie zu
        // speichern hiesse, der Oberflaeche eine leere Kurve anzubieten.
        const result = validateTrack(track({heartRate: [null, null, null]}), 3)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.track.channels.heartRate).toBeUndefined()
    })

    it("macht aus unmoeglichen Einzelwerten Luecken, nicht einen Fehler", () => {
        // 4000 W beim Antreten ist ein Messfehler des Trainers, kein Grund,
        // die ganze Einheit abzulehnen.
        const result = validateTrack(track({heartRate: [120, 4000, 135]}), 3)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.track.channels.heartRate).toEqual([120, null, 135])
    })

    it("rundet die Geschwindigkeit auf eine Nachkommastelle", () => {
        const result = validateTrack(track({speed: [31.4159, 30.0, 29.87]}), 3)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.track.channels.speed).toEqual([31.4, 30, 29.9])
    })

    it("weist Spalten ungleicher Laenge ab", () => {
        // Aufzufuellen waere schlimmer: der Puls staende ab irgendeiner Stelle
        // neben der falschen Sekunde und saehe aus wie eine echte Messung.
        const result = validateTrack(track({cadence: [80, 85]}), 3)
        expect(result.ok).toBe(false)
    })

    it("weist eine Spur ab, die laenger ist als die Einheit", () => {
        const long = track({power: new Array(600).fill(150)})
        expect(validateTrack(long, 60).ok).toBe(false)
        expect(validateTrack(long, 600).ok).toBe(true)
    })

    it("weist eine leere oder fehlende Leistungsspalte ab", () => {
        expect(validateTrack(track({power: []}), 60).ok).toBe(false)
        expect(validateTrack({sampleIntervalSeconds: 1}, 60).ok).toBe(false)
        expect(validateTrack(null, 60).ok).toBe(false)
        expect(validateTrack("keine Spur", 60).ok).toBe(false)
    })

    it("begrenzt die Laenge", () => {
        const absurd = track({power: new Array(MAX_TRACK_SAMPLES + 1).fill(100)})
        expect(validateTrack(absurd, 24 * 3600).ok).toBe(false)
    })
})
