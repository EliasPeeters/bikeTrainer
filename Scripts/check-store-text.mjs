#!/usr/bin/env node
// Zählt die Felder in assets/store/texte.md gegen die Grenzen von App Store
// Connect. Dort merkt man eine Überschreitung erst beim Einfügen, und dann
// fehlt der Satz, den man am Ende abschneiden muss.
//
//   node Scripts/check-store-text.mjs

import {readFile} from "node:fs/promises"
import {dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const FILE = resolve(ROOT, "assets/store/texte.md")

// **Feldname** (max. 170, irgendein Zusatz)  gefolgt von einem Codeblock.
const FIELD = /\*\*(.+?)\*\*\s*\(max\.\s*(\d+)[^)]*\)\s*\n+```\n([\s\S]*?)\n```/g

const text = await readFile(FILE, "utf8")
let failures = 0
let checked = 0
let section = "?"

for (const line of text.split("\n")) {
    if (line.startsWith("## ")) section = line.slice(3).trim()
}

// Abschnitt je Treffer bestimmen: die letzte Überschrift davor.
function sectionAt(index) {
    const before = text.slice(0, index)
    const headings = before.match(/^## .+$/gm)
    return headings ? headings[headings.length - 1].slice(3).trim() : "?"
}

for (const match of text.matchAll(FIELD)) {
    const [, field, limitRaw, body] = match
    const limit = Number(limitRaw)
    const length = body.length
    const ok = length <= limit
    checked += 1
    if (!ok) failures += 1
    console.log(
        `${ok ? "ok  " : "ZU LANG"}  ${sectionAt(match.index).padEnd(26)} ${field.padEnd(18)} ${String(length).padStart(5)} / ${limit}`
    )
}

console.log(`\n${checked} Felder geprüft, ${failures} zu lang.`)
process.exit(failures === 0 ? 0 : 1)
