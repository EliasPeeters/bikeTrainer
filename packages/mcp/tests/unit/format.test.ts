import type {CollectionDTO, TrainingSessionResponse, WorkoutDTO} from "@wattwerk/shared"
import {
    clock,
    collectionLine,
    count,
    profileText,
    segments,
    sessionLine,
    target,
    workoutDetail,
    workoutLine,
} from "../../src/format"

function workout(overrides: Partial<WorkoutDTO> = {}): WorkoutDTO {
    return {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Schwelle 2×20",
        summary: "Zwei lange Blöcke an der Schwelle.",
        tags: ["Schwelle"],
        visibility: "private",
        segments: [
            {durationSeconds: 600, target: {type: "percentFTP", value: 0.55}},
            {durationSeconds: 1200, target: {type: "percentFTP", value: 0.98}},
        ],
        durationSeconds: 1800,
        plannedTSS: 42,
        isBuiltIn: false,
        ownerUserID: 1,
        ownerName: "Elias",
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
        ...overrides,
    }
}

describe("Zeitangaben", () => {
    it("laesst die Stunde weg, solange es keine gibt", () => {
        expect(clock(0)).toBe("0:00")
        expect(clock(59)).toBe("0:59")
        expect(clock(600)).toBe("10:00")
        expect(clock(3599)).toBe("59:59")
    })

    it("zeigt Stunden mit zweistelligen Minuten", () => {
        expect(clock(3600)).toBe("1:00:00")
        expect(clock(3900)).toBe("1:05:00")
        expect(clock(7325)).toBe("2:02:05")
    })
})

describe("Leistungsvorgaben", () => {
    it("rechnet den Anteil der FTP in Prozent um", () => {
        expect(target({type: "percentFTP", value: 0.9})).toBe("90 % FTP")
        expect(target({type: "percentFTP", value: 1.2})).toBe("120 % FTP")
    })

    it("zeigt Watt als Watt", () => {
        expect(target({type: "watts", value: 210.4})).toBe("210 W")
    })

    it("nennt fehlende Vorgaben frei", () => {
        expect(target({type: "free"})).toBe("frei")
        expect(target(null)).toBe("frei")
        expect(target(undefined)).toBe("frei")
    })
})

describe("Bloecke", () => {
    it("zieht gleiche Bloecke hintereinander zusammen", () => {
        const rendered = segments([
            {durationSeconds: 30, target: {type: "percentFTP", value: 1.5}},
            {durationSeconds: 30, target: {type: "percentFTP", value: 1.5}},
            {durationSeconds: 30, target: {type: "percentFTP", value: 1.5}},
            {durationSeconds: 300, target: {type: "free"}},
        ])
        expect(rendered).toBe("  3× 0:30 @ 150 % FTP\n  5:00 @ frei")
    })

    it("macht aus targetEnd eine Rampe", () => {
        const rendered = segments([
            {
                durationSeconds: 600,
                target: {type: "percentFTP", value: 0.5},
                targetEnd: {type: "percentFTP", value: 0.75},
            },
        ])
        expect(rendered).toBe("  10:00 @ 50 % FTP → 75 % FTP")
    })

    it("nimmt die Trittfrequenz nur mit, wenn beide Grenzen da sind", () => {
        expect(
            segments([
                {
                    durationSeconds: 60,
                    target: {type: "watts", value: 200},
                    cadenceLow: 85,
                    cadenceHigh: 95,
                    title: "Antritt",
                },
            ])
        ).toBe("  1:00 @ 200 W, 85–95 U/min (Antritt)")

        expect(
            segments([{durationSeconds: 60, target: {type: "watts", value: 200}, cadenceLow: 85}])
        ).toBe("  1:00 @ 200 W")
    })
})

describe("Pluralformen", () => {
    it("unterscheidet Einzahl und Mehrzahl", () => {
        expect(count(1, "Programm", "Programme")).toBe("1 Programm")
        expect(count(0, "Programm", "Programme")).toBe("0 Programme")
        expect(count(2, "Programm", "Programme")).toBe("2 Programme")
    })
})

describe("Programmzeilen", () => {
    it("nennt immer die Kennung - ohne sie ist kein weiterer Aufruf moeglich", () => {
        expect(workoutLine(workout())).toContain("id: 11111111-1111-1111-1111-111111111111")
    })

    it("unterscheidet Katalog von geteilten Programmen", () => {
        expect(workoutLine(workout({isBuiltIn: true, visibility: "public"}))).toContain("Katalog")
        expect(workoutLine(workout({visibility: "public"}))).toContain("von Elias")
    })

    it("zeigt im Detail alle Bloecke", () => {
        const detail = workoutDetail(workout())
        expect(detail).toContain("Schwelle 2×20")
        expect(detail).toContain("2 Blöcke")
        expect(workoutDetail(workout({segments: [{durationSeconds: 60, target: {type: "free"}}]})))
            .toContain("1 Block ·")
        expect(detail).toContain("10:00 @ 55 % FTP")
        expect(detail).toContain("20:00 @ 98 % FTP")
    })
})

describe("Sammlungen", () => {
    it("zaehlt Programme und summiert die Dauer", () => {
        const collection: CollectionDTO = {
            id: "22222222-2222-2222-2222-222222222222",
            name: "Woche 1",
            summary: "",
            visibility: "private",
            ownerUserID: 1,
            ownerName: "Elias",
            workouts: [workout(), workout({id: "33333333-3333-3333-3333-333333333333"})],
            createdAt: "2026-09-01T10:00:00.000Z",
            updatedAt: "2026-09-01T10:00:00.000Z",
        }
        const line = collectionLine(collection)
        expect(line).toContain("2 Programme · 1:00:00")
        expect(line).toContain("1. Schwelle 2×20")
        expect(line).toContain("2. Schwelle 2×20")
    })
})

describe("Einheiten", () => {
    it("bringt die Kennzahlen in eine Zeile", () => {
        const session: TrainingSessionResponse = {
            id: 7,
            clientID: "abc",
            workoutName: "Schwelle 2×20",
            workoutID: null,
            startedAt: "2026-09-18T17:30:00.000Z",
            durationSeconds: 3600,
            completed: false,
            ftp: 250,
            averagePower: 210,
            maxPower: 480,
            normalizedPower: 225,
            intensityFactor: 0.9,
            trainingStressScore: 81,
            kilojoules: 756,
            averageCadence: 88,
            averageHeartRate: 148,
            maxHeartRate: 176,
            createdAt: "2026-09-18T18:30:00.000Z",
        }
        const line = sessionLine(session)
        expect(line).toContain("2026-09-18 17:30")
        expect(line).toContain("81 TSS")
        expect(line).toContain("IF 0.90")
        expect(line).toContain("abgebrochen")
        expect(line).toContain("id: 7")
    })
})

describe("Profil", () => {
    it("rechnet Watt pro Kilogramm aus", () => {
        const text = profileText({
            id: 1,
            email: "elias@example.com",
            name: "Elias",
            mailContactAllowed: false,
            ftp: 250,
            maxHeartRate: 190,
            restingHeartRate: 48,
            weightKg: 72,
            createdAt: "2026-01-15T08:00:00.000Z",
        })
        expect(text).toContain("3.47 W/kg")
        expect(text).toContain("Konto seit 2026-01-15")
    })
})
