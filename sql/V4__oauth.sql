-- Die API wird zum OAuth-Autorisierungsserver.
--
-- Bis hierher gab es zwei Wege hinein: E-Mail und Passwort, oder ein
-- Zugangsschlüssel. Beide setzen voraus, dass der Nutzer etwas kopiert. Für
-- ChatGPT und die Connectors auf claude.ai reicht das nicht -- dort gibt es
-- kein Feld für einen Schlüssel, sondern nur "Verbinden", und dahinter muss
-- OAuth liegen.
--
-- Der MCP-Server ist dabei der Resource Server, die API der Autorisierungs-
-- server. Die Nutzer liegen schon hier; einen zweiten Ort für Identitäten
-- aufzumachen wäre die schlechtere Antwort.

-- Clients, die sich über Dynamic Client Registration angemeldet haben.
--
-- Clients mit einer HTTPS-URL als client_id (Client ID Metadata Documents)
-- stehen hier *nicht*: ihr Dokument liegt bei ihnen, wird bei Bedarf geholt
-- und ist damit immer aktuell. Eine Kopie hier wäre nur eine, die veraltet.
CREATE TABLE oauthClient (
  id           INT(11)      NOT NULL AUTO_INCREMENT,
  clientID     VARCHAR(255) NOT NULL,
  clientName   VARCHAR(200) NOT NULL,
  -- Genau die URIs, an die weitergeleitet werden darf. Eine Weiterleitung an
  -- eine nicht eingetragene Adresse ist der klassische Weg, einen
  -- Autorisierungscode abzufangen.
  redirectUris JSON         NOT NULL,
  createdAt    DATETIME     NOT NULL,
  updatedAt    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_oauthclient_clientid (clientID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Autorisierungscodes. Kurzlebig und genau einmal einlösbar.
CREATE TABLE oauthCode (
  id                  INT(11)      NOT NULL AUTO_INCREMENT,
  -- Nur der Hash: ein Code in einer Datenbank, die jemand liest, ist ein
  -- fremdes Konto.
  codeHash            CHAR(64)     NOT NULL,
  clientID            VARCHAR(255) NOT NULL,
  userID              INT(11)      NOT NULL,
  redirectUri         VARCHAR(2048) NOT NULL,
  -- PKCE ist in OAuth 2.1 Pflicht, und zwar nur mit S256.
  codeChallenge       VARCHAR(128) NOT NULL,
  -- Für welchen Resource Server das Token gilt (RFC 8707). Ohne diese Bindung
  -- ließe sich ein Token, das für einen anderen Dienst ausgestellt wurde, hier
  -- verwenden.
  resource            VARCHAR(2048) NOT NULL,
  scope               VARCHAR(255) NOT NULL,
  expiresAt           DATETIME     NOT NULL,
  -- Gesetzt beim Einlösen. Ein zweites Mal wird abgelehnt, und alle Tokens aus
  -- diesem Code werden ungültig - so sieht man einen abgefangenen Code.
  usedAt              DATETIME     NULL,
  createdAt           DATETIME     NOT NULL,
  updatedAt           DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_oauthcode_hash (codeHash),
  KEY idx_oauthcode_expires (expiresAt),
  CONSTRAINT fk_oauthcode_user FOREIGN KEY (userID) REFERENCES user (id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Eine erteilte Verbindung: "ChatGPT darf auf mein Konto".
--
-- Das Auffrischungstoken liegt hier als Hash, nicht als JWT in der Welt. Nur so
-- lässt sich eine einzelne Verbindung zurücknehmen -- bei einem signierten
-- Token ginge das nur, indem man das Geheimnis wechselt und alle rauswirft.
CREATE TABLE oauthGrant (
  id                INT(11)      NOT NULL AUTO_INCREMENT,
  userID            INT(11)      NOT NULL,
  clientID          VARCHAR(255) NOT NULL,
  -- Wie der Client sich genannt hat, für die Liste im Portal.
  clientName        VARCHAR(200) NOT NULL,
  refreshTokenHash  CHAR(64)     NOT NULL,
  scope             VARCHAR(255) NOT NULL,
  resource          VARCHAR(2048) NOT NULL,
  lastUsedAt        DATETIME     NULL,
  expiresAt         DATETIME     NULL,
  createdAt         DATETIME     NOT NULL,
  updatedAt         DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_oauthgrant_hash (refreshTokenHash),
  KEY idx_oauthgrant_user (userID),
  CONSTRAINT fk_oauthgrant_user FOREIGN KEY (userID) REFERENCES user (id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
