/**
 * Die Seite, auf der jemand einer Anwendung Zugriff erlaubt.
 *
 * Bewusst eine einzelne, selbsttragende HTML-Seite ohne Framework: sie wird
 * einmal je Verbindung aufgerufen, muss in jedem Browser funktionieren und darf
 * nicht davon abhaengen, dass vorher etwas geladen wurde. Das Portal kann hier
 * auch nicht helfen - es haelt seine Anmeldung in localStorage, und davon sieht
 * ein Seitenaufruf nichts.
 */

export interface ConsentPageInput {
    clientName: string
    /** Alles, was unveraendert zurueck an den POST muss. */
    hidden: Record<string, string>
    scope: string
    email?: string
    error?: string
}

/**
 * Jeder Wert, der aus der Anfrage stammt, geht hier durch. Der Name des
 * Clients kommt aus einem fremden Dokument, die versteckten Felder aus der
 * Abfragezeichenkette - ungeprueft eingesetzt waere beides ein Skript auf
 * unserer Seite.
 */
function escapeHTML(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function scopeDescription(scope: string): string[] {
    const parts = scope.split(" ").filter((entry) => entry.length > 0)
    const lines = ["Deine Trainingsprogramme, Sammlungen, gefahrenen Einheiten und dein Fahrerprofil lesen"]
    if (parts.includes("wattwerk:write")) {
        lines.push("Programme und Sammlungen anlegen, ändern und löschen")
        lines.push("Einheiten eintragen und löschen, dein Profil ändern")
    }
    return lines
}

export function consentPage(input: ConsentPageInput): string {
    const hiddenFields = Object.entries(input.hidden)
        .map(([key, value]) => `<input type="hidden" name="${escapeHTML(key)}" value="${escapeHTML(value)}">`)
        .join("\n        ")

    const permissions = scopeDescription(input.scope)
        .map((line) => `<li>${escapeHTML(line)}</li>`)
        .join("\n            ")

    const readOnly = !input.scope.split(" ").includes("wattwerk:write")

    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wattwerk verbinden</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 1.5rem; background: #12141a; color: #e9ecf2;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .card { width: 100%; max-width: 27rem; background: #1b1e26; border: 1px solid #2a2e3a; border-radius: 12px; padding: 1.75rem; }
  h1 { font-size: 1.3rem; margin: 0 0 0.35rem; }
  .brand { font-size: 0.8rem; letter-spacing: 0.12em; text-transform: uppercase; color: #8b93a7; margin: 0 0 1.25rem; }
  .muted { color: #8b93a7; font-size: 0.9rem; }
  ul { margin: 0.6rem 0 1.25rem; padding-left: 1.2rem; }
  li { margin: 0.3rem 0; font-size: 0.92rem; }
  .badge { display: inline-block; font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 999px; background: #243043; color: #93b4e6; margin-left: 0.4rem; }
  label { display: block; margin: 0.9rem 0 0.3rem; font-size: 0.85rem; color: #b6bdcc; }
  input[type=email], input[type=password] {
    width: 100%; padding: 0.6rem 0.7rem; border-radius: 7px; border: 1px solid #333846;
    background: #12141a; color: #e9ecf2; font-size: 1rem;
  }
  input:focus { outline: 2px solid #4a7fd4; outline-offset: 1px; }
  .actions { display: flex; gap: 0.6rem; margin-top: 1.4rem; }
  button { flex: 1; padding: 0.65rem 1rem; border-radius: 7px; border: 1px solid transparent; font-size: 0.95rem; cursor: pointer; }
  button[value=allow] { background: #3b6fd4; color: #fff; font-weight: 600; }
  button[value=deny] { background: transparent; border-color: #333846; color: #b6bdcc; }
  .error { background: #3a1f24; border: 1px solid #6b2f38; color: #f0b7c0; padding: 0.6rem 0.75rem; border-radius: 7px; font-size: 0.9rem; margin-bottom: 1rem; }
  .foot { margin-top: 1.3rem; font-size: 0.8rem; color: #6f7789; }
</style>
</head>
<body>
  <main class="card">
    <p class="brand">Wattwerk</p>
    <h1>${escapeHTML(input.clientName)} verbinden</h1>
    <p class="muted">
      Die Anwendung möchte in deinem Namen auf Wattwerk zugreifen${readOnly ? ", nur lesend" : ""}.
    </p>

    <p class="muted" style="margin-bottom:0">Sie darf dann:</p>
    <ul>
            ${permissions}
    </ul>
    ${readOnly ? '<p class="muted">Schreiben ist nicht dabei<span class="badge">nur lesen</span></p>' : ""}

    ${input.error !== undefined ? `<div class="error">${escapeHTML(input.error)}</div>` : ""}

    <form method="post" action="/oauth/authorize">
        ${hiddenFields}
      <label for="email">E-Mail</label>
      <input id="email" type="email" name="email" required autocomplete="username"
             value="${escapeHTML(input.email ?? "")}">
      <label for="password">Passwort</label>
      <input id="password" type="password" name="password" required autocomplete="current-password">
      <div class="actions">
        <button type="submit" name="decision" value="deny">Ablehnen</button>
        <button type="submit" name="decision" value="allow">Erlauben</button>
      </div>
    </form>

    <p class="foot">
      Du kannst diese Verbindung jederzeit im Portal unter Profil wieder zurücknehmen.
    </p>
  </main>
</body>
</html>`
}

/** Wenn nicht einmal feststeht, wohin weitergeleitet werden dürfte. */
export function errorPage(title: string, detail: string): string {
    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:1.5rem;
         background:#12141a; color:#e9ecf2; font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card { max-width:27rem; background:#1b1e26; border:1px solid #2a2e3a; border-radius:12px; padding:1.75rem; }
  h1 { font-size:1.2rem; margin:0 0 0.6rem; }
  p { color:#8b93a7; font-size:0.92rem; margin:0; }
</style>
</head>
<body><main class="card"><h1>${escapeHTML(title)}</h1><p>${escapeHTML(detail)}</p></main></body>
</html>`
}
