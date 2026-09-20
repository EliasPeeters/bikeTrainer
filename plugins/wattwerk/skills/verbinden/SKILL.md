---
description: Erklärt, wie man das Wattwerk-Plugin mit einem Konto verbindet. Benutze das, wenn ein Wattwerk-Werkzeug mit 401 oder "Kein Token" scheitert, wenn jemand fragt, wie er Wattwerk verbindet, oder wenn WATTWERK_API_KEY fehlt.
---

# Wattwerk verbinden

Das Plugin spricht mit dem Wattwerk-MCP-Server über HTTPS. Es braucht dafür
einen **Zugangsschlüssel** in der Umgebungsvariablen `WATTWERK_API_KEY`.

Führe den Nutzer durch diese Schritte, einen nach dem anderen:

1. **Schlüssel anlegen.** Im Web-Portal unter
   <https://wattwerk.eliaspeeters.de/app/profil> auf *Zugangsschlüssel* →
   einen Namen vergeben (etwa „Claude Code") → *Schlüssel anlegen*. Der
   Schlüssel steht genau einmal auf dem Schirm und beginnt mit `wk_`.

   Wer nur lesen lassen will, wählt bei *Rechte* „Nur lesen". Dann kann der
   Assistent den Verlauf und die Bibliothek sehen, aber nichts anlegen,
   ändern oder löschen.

2. **Eintragen.** In die Shell-Konfiguration des Nutzers (`~/.zshrc` oder
   `~/.bashrc`):

   ```bash
   export WATTWERK_API_KEY=wk_...
   ```

   Danach ein neues Terminal öffnen oder die Datei neu einlesen.

3. **Claude Code neu starten**, damit der Server mit der gesetzten Variablen
   startet. Prüfen mit `/mcp` – `wattwerk` muss dort `connected` zeigen.

**Schreibe den Schlüssel nie selbst irgendwohin** und frage den Nutzer nicht
danach: er gehört in seine Shell-Konfiguration, nicht in den Chatverlauf und
nicht in eine Datei im Projekt.

Betreibt jemand eine eigene Wattwerk-Installation, zeigt `WATTWERK_MCP_URL`
auf dessen MCP-Server; ohne die Variable geht es an
`https://mcp.wattwerk.eliaspeeters.de/mcp`.

Scheitert ein Aufruf mit „Der Zugangsschlüssel wird nicht angenommen", wurde er
zurückgenommen oder ist abgelaufen – dann einen neuen anlegen.
