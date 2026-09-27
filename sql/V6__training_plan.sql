-- Der Wochenplan: welches Programm an welchem Wochentag gefahren wird.
--
-- Eine Vorlage, die sich jede Woche wiederholt ("Dienstag: Sweet Spot"), kein
-- Kalender. Die App hält den Plan lokal; angemeldet gleicht sie ihn über die
-- API ab, damit ein auf dem Mac gebauter Plan auch auf dem Apple TV erscheint.
--
-- Rein additiv: eine neue Tabelle, keine bestehende wird angefasst. Die Apps
-- aus 1.0 kennen den Plan nicht und laufen gegen dieses Schema unverändert
-- weiter.

CREATE TABLE planEntry (
  -- Vom Gerät vergeben, wie bei Programmen: Anlegen und Abgleich sind
  -- derselbe Aufruf, und die Kennung bleibt über Geräte hinweg dieselbe.
  id          CHAR(36)     NOT NULL,
  userID      INT(11)      NOT NULL,
  -- ISO 8601: 1 = Montag … 7 = Sonntag.
  weekday     TINYINT      NOT NULL,
  -- Bewusst ohne Fremdschlüssel auf workout. Eingeplant werden kann ein
  -- mitgeliefertes Programm, ein fremdes öffentliches oder eines, das gerade
  -- erst im selben Abgleich hochgeladen wird - und jedes davon kann später
  -- verschwinden. Der Plan soll das überleben und dann den gespeicherten Namen
  -- zeigen, statt den Eintrag stillschweigend mitzulöschen.
  workoutID   CHAR(36)     NOT NULL,
  -- Der Name beim Einplanen, damit ein gelöschtes Programm erkennbar bleibt.
  workoutName VARCHAR(200) NOT NULL,
  -- Reihenfolge innerhalb des Tages, für zwei Einheiten an einem Tag.
  sortIndex   INT(11)      NOT NULL DEFAULT 0,
  createdAt   DATETIME     NOT NULL,
  updatedAt   DATETIME     NOT NULL,

  PRIMARY KEY (id),
  -- Gelesen wird immer der ganze Plan eines Nutzers, in genau dieser Ordnung.
  KEY idx_plan_entry_user (userID, weekday, sortIndex),
  CONSTRAINT fk_plan_entry_user
    FOREIGN KEY (userID) REFERENCES user (id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
