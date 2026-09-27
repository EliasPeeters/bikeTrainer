import {MAX_PLAN_ENTRIES, validatePlan} from "../../src/service/PlanValidation"

const WORKOUT = "a1000000-0000-4000-8000-000000000002"
const ID_A = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
const ID_B = "3f2504e0-4f89-41d3-9a0c-0305e82c3302"
const ID_C = "3f2504e0-4f89-41d3-9a0c-0305e82c3303"

describe("Wochenplan-Pruefung", () => {
    it("zaehlt ohne sortIndex je Wochentag und uebernimmt einen mitgeschickten", () => {
        const result = validatePlan({
            entries: [
                {id: ID_A, weekday: 2, workoutID: WORKOUT, workoutName: "A"},
                {id: ID_B, weekday: 5, workoutID: WORKOUT, workoutName: "B", sortIndex: 7},
                {id: ID_C, weekday: 2, workoutID: WORKOUT, workoutName: "C"},
            ],
        })
        expect(result).toEqual([
            {id: ID_A, weekday: 2, workoutID: WORKOUT, workoutName: "A", sortIndex: 0},
            {id: ID_B, weekday: 5, workoutID: WORKOUT, workoutName: "B", sortIndex: 7},
            {id: ID_C, weekday: 2, workoutID: WORKOUT, workoutName: "C", sortIndex: 1},
        ])
    })

    it("erkennt doppelte Kennungen auch in anderer Schreibweise", () => {
        const result = validatePlan({
            entries: [
                {id: ID_A, weekday: 1, workoutID: WORKOUT, workoutName: "A"},
                {id: ID_A.toUpperCase(), weekday: 2, workoutID: WORKOUT, workoutName: "B"},
            ],
        })
        expect(typeof result).toBe("string")
    })

    it("laesst einen leeren Plan zu und begrenzt die Groesse", () => {
        expect(validatePlan({entries: []})).toEqual([])
        const tooMany = Array.from({length: MAX_PLAN_ENTRIES + 1}, (_, index) => ({
            id: `3f2504e0-4f89-41d3-9a0c-${String(index).padStart(12, "0")}`,
            weekday: 1,
            workoutID: WORKOUT,
            workoutName: "x",
        }))
        expect(typeof validatePlan({entries: tooMany})).toBe("string")
    })

    it("nimmt nur ganze Wochentage von 1 bis 7", () => {
        for (const weekday of [0, 8, 1.5, "1", null]) {
            const result = validatePlan({
                entries: [{id: ID_A, weekday: weekday as number, workoutID: WORKOUT, workoutName: "A"}],
            })
            expect(typeof result).toBe("string")
        }
    })
})
