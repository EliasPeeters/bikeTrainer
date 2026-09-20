// Zeigt Zertifikate, Bundle-IDs und Profile des Teams, dem der
// API-Schluessel gehoert - unabhaengig davon, was Xcode zwischengespeichert hat.
//
//     node Scripts/asc-info.js

// Fragt die App-Store-Connect-API mit dem .p8-Schluessel ab.
const fs = require("fs")
const path = require("path")
const jwt = require(path.join(__dirname, "..", "node_modules", "jsonwebtoken"))

const KEY_ID = "PWF9SDKK9M"
const ISSUER = "111736bf-f38e-4a94-b110-ffd4123b9451"
const key = fs.readFileSync(`${process.env.HOME}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`)

const token = jwt.sign({}, key, {
    algorithm: "ES256",
    expiresIn: "10m",
    issuer: ISSUER,
    audience: "appstoreconnect-v1",
    header: {alg: "ES256", kid: KEY_ID, typ: "JWT"},
})

async function get(path) {
    const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
        headers: {Authorization: `Bearer ${token}`},
    })
    if (!response.ok) {
        console.error(`${path} -> HTTP ${response.status}`, (await response.text()).slice(0, 300))
        return null
    }
    return await response.json()
}

;(async () => {
    const certs = await get("/v1/certificates?limit=200")
    if (certs) {
        console.log("=== Zertifikate im Team dieses Schluessels ===")
        for (const c of certs.data) {
            const a = c.attributes
            const expired = new Date(a.expirationDate) < new Date()
            console.log(
                `${expired ? "ABGELAUFEN" : "gueltig   "}  bis ${a.expirationDate.slice(0, 10)}  ${a.certificateType.padEnd(28)} ${a.name}`
            )
        }
        if (certs.data.length === 0) console.log("  (keine)")
    }

    const bundles = await get("/v1/bundleIds?filter[identifier]=de.eliaspeeters.wattwerk")
    if (bundles) {
        console.log("=== Bundle-ID ===")
        for (const b of bundles.data) {
            console.log(`  ${b.attributes.identifier}  (${b.attributes.platform})  id=${b.id}`)
        }
        if (bundles.data.length === 0) console.log("  (nicht registriert)")
    }

    const profiles = await get("/v1/profiles?limit=200")
    if (profiles) {
        console.log("=== Profile ===")
        const relevant = profiles.data.filter((p) => p.attributes.name.toLowerCase().includes("wattwerk"))
        for (const p of relevant) {
            console.log(`  ${p.attributes.profileType.padEnd(22)} ${p.attributes.profileState}  ${p.attributes.name}`)
        }
        if (relevant.length === 0) console.log(`  (keines fuer Wattwerk, insgesamt ${profiles.data.length})`)
    }
})()
