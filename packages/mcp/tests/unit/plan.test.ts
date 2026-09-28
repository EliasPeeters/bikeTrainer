import {Client} from "@modelcontextprotocol/sdk/client/index.js"
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js"
import type {PlanEntryDTO, SavePlanRequest, WorkoutDTO} from "@wattwerk/shared"
import {WattwerkApiError, type WattwerkClient} from "../../src/api"
import {planText} from "../../src/format"
import {createMcpServer} from "../../src/index"
import {toSavePlanRequest} from "../../src/tools/plan"

const SWEET = "a1000000-0000-4000-8000-000000000002"
const TABATA = "a1000000-0000-4000-8000-000000000007"

function workout(id: string, name: string, overrides: Partial<WorkoutDTO> = {}): WorkoutDTO {
    return {
        id,
        name,
        summary: "",
        tags: [],
        visibility: "public",
        segments: [{durationSeconds: 1800, target: {type: "percentFTP", value: 0.8}}],
        durationSeconds: 1800,
        plannedTSS: 40,
        isBuiltIn: true,
        ownerUserID: null,
        ownerName: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    }
}

function entry(weekday: number, id: string, workoutID: string, name: string, sortIndex = 0): PlanEntryDTO {
    return {id, weekday, workoutID, workoutName: name, sortIndex, workout: workout(workoutID, name)}
}

/**
 * Eine API im Speicher: sie haelt den Plan und kennt ein paar Programme.
 * Gespeichert wird so, wie die echte es tut - als Ganzes, und zurueck kommt
 * derselbe Stand mit aufgeloesten Programmen.
 */
class FakeApi {
    entries: PlanEntryDTO[] = []
    saves: SavePlanRequest[] = []
    workouts = new Map([
        [SWEET, workout(SWEET, "Sweet Spot 3×12")],
        [TABATA, workout(TABATA, "Tabata")],
    ])

    async plan() {
        return {entries: this.entries}
    }

    async savePlan(body: SavePlanRequest) {
        this.saves.push(body)
        this.entries = body.entries.map((saved) => ({
            ...saved,
            sortIndex: saved.sortIndex ?? 0,
            workout: this.workouts.get(saved.workoutID) ?? null,
        }))
        return {entries: this.entries}
    }

    async workout(id: string) {
        const found = this.workouts.get(id)
        if (found === undefined) {
            throw new WattwerkApiError(404, "NOT_FOUND", "Programm nicht gefunden.")
        }
        return found
    }
}

async function connect(api: FakeApi) {
    const server = createMcpServer(api as unknown as WattwerkClient)
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await server.connect(serverSide)
    const client = new Client({name: "test", version: "1.0.0"})
    await client.connect(clientSide)
    return client
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({name, arguments: args})
    const content = result.content as Array<{type: string; text: string}>
    return {text: content.map((part) => part.text).join("\n"), isError: result.isError === true}
}

describe("Wochenplan als Text", () => {
    it("zeigt jeden Tag, auch die freien, mit beiden Kennungen", () => {
        const text = planText([entry(2, "e1", SWEET, "Sweet Spot 3×12")])
        expect(text).toContain("1 Einheit · 30:00 · 40 TSS geplant")
        expect(text).toContain("Montag: frei")
        expect(text).toContain("Dienstag:\n- Sweet Spot 3×12 — 30:00 · 40 TSS")
        expect(text).toContain(`Programm: ${SWEET} · Eintrag: e1`)
        expect(text).toContain("Sonntag: frei")
    })

    it("sagt, wenn ein Programm nicht mehr da ist, statt es wegzulassen", () => {
        const text = planText([{...entry(4, "e1", SWEET, "Altes Programm"), workout: null}])
        expect(text).toContain("Altes Programm — nicht mehr verfügbar")
    })

    it("sagt bei leerem Plan, womit man ihn füllt", () => {
        expect(planText([])).toContain("add_workout_to_plan")
    })
})

describe("Reihenfolge beim Speichern", () => {
    it("zählt sortIndex je Tag von vorn", () => {
        const request = toSavePlanRequest([
            {id: "a", weekday: 2, workoutID: SWEET, workoutName: "x"},
            {id: "b", weekday: 2, workoutID: TABATA, workoutName: "y"},
            {id: "c", weekday: 5, workoutID: SWEET, workoutName: "x"},
        ])
        expect(request.entries.map((saved) => [saved.id, saved.sortIndex])).toEqual([
            ["a", 0],
            ["b", 1],
            ["c", 0],
        ])
    })
})

