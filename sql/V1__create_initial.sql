-- Wattwerk: Grundschema.
--
-- Wird von Flyway beim Hochfahren des Stacks eingespielt (siehe
-- docker-compose.yml). Aenderungen kommen als neue Datei V1.1__..., diese hier
-- wird nach dem ersten Lauf nie wieder angefasst - Flyway prueft die Pruefsumme.

CREATE TABLE user (
  id                 INT(11)      NOT NULL AUTO_INCREMENT,
  -- VARCHAR statt TEXT, weil ein eindeutiger Index sonst eine Praefixlaenge
  -- braucht. 255 Zeichen decken jede real vorkommende Adresse ab.
  email              VARCHAR(255) NOT NULL,
  passwordHash       VARCHAR(255) NOT NULL,
  name               VARCHAR(120) NOT NULL DEFAULT '',

  -- Bestaetigung der Adresse. Der Token bleibt stehen, bis er eingeloest wird;
  -- verifiedAt ist die eigentliche Wahrheit.
  emailVerifyToken   CHAR(36)     NULL,
  emailVerifiedAt    DATETIME     NULL,
  mailContactAllowed BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Fahrerprofil. Spiegelt RiderProfile aus WattwerkCore, damit die App ihre
  -- Einstellungen hochladen kann, ohne dass es eine zweite Wahrheit gibt.
  ftp                INT(11)      NOT NULL DEFAULT 200,
  maxHeartRate       INT(11)      NOT NULL DEFAULT 185,
  restingHeartRate   INT(11)      NOT NULL DEFAULT 55,
  weightKg           FLOAT        NOT NULL DEFAULT 75,

  lastLoginAt        DATETIME     NULL,
  createdAt          DATETIME     NOT NULL,
  updatedAt          DATETIME     NOT NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_user_email (email)
);

CREATE TABLE trainingSession (
  id                  INT(11)      NOT NULL AUTO_INCREMENT,
  userID              INT(11)      NOT NULL,
  -- Die Kennung, unter der die App die Einheit fuehrt. Zusammen mit userID
  -- eindeutig: ein zweiter Upload derselben Fahrt aktualisiert, statt eine
  -- Dublette anzulegen. Ohne das erzeugt jeder Wiederholversuch nach einem
  -- Netzfehler eine weitere Einheit im Verlauf.
  clientID            CHAR(36)     NOT NULL,

  workoutName         VARCHAR(200) NOT NULL,
  startedAt           DATETIME     NOT NULL,
  durationSeconds     INT(11)      NOT NULL,
  completed           BOOLEAN      NOT NULL,

  -- Die FTP zum Zeitpunkt der Fahrt. Steigt sie spaeter, bleiben IF und TSS
  -- dieser Einheit trotzdem richtig.
  ftp                 INT(11)      NOT NULL,
  averagePower        INT(11)      NOT NULL,
  maxPower            INT(11)      NOT NULL,
  normalizedPower     INT(11)      NOT NULL,
  intensityFactor     FLOAT        NOT NULL,
  trainingStressScore INT(11)      NOT NULL,
  kilojoules          INT(11)      NOT NULL,
  averageCadence      INT(11)      NULL,
  averageHeartRate    INT(11)      NULL,
  maxHeartRate        INT(11)      NULL,

  createdAt           DATETIME     NOT NULL,
  updatedAt           DATETIME     NOT NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_session_user_client (userID, clientID),
  -- Der Verlauf wird immer nach Nutzer und Datum gelesen.
  KEY idx_session_user_started (userID, startedAt),
  CONSTRAINT fk_session_user
    FOREIGN KEY (userID) REFERENCES user (id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT
);
