-- =============================================================================
-- SCHEMA: Film Database
-- Column names intentionally match the CSV headers exactly so datasets
-- can be imported directly in pgAdmin with zero column remapping.
--
-- The only exception is the satellite tables' BIGSERIAL primary key,
-- named "row_id" (not in any CSV). In pgAdmin's Import dialog, simply
-- uncheck "row_id" from the column list — PostgreSQL generates it
-- automatically. Every other column is a direct CSV → DB match.
-- =============================================================================

DROP TABLE IF EXISTS posters   CASCADE;
DROP TABLE IF EXISTS themes    CASCADE;
DROP TABLE IF EXISTS studios   CASCADE;
DROP TABLE IF EXISTS releases  CASCADE;
DROP TABLE IF EXISTS languages CASCADE;
DROP TABLE IF EXISTS countries CASCADE;
DROP TABLE IF EXISTS genres    CASCADE;
DROP TABLE IF EXISTS crew      CASCADE;
DROP TABLE IF EXISTS actors    CASCADE;
DROP TABLE IF EXISTS movies    CASCADE;

-- -----------------------------------------------------------------------------
-- Parent table — columns match movies_cleaned.csv exactly
-- CSV headers: id, name, date, tagline, description, minute, rating
-- -----------------------------------------------------------------------------
CREATE TABLE movies (
  id          INTEGER      PRIMARY KEY,
  name        TEXT         NOT NULL,
  date        INTEGER,                 -- CSV stores "2023.0"; PostgreSQL casts automatically
  tagline     TEXT,
  description TEXT,
  minute      INTEGER,
  rating      NUMERIC(4,2),
  likes       INTEGER      DEFAULT 0   -- Persistent like counter (survives Redis flushes)
);

CREATE INDEX idx_movies_name_lower ON movies (LOWER(name));

-- -----------------------------------------------------------------------------
-- Satellite tables
--
-- CSV headers for every satellite file: id, <data columns...>
-- The CSV "id" column is the foreign key pointing to movies.id.
--
-- "row_id" is a surrogate PK required by JPA/Hibernate. It is NOT in any CSV.
-- When importing via pgAdmin: uncheck "row_id" in the Columns list.
-- PostgreSQL fills it via BIGSERIAL automatically.
-- -----------------------------------------------------------------------------

-- actors_cleaned.csv: id, name, role
CREATE TABLE actors (
  row_id   BIGSERIAL    PRIMARY KEY,
  id       INTEGER      NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  name     TEXT         NOT NULL,
  role     TEXT
);
CREATE INDEX idx_actors_id ON actors (id);

-- crew_cleaned.csv: id, name, role
CREATE TABLE crew (
  row_id   BIGSERIAL    PRIMARY KEY,
  id       INTEGER      NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  name     TEXT         NOT NULL,
  role     TEXT
);
CREATE INDEX idx_crew_id ON crew (id);

-- genres_cleaned.csv: id, genre
CREATE TABLE genres (
  row_id   BIGSERIAL    PRIMARY KEY,
  id       INTEGER      NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  genre    TEXT         NOT NULL
);
CREATE INDEX idx_genres_id ON genres (id);

-- countries_cleaned.csv: id, country
CREATE TABLE countries (
  row_id   BIGSERIAL    PRIMARY KEY,
  id       INTEGER      NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  country  TEXT         NOT NULL
);
CREATE INDEX idx_countries_id ON countries (id);

-- languages_cleaned.csv: id, language, type
CREATE TABLE languages (
  row_id   BIGSERIAL    PRIMARY KEY,
  id       INTEGER      NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  language TEXT         NOT NULL,
  type     TEXT
);
CREATE INDEX idx_languages_id ON languages (id);

-- releases_cleaned.csv: id, country, date, type, rating
CREATE TABLE releases (
  row_id   BIGSERIAL    PRIMARY KEY,
  id       INTEGER      NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  country  TEXT,
  date     DATE,
  type     TEXT,
  rating   TEXT
);
CREATE INDEX idx_releases_id ON releases (id);

-- studios_cleaned.csv: id, studio
CREATE TABLE studios (
  row_id   BIGSERIAL    PRIMARY KEY,
  id       INTEGER      NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  studio   TEXT         NOT NULL
);
CREATE INDEX idx_studios_id ON studios (id);

-- themes_cleaned.csv: id, theme
CREATE TABLE themes (
  row_id   BIGSERIAL    PRIMARY KEY,
  id       INTEGER      NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  theme    TEXT         NOT NULL
);
CREATE INDEX idx_themes_id ON themes (id);

-- posters_cleaned.csv: id, link
CREATE TABLE posters (
  row_id   BIGSERIAL    PRIMARY KEY,
  id       INTEGER      NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  link     TEXT         NOT NULL
);
CREATE INDEX idx_posters_id ON posters (id);