describe("Werkzeuge für den Wochenplan", () => {
    it("stehen im Verzeichnis", async () => {
        const client = await connect(new FakeApi())
        const {tools} = await client.listTools()
        const names = tools.map((tool) => tool.name)
        expect(names).toEqual(expect.arrayContaining(["get_plan", "add_workout_to_plan", "remove_from_plan", "set_plan"]))
        expect(tools.find((tool) => tool.name === "get_plan")?.annotations?.readOnlyHint).toBe(true)
    })

    it("planen ein Programm ein, ohne den Rest anzufassen", async () => {
        const api = new FakeApi()
        api.entries = [entry(2, "e1", SWEET, "Sweet Spot 3×12"), entry(6, "e2", TABATA, "Tabata")]
        const client = await connect(api)

        const result = await call(client, "add_workout_to_plan", {weekday: 2, workoutID: TABATA.toUpperCase()})

        expect(result.isError).toBe(false)
        expect(result.text).toContain("Tabata am Dienstag eingeplant.")
        const saved = api.saves[0].entries
        expect(saved.map((e) => [e.weekday, e.workoutID, e.sortIndex])).toEqual([
            [2, SWEET, 0],
            [2, TABATA, 1],
            [6, TABATA, 0],
        ])
        // Die bestehenden Einträge behalten ihre Kennung - sonst sähe jedes
        // Gerät beim nächsten Abgleich einen ganz neuen Plan.
        expect(saved[0].id).toBe("e1")
        expect(saved[2].id).toBe("e2")
    })

    it("speichern nichts, wenn es das Programm nicht gibt", async () => {
        const api = new FakeApi()
        const client = await connect(api)

        const result = await call(client, "add_workout_to_plan", {
            weekday: 3,
            workoutID: "99999999-9999-4999-8999-999999999999",
        })

        expect(result.isError).toBe(true)
        expect(result.text).toContain("99999999-9999-4999-8999-999999999999")
        expect(api.saves).toHaveLength(0)
    })

    it("nehmen über die Eintrags-Kennung oder über Tag und Programm heraus", async () => {
        const api = new FakeApi()
        api.entries = [
            entry(2, "e1", SWEET, "Sweet Spot 3×12"),
            entry(2, "e2", TABATA, "Tabata", 1),
            entry(4, "e3", TABATA, "Tabata"),
        ]
        const client = await connect(api)

        await call(client, "remove_from_plan", {entryID: "E1"})
        expect(api.entries.map((e) => e.id)).toEqual(["e2", "e3"])

        const byDay = await call(client, "remove_from_plan", {weekday: 4, workoutID: TABATA})
        expect(byDay.text).toContain("Tabata (Donnerstag)")
        expect(api.entries.map((e) => e.id)).toEqual(["e2"])
    })

    it("melden, wenn nichts passt, und verlangen eine eindeutige Angabe", async () => {
        const api = new FakeApi()
        api.entries = [entry(2, "e1", SWEET, "Sweet Spot 3×12")]
        const client = await connect(api)

        const nothing = await call(client, "remove_from_plan", {weekday: 5, workoutID: SWEET})
        expect(nothing.isError).toBe(true)
        expect(nothing.text).toContain("Kein passender Eintrag")

        const vague = await call(client, "remove_from_plan", {weekday: 2})
        expect(vague.isError).toBe(true)
        expect(api.saves).toHaveLength(0)
    })

    it("ersetzen den ganzen Plan, nach Tagen geordnet", async () => {
        const api = new FakeApi()
        api.entries = [entry(1, "alt", SWEET, "Sweet Spot 3×12")]
        const client = await connect(api)

        const result = await call(client, "set_plan", {
            entries: [
                {weekday: 6, workoutID: TABATA},
                {weekday: 2, workoutID: SWEET},
                {weekday: 2, workoutID: TABATA},
            ],
        })

        expect(result.text).toContain("Wochenplan gespeichert.")
        expect(api.entries.map((e) => [e.weekday, e.workoutName, e.sortIndex])).toEqual([
            [2, "Sweet Spot 3×12", 0],
            [2, "Tabata", 1],
            [6, "Tabata", 0],
        ])
        expect(api.entries.some((e) => e.id === "alt")).toBe(false)

        await call(client, "set_plan", {entries: []})
        expect(api.entries).toHaveLength(0)
    })

    it("lesen den Plan", async () => {
        const api = new FakeApi()
        api.entries = [entry(7, "e1", TABATA, "Tabata")]
        const client = await connect(api)
        const result = await call(client, "get_plan")
        expect(result.text).toContain("Sonntag:\n- Tabata")
    })
})
