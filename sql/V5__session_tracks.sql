-- Der Sekundenverlauf einer gefahrenen Einheit.
--
-- Bis hierher blieb nur die Zusammenfassung übrig: Ø, Max, NP, TSS. Die Spur
-- lag auf dem Gerät und war nach einer Neuinstallation weg. Ab jetzt gehört
-- sie zum Konto, damit Puls, Leistung, Trittfrequenz und Geschwindigkeit auch
-- im Web-Portal über die Zeit zu sehen sind.
--
-- Eigene Tabelle und nicht eine Spalte an `trainingSession`: der Verlauf liest
-- zwanzig Einheiten auf einmal, und eine Kurve ist je Stunde ein paar hundert
-- Kilobyte. Als Spalte käme sie bei jeder Übersicht mit über die Leitung,
-- obwohl niemand sie dort anschaut.

CREATE TABLE trainingSessionTrack (
  -- Die Einheit ist zugleich der Schlüssel: höchstens eine Spur je Fahrt.
  sessionID             INT(11)  NOT NULL,

  -- Abstand zweier Punkte. Heute schreibt die App jede Sekunde einen; die
  -- Spalte steht hier, damit eine spätere Ausdünnung langer Fahrten die
  -- vorhandenen Spuren nicht falsch macht.
  sampleIntervalSeconds INT(11)  NOT NULL DEFAULT 1,
  sampleCount           INT(11)  NOT NULL,
  startOffsetSeconds    INT(11)  NOT NULL DEFAULT 0,

  -- Die Messreihen spaltenweise als JSON: {"power":[…],"heartRate":[…]}.
  --
  -- Nicht eine Zeile je Sekunde. Eine Stunde wären 3600 Zeilen für eine Kurve,
  -- die immer vollständig gelesen und nie einzeln abgefragt wird - der Index
  -- darauf wäre größer als die Nutzlast. Die Datenbank muss in diesen Wert nie
  -- hineinsehen; sie gibt ihn heraus, wie sie ihn bekommen hat.
  channels              JSON     NOT NULL,

  createdAt             DATETIME NOT NULL,
  updatedAt             DATETIME NOT NULL,

  PRIMARY KEY (sessionID),
  -- Wird die Einheit gelöscht, geht die Spur mit. Alles andere hinterließe
  -- Kurven ohne Fahrt, die niemand mehr findet und niemand mehr aufräumt.
  CONSTRAINT fk_track_session
    FOREIGN KEY (sessionID) REFERENCES trainingSession (id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT
);
