// Legt ein Bereitstellungsprofil ueber die App-Store-Connect-API an und
// installiert es lokal.
//
//     node Scripts/make-profile.js TVOS_APP_STORE "Wattwerk tvOS App Store"
//     node Scripts/make-profile.js MAC_APP_STORE  "Wattwerk macOS App Store"
//
// Noetig, weil Xcode beim Archivieren fuer tvOS sonst ein Entwicklungsprofil
// anfordert und daran scheitert, dass kein Geraet registriert ist.

const fs = require("fs")
const os = require("os")
const path = require("path")
const jwt = require(path.join(__dirname, "..", "node_modules", "jsonwebtoken"))

const KEY_ID = "PWF9SDKK9M"
const ISSUER = "111736bf-f38e-4a94-b110-ffd4123b9451"
const BUNDLE_ID = "8BU5X593DT" // de.eliaspeeters.wattwerk
const key = fs.readFileSync(`${os.homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`)
const token = jwt.sign({}, key, {
    algorithm: "ES256", expiresIn: "10m", issuer: ISSUER,
    audience: "appstoreconnect-v1", header: {alg: "ES256", kid: KEY_ID, typ: "JWT"},
})

async function api(method, path, body) {
    const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
        method,
        headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) {
        throw new Error(`${method} ${path} -> ${response.status}\n${text.slice(0, 600)}`)
    }
    return text.length > 0 ? JSON.parse(text) : null
}

;(async () => {
    const certs = await api("GET", "/v1/certificates?limit=200")
    const distribution = certs.data.find((c) => c.attributes.certificateType === "DISTRIBUTION")
    if (!distribution) throw new Error("Kein DISTRIBUTION-Zertifikat gefunden")
    console.log("Zertifikat:", distribution.attributes.name, distribution.id)

    const profileType = process.argv[2]  // TVOS_APP_STORE oder MAC_APP_STORE
    const name = process.argv[3]

    // Ein gleichnamiges Profil vorher wegräumen - Apple lehnt Dubletten ab.
    const existing = await api("GET", `/v1/profiles?limit=200`)
    for (const p of existing.data.filter((p) => p.attributes.name === name)) {
        await api("DELETE", `/v1/profiles/${p.id}`)
        console.log("altes Profil entfernt:", p.id)
    }

    const created = await api("POST", "/v1/profiles", {
        data: {
            type: "profiles",
            attributes: {name, profileType},
            relationships: {
                bundleId: {data: {type: "bundleIds", id: BUNDLE_ID}},
                certificates: {data: [{type: "certificates", id: distribution.id}]},
            },
        },
    })

    const attributes = created.data.attributes
    const dir = path.join(os.homedir(), "Library/Developer/Xcode/UserData/Provisioning Profiles")
    fs.mkdirSync(dir, {recursive: true})
    const extension = profileType.startsWith("MAC") ? "provisionprofile" : "mobileprovision"
    const file = path.join(dir, `${attributes.uuid}.${extension}`)
    fs.writeFileSync(file, Buffer.from(attributes.profileContent, "base64"))

    console.log("Profil angelegt:", attributes.name)
    console.log("  Typ:  ", attributes.profileType)
    console.log("  UUID: ", attributes.uuid)
    console.log("  Datei:", file)
})()
