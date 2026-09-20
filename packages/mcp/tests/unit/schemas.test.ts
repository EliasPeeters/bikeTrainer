import {segmentSchema, toSaveWorkoutRequest, workoutInputShape} from "../../src/schemas"
import {z} from "zod"

const workoutSchema = z.object(workoutInputShape)

describe("Umwandlung ins Drahtformat", () => {
    it("macht aus fehlenden Angaben null statt undefined", () => {
        const request = toSaveWorkoutRequest({
            name: "  Schwelle  ",
            segments: [{durationSeconds: 600, target: {type: "percentFTP", value: 0.9}}],
        })

        expect(request.segments[0]).toEqual({
            title: null,
            durationSeconds: 600,
            target: {type: "percentFTP", value: 0.9},
            targetEnd: null,
            cadenceLow: null,
            cadenceHigh: null,
        })
        // Die API schneidet und trimmt selbst - hier wird nichts vorweggenommen.
        expect(request.name).toBe("  Schwelle  ")
        expect(request.summary).toBe("")
        expect(request.tags).toEqual([])
        expect(request.visibility).toBe("private")
        expect(request.id).toBeUndefined()
    })

    it("nimmt die Kennung mit, wenn eine mitgegeben wird", () => {
        const request = toSaveWorkoutRequest(
            {name: "Schwelle", segments: [{durationSeconds: 60, target: {type: "free"}}]},
            "abc"
        )
        expect(request.id).toBe("abc")
    })

    it("behaelt Rampen und Trittfrequenz", () => {
        const request = toSaveWorkoutRequest({
            name: "Rampe",
            visibility: "public",
            tags: ["Test"],
            summary: "Kurz",
            segments: [
                {
                    title: "Rampe",
                    durationSeconds: 300,
                    target: {type: "watts", value: 150},
                    targetEnd: {type: "watts", value: 300},
                    cadenceLow: 80,
                    cadenceHigh: 90,
                },
            ],
        })

        expect(request.visibility).toBe("public")
        expect(request.segments[0].targetEnd).toEqual({type: "watts", value: 300})
        expect(request.segments[0].cadenceLow).toBe(80)
    })
})

describe("Eingabepruefung", () => {
    it("verlangt mindestens einen Block", () => {
        expect(workoutSchema.safeParse({name: "Leer", segments: []}).success).toBe(false)
    })

    it("verlangt einen Namen", () => {
        expect(
            workoutSchema.safeParse({
                name: "",
                segments: [{durationSeconds: 60, target: {type: "free"}}],
            }).success
        ).toBe(false)
    })

    it("weist unbekannte Zieltypen ab, bevor die API es tut", () => {
        expect(
            segmentSchema.safeParse({durationSeconds: 60, target: {type: "herzfrequenz", value: 150}})
                .success
        ).toBe(false)
    })

    it("weist Dauern ohne Sinn ab", () => {
        expect(segmentSchema.safeParse({durationSeconds: 0, target: {type: "free"}}).success).toBe(false)
        expect(segmentSchema.safeParse({durationSeconds: -60, target: {type: "free"}}).success).toBe(false)
        expect(segmentSchema.safeParse({durationSeconds: 1.5, target: {type: "free"}}).success).toBe(false)
    })
})
