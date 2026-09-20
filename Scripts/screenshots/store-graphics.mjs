#!/usr/bin/env node
// Baut aus den Rohaufnahmen die Grafiken für App Store Connect: Screenshot,
// Überschrift, Nebensatz, Hintergrund - in genau der Größe, die der Store will.
//
//   node Scripts/screenshots/store-graphics.mjs
//
// Gerendert wird mit Chrome im Headless-Modus. Das ist der kürzeste Weg zu
// verlässlicher Typografie in exakten Pixelmaßen; ein Bildbearbeitungsprogramm
// müsste man von Hand bedienen.

import {spawn} from "node:child_process"
import {mkdir, rm, stat, writeFile} from "node:fs/promises"
import {dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const WORK = resolve(ROOT, ".build/store-graphics")
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

/** Apple nimmt für macOS unter anderem 2880 × 1800, für Apple TV 3840 × 2160. */
const PLATFORMS = {
    macos: {width: 2880, height: 1800, shotWidth: 2300, headline: 96, sub: 40, top: 130},
    tvos: {width: 3840, height: 2160, shotWidth: 3060, headline: 124, sub: 52, top: 150},
}

const PANELS = {
    macos: [
        {
            file: "01-bibliothek",
            shot: "macos/01-bibliothek.png",
            headline: "Programme statt Zufall",
            sub: "Sweet Spot, Over-Unders, 30/30er, Rampentest. Jede Vorgabe rechnet in Prozent deiner FTP.",
        },
        {
            file: "02-programm",
            shot: "macos/02-programm.png",
            headline: "Du siehst, was auf dich zukommt",
            sub: "Profil, Belastung, Intensität und jeder Block mit Dauer und Trittfrequenz — bevor du das erste Mal trittst.",
        },
        {
            file: "03-editor",
            shot: "macos/03-editor.png",
            headline: "Bau dir dein eigenes Programm",
            sub: "Blöcke anlegen, verschieben, verdoppeln. Das Profil rechnet mit, Belastung und Intensität stehen daneben.",
        },
        {
            file: "04-fahrt",
            shot: "macos/04-fahrt.png",
            headline: "Der Trainer hält die Wattzahl",
            sub: "Wattwerk spricht FTMS über Bluetooth und stellt den Widerstand selbst ein. Zu hart? Ein Druck auf Minus.",
        },
        {
            file: "05-auswertung",
            shot: "macos/05-auswertung.png",
            headline: "Danach stehen die Zahlen da",
            sub: "Dauer, Durchschnitt, normalisierte Leistung, Belastung, Arbeit — und wie lange du in welcher Zone warst.",
        },
        {
            file: "06-verlauf",
            shot: "macos/06-verlauf.png",
            headline: "Jede Fahrt bleibt",
            sub: "Die Wochenbelastung oben, darunter jede Einheit mit Dauer, Durchschnitt, NP und TSS.",
        },
        {
            file: "07-geraete",
            shot: "macos/07-geraete.png",
            headline: "Trainer und Pulsgurt finden sich selbst",
            sub: "Einmal verbunden, meldet sich dein Gerät beim nächsten Start von allein. Kein Rad da? Der Simulator fährt mit.",
        },
        {
            file: "08-profil",
            shot: "macos/08-profil.png",
            headline: "Eine Zahl regiert alles: deine FTP",
            sub: "Ändere sie, und jedes Programm passt seine Vorgaben an. Den Rampentest rechnet die App gleich um.",
        },
        {
            file: "09-konto",
            shot: "macos/09-konto.png",
            headline: "Ohne Konto geht alles. Mit Konto überall",
            sub: "Am Mac gebaut, am Apple TV gefahren, im Web-Portal ausgewertet. Ohne Anmeldung bleibt alles lokal.",
        },
    ],
    tvos: [
        {
            file: "01-bibliothek",
            shot: "tvos/01-bibliothek.png",
            headline: "Dein Katalog auf dem großen Bildschirm",
            sub: "Programme Reihe für Reihe, mit Profil, Dauer und Belastung. Mit der Fernbedienung durchgefahren.",
        },
        {
            file: "02-programm",
            shot: "tvos/02-programm.png",
            headline: "Alles auf einen Blick, bevor es losgeht",
            sub: "Links das Profil und der Startknopf, rechts jeder Block mit Dauer und Trittfrequenz.",
        },
        {
            file: "03-fahrt",
            shot: "tvos/03-fahrt.png",
            headline: "Aus drei Metern lesbar",
            sub: "Leistung gegen Ziel, Restzeit im Block, Trittfrequenz und Puls — groß genug fürs Wohnzimmer.",
        },
        {
            file: "04-auswertung",
            shot: "tvos/04-auswertung.png",
            headline: "Danach stehen die Zahlen da",
            sub: "Dauer, Durchschnitt, normalisierte Leistung, Belastung, Arbeit — und wie lange du in welcher Zone warst.",
        },
        {
            file: "05-verlauf",
            shot: "tvos/05-verlauf.png",
            headline: "Jede Fahrt bleibt",
            sub: "Die Wochenbelastung oben, darunter jede Einheit mit Dauer, Durchschnitt, NP und TSS.",
        },
        {
            file: "06-profil",
            shot: "tvos/06-profil.png",
            headline: "Eine Zahl regiert alles: deine FTP",
            sub: "Ändere sie, und jedes Programm passt seine Vorgaben an — auf jedem Gerät gleich.",
        },
        {
            file: "07-konto",
            shot: "tvos/07-konto.png",
            headline: "Ohne Konto geht alles. Mit Konto überall",
            sub: "Am Mac gebaut, am Apple TV gefahren, im Web-Portal ausgewertet. Ohne Anmeldung bleibt alles lokal.",
        },
    ],
}

function page(platform, panel) {
    const size = PLATFORMS[platform]
    const shot = resolve(ROOT, "assets/screenshots", panel.shot)
    const logo = resolve(ROOT, "packages/landingpage/public/icon-512.png")
    return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${size.width}px; height: ${size.height}px;
    background: #0d0f14; overflow: hidden;
    font-family: "SF Pro Display", "SF Pro Text", -apple-system, "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /* Ein Schimmer in der Logofarbe, damit die Fläche nicht tot wirkt. */
  body::before {
    content: ""; position: absolute; inset: 0;
    background:
      radial-gradient(90% 60% at 18% -12%, rgba(78,149,248,.22), transparent 60%),
      radial-gradient(70% 50% at 88% 8%, rgba(76,203,122,.10), transparent 60%);
  }
  .panel {
    position: relative; width: 100%; height: 100%;
    display: flex; flex-direction: column; align-items: center;
    padding: ${size.top}px ${Math.round(size.width * 0.06)}px 0;
  }
  .brand {
    display: flex; align-items: center; gap: ${Math.round(size.sub * 0.42)}px;
    margin-bottom: ${Math.round(size.sub * 0.95)}px;
  }
  .brand img { width: ${Math.round(size.sub * 1.25)}px; height: ${Math.round(size.sub * 1.25)}px; border-radius: ${Math.round(size.sub * 0.3)}px; display: block; }
  .brand span { font-size: ${Math.round(size.sub * 0.8)}px; font-weight: 600; color: #9aa3b2; letter-spacing: .06em; text-transform: uppercase; }
  h1 {
    font-size: ${size.headline}px; line-height: 1.06; font-weight: 700;
    letter-spacing: -0.028em; color: #f5f6f8; text-align: center;
    max-width: ${Math.round(size.width * 0.82)}px;
  }
  p {
    margin-top: ${Math.round(size.sub * 0.7)}px;
    font-size: ${size.sub}px; line-height: 1.42; color: #9aa3b2;
    text-align: center; max-width: ${Math.round(size.width * 0.66)}px;
  }
  .shot {
    margin-top: auto; width: ${size.shotWidth}px;
    border-radius: ${Math.round(size.width * 0.009)}px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.09);
    box-shadow: 0 ${Math.round(size.height * 0.035)}px ${Math.round(size.height * 0.08)}px rgba(0,0,0,.65);
    /* Bleibt unten stehen: das Bild läuft aus dem Rahmen heraus. */
    margin-bottom: ${Math.round(-size.height * 0.055)}px;
  }
  .shot img { width: 100%; display: block; }
</style></head><body>
  <div class="panel">
    <div class="brand"><img src="file://${logo}" alt=""><span>Wattwerk</span></div>
    <h1>${panel.headline}</h1>
    <p>${panel.sub}</p>
    <div class="shot"><img src="file://${shot}" alt=""></div>
  </div>
</body></html>`
}


/// Chrome schreibt den Screenshot und bleibt danach im Headless-Modus stehen -
/// also warten, bis die Datei fertig ist, und den Prozess dann beenden.
async function shoot(html, target, size, profile) {
    const chrome = spawn(CHROME, [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-sync",
        "--allow-file-access-from-files",
        "--force-device-scale-factor=1",
        "--default-background-color=0d0f14",
        `--window-size=${size.width},${size.height}`,
        "--virtual-time-budget=4000",
        `--screenshot=${target}`,
        `--user-data-dir=${profile}`,
        `file://${html}`,
    ], {stdio: "ignore"})

    try {
        let previous = -1
        for (let attempt = 0; attempt < 150; attempt += 1) {
            await new Promise((done) => setTimeout(done, 200))
            const size = await stat(target).then((info) => info.size, () => -1)
            // Zwei gleiche Messungen hintereinander: die Datei ist zu Ende geschrieben.
            if (size > 0 && size === previous) return
            previous = size
        }
        throw new Error(`Chrome hat ${target} nicht geschrieben.`)
    } finally {
        chrome.kill("SIGKILL")
    }
}

async function main() {
    await rm(WORK, {recursive: true, force: true})
    await mkdir(WORK, {recursive: true})

    for (const [platform, panels] of Object.entries(PANELS)) {
        const size = PLATFORMS[platform]
        const out = resolve(ROOT, "assets/store", platform)
        await mkdir(out, {recursive: true})

        for (const panel of panels) {
            const html = resolve(WORK, `${platform}-${panel.file}.html`)
            await writeFile(html, page(platform, panel), "utf8")
            await shoot(html, resolve(out, panel.file + ".png"), size, resolve(WORK, `profile-${platform}-${panel.file}`))
            console.log(`  ${platform}/${panel.file}.png`)
        }
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
