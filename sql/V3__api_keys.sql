-- Zugangsschlüssel: langlebige, einzeln zurücknehmbare Tokens.
--
-- Bisher gab es nur Zugangs- und Auffrischungstokens aus der Anmeldung. Für
-- eine eingetragene Verbindung -- einen MCP-Server, ein Skript, eine fremde
-- Anwendung -- taugen beide nicht: das eine gilt fünfzehn Minuten, das andere
-- lässt sich nur zurückziehen, indem man das Token-Geheimnis wechselt und
-- damit alle aus der Anmeldung wirft, auch die Apps.
--
-- Ein Schlüssel gehört einem Konto, hat einen Namen, den der Nutzer vergibt,
-- und lässt sich einzeln löschen.

CREATE TABLE apiKey (
  id          INT(11)      NOT NULL AUTO_INCREMENT,
  userID      INT(11)      NOT NULL,
  -- Wofür der Schlüssel da ist, vom Nutzer vergeben ("Claude auf dem Mac").
  name        VARCHAR(120) NOT NULL,
  -- Nur der SHA-256 des Schlüssels, nie der Schlüssel selbst. Kein bcrypt:
  -- der Schlüssel ist 256 Bit Zufall und nicht zu erraten, und er wird bei
  -- jedem Aufruf nachgeschlagen -- eine absichtlich langsame Funktion wäre
  -- hier die Bremse für jeden Request.
  tokenHash   CHAR(64)     NOT NULL,
  -- Die ersten Zeichen im Klartext, damit der Nutzer in der Liste erkennt,
  -- welchen Schlüssel er gerade löscht.
  preview     VARCHAR(16)  NOT NULL,
  -- 'read' darf nur lesen (GET). Teilen heißt damit nicht, Schreibrecht zu geben.
  scope       ENUM('read','full') NOT NULL DEFAULT 'full',
  -- Wann er zuletzt benutzt wurde. Nicht bei jedem Aufruf geschrieben, siehe
  -- ApiKeyService -- sonst wäre jede Leseanfrage auch ein Schreibvorgang.
  lastUsedAt  DATETIME     NULL,
  expiresAt   DATETIME     NULL,
  createdAt   DATETIME     NOT NULL,
  updatedAt   DATETIME     NOT NULL,
  PRIMARY KEY (id),
  -- Eindeutig, weil der Hash der Schlüssel zum Nachschlagen ist.
  UNIQUE KEY uq_apikey_hash (tokenHash),
  KEY idx_apikey_user (userID),
  CONSTRAINT fk_apikey_user FOREIGN KEY (userID) REFERENCES user (id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
