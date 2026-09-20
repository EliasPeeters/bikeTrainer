#!/usr/bin/env node
/**
 * Baut das MCP-Bundle (.mcpb) fuer Claude Desktop.
 *
 * Ein Bundle ist ein Zip aus `manifest.json` und dem Server. Der Nutzer oeffnet
 * die Datei per Doppelklick, Claude Desktop zeigt einen Installationsdialog mit
 * den Feldern aus `user_config` - und traegt den Zugangsschluessel maskiert ein.
 * Kein Terminal, kein curl, keine Umgebungsvariablen.
 *
 * Anders als `yarn build` wird hier *alles* eingebunden, auch das MCP-SDK und
 * zod. Im Bundle gibt es kein node_modules, an dem sich der Server bedienen
 * koennte: was nicht in der Datei steht, fehlt beim Start.
 */
import {execFileSync} from "node:child_process"
import {cpSync, mkdirSync, readFileSync, rmSync, statSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = dirname(dirname(packageRoot))
const staging = join(packageRoot, "dist", "bundle")
const output = join(packageRoot, "dist", "wattwerk.mcpb")

const manifestPath = join(packageRoot, "bundle", "manifest.json")
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))

// Zwei Versionsnummern, die auseinanderlaufen, sind auf Dauer schlimmer als
// eine, die weh tut, wenn man sie vergisst.
if (manifest.version !== pkg.version) {
    console.error(
        `Version stimmt nicht: manifest.json sagt ${manifest.version}, package.json sagt ${pkg.version}.`
    )
    process.exit(1)
}

rmSync(staging, {recursive: true, force: true})
mkdirSync(join(staging, "server"), {recursive: true})

console.log("Bündle den Server samt Abhängigkeiten …")
execFileSync(
    "npx",
    [
        "esbuild",
        join(packageRoot, "src", "stdio.ts"),
        "--bundle",
        "--platform=node",
        "--target=node18",
        "--format=cjs",
        `--outfile=${join(staging, "server", "index.js")}`,
        `--alias:@wattwerk/shared=${join(repoRoot, "packages", "shared", "src", "index.ts")}`,
        "--minify",
    ],
    {stdio: "inherit", cwd: repoRoot}
)

cpSync(manifestPath, join(staging, "manifest.json"))
cpSync(join(packageRoot, "bundle", "icon.png"), join(staging, "icon.png"))

console.log("Packe …")
execFileSync("npx", ["--yes", "@anthropic-ai/mcpb@latest", "pack", staging, output], {
    stdio: "inherit",
    cwd: repoRoot,
})

const size = statSync(output).size
console.log(`\n${output} — ${(size / 1024 / 1024).toFixed(2)} MB`)
