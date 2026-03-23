/**
 * scripts/seed.js
 *
 * Streams every cleaned CSV into the corresponding PostgreSQL table.
 *
 * Strategy:
 *  1. movies_cleaned.csv is inserted FIRST (parent table).
 *  2. All satellite tables are inserted afterwards so FK constraints are never violated.
 *  3. Rows are inserted in batches of 500 to avoid overwhelming the connection
 *     and to keep memory usage flat even for very large files.
 *
 * Usage:
 *   node scripts/seed.js
 *
 * Prerequisites:
 *   - .env with DB_* variables present (or defaults will be used)
 *   - Schema already applied: psql -U <user> -d <db> -f scripts/schema.sql
 */

require('dotenv').config();
const fs        = require('fs');
const path      = require('path');
const csv       = require('csv-parser');
const { Pool }  = require('pg');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CSV_DIR = path.resolve(
  __dirname,
  '../../../Cleaned datasets' // path relative to this script's location
);

const BATCH_SIZE = 500; // rows per INSERT statement

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
});

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/**
 * Reads a CSV file and returns a Promise that resolves to an array of row objects.
 * @param {string} filename - Filename inside CSV_DIR
 */
function readCsv(filename) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path.join(CSV_DIR, filename))
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end',  () => resolve(rows))
      .on('error', reject);
  });
}

/**
 * Inserts rows in batches using parameterised queries.
 * Builds a multi-row VALUES clause per batch to minimise round-trips.
 *
 * @param {object}   client      - pg client from pool
 * @param {string}   table       - target table name
 * @param {string[]} columns     - ordered column names matching valuesFn output
 * @param {any[][]}  valuesBatch - array of value arrays, one per row
 */
async function batchInsert(client, table, columns, valuesBatch) {
  if (valuesBatch.length === 0) return;

  const colList = columns.join(', ');
  const placeholders = valuesBatch
    .map((_, rowIdx) =>
      `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(', ')})`
    )
    .join(', ');

  const flatValues = valuesBatch.flat();
  await client.query(
    `INSERT INTO ${table} (${colList}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    flatValues
  );
}

/**
 * Inserts rows from a CSV into a table, processing in batches.
 *
 * @param {object}   client   - pg client
 * @param {string}   table    - target table
 * @param {string[]} columns  - DB column names
 * @param {any[][]}  allRows  - full array of value arrays
 */
async function insertAll(client, table, columns, allRows) {
  let inserted = 0;
  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    await batchInsert(client, table, columns, batch);
    inserted += batch.length;
    process.stdout.write(`\r  → ${table}: ${inserted}/${allRows.length} rows`);
  }
  console.log(); // newline after progress indicator
}

// ---------------------------------------------------------------------------
// Per-table seed functions
// Responsible for mapping raw CSV fields to DB columns + type coercion.
// ---------------------------------------------------------------------------

async function seedMovies(client) {
  console.log('Seeding movies…');
  const rows = await readCsv('movies_cleaned.csv');

  const values = rows.map((r) => [
    parseInt(r.id),
    r.name?.trim() || null,
    // CSV stores year as "2023.0" - parse as float then cast to int-safe numeric
    r.date ? parseFloat(r.date) : null,
    r.tagline?.trim()     || null,
    r.description?.trim() || null,
    r.minute ? parseInt(r.minute) : null,
    r.rating  ? parseFloat(r.rating)  : null,
  ]);

  // Column names now match the DB schema exactly
  await insertAll(client, 'movies', ['id', 'name', 'date', 'tagline', 'description', 'minute', 'rating'], values);
}

async function seedActors(client) {
  console.log('Seeding actors…');
  const rows = await readCsv('actors_cleaned.csv');
  const values = rows.map((r) => [parseInt(r.id), r.name?.trim() || null, r.role?.trim() || null]);
  await insertAll(client, 'actors', ['id', 'name', 'role'], values);
}

async function seedCrew(client) {
  console.log('Seeding crew…');
  const rows = await readCsv('crew_cleaned.csv');
  const values = rows.map((r) => [parseInt(r.id), r.name?.trim() || null, r.role?.trim() || null]);
  await insertAll(client, 'crew', ['id', 'name', 'role'], values);
}

async function seedGenres(client) {
  console.log('Seeding genres…');
  const rows = await readCsv('genres_cleaned.csv');
  const values = rows.map((r) => [parseInt(r.id), r.genre?.trim() || null]).filter((v) => v[1]);
  await insertAll(client, 'genres', ['id', 'genre'], values);
}

async function seedCountries(client) {
  console.log('Seeding countries…');
  const rows = await readCsv('countries_cleaned.csv');
  const values = rows.map((r) => [parseInt(r.id), r.country?.trim() || null]).filter((v) => v[1]);
  await insertAll(client, 'countries', ['id', 'country'], values);
}

async function seedLanguages(client) {
  console.log('Seeding languages…');
  const rows = await readCsv('languages_cleaned.csv');
  const values = rows.map((r) => [
    parseInt(r.id),
    r.language?.trim() || null,
    r.type?.trim()     || null,
  ]).filter((v) => v[1]);
  await insertAll(client, 'languages', ['id', 'language', 'type'], values);
}

async function seedReleases(client) {
  console.log('Seeding releases…');
  const rows = await readCsv('releases_cleaned.csv');
  const values = rows.map((r) => [
    parseInt(r.id),
    r.country?.trim()      || null,
    r.date && r.date.trim() ? r.date.trim() : null,
    r.type?.trim()          || null,
    r.rating?.trim()        || null,
  ]);
  await insertAll(client, 'releases', ['id', 'country', 'date', 'type', 'rating'], values);
}

async function seedStudios(client) {
  console.log('Seeding studios…');
  const rows = await readCsv('studios_cleaned.csv');
  const values = rows.map((r) => [parseInt(r.id), r.studio?.trim() || null]).filter((v) => v[1]);
  await insertAll(client, 'studios', ['id', 'studio'], values);
}

async function seedThemes(client) {
  console.log('Seeding themes…');
  const rows = await readCsv('themes_cleaned.csv');
  const values = rows.map((r) => [parseInt(r.id), r.theme?.trim() || null]).filter((v) => v[1]);
  await insertAll(client, 'themes', ['id', 'theme'], values);
}

async function seedPosters(client) {
  console.log('Seeding posters…');
  const rows = await readCsv('posters_cleaned.csv');
  const values = rows.map((r) => [parseInt(r.id), r.link?.trim() || null]).filter((v) => v[1]);
  await insertAll(client, 'posters', ['id', 'link'], values);
}

// ---------------------------------------------------------------------------
// Main - runs all seeders inside a single transaction so a failure leaves
// the database in a clean state (all-or-nothing).
// ---------------------------------------------------------------------------
async function main() {
  const client = await pool.connect();
  try {
    console.log('Starting seed inside a transaction…\n');
    await client.query('BEGIN');
    await client.query('SET session_replication_role = replica'); // disable FK checks

    // Parent table MUST come first to satisfy FK constraints
    await seedMovies(client);

    // Satellite tables - order doesn't matter among themselves
    await seedActors(client);
    await seedCrew(client);
    await seedGenres(client);
    await seedCountries(client);
    await seedLanguages(client);
    await seedReleases(client);
    await seedStudios(client);
    await seedThemes(client);
    await seedPosters(client);

    await client.query('SET session_replication_role = DEFAULT'); // re-enable FK checks
    await client.query('COMMIT');
    console.log('\n✓ Seed completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ Seed failed - transaction rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
