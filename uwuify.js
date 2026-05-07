/**
 * uwuify.js — UwU-ifies all story dialog and player choices in the game.
 *
 * Transforms:
 *   - r / R  →  w / W
 *   - l / L  →  w / W
 *   - n + vowel  →  ny + vowel  (e.g. "nicht" → "nyicht")
 *   - Sentence-ending . ! ? at end of string gets ~ appended
 *   - Occasionally adds a cute face (uwu, owo, …) after terminal punctuation
 *
 * RPG Maker escape codes (\N[id], \C[id], \G, %1, %2, …) are preserved verbatim.
 *
 * Scope:
 *   - data/Map001.json … data/Map038.json
 *       code 401  → dialog line (parameters[0])
 *       code 102  → player choices (parameters[0] array)
 *   - data/Actors.json
 *       profile field only
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const GAME_DIR  = __dirname;
const DATA_DIR  = path.join(GAME_DIR, 'data');
const UWU_FACES = ['uwu', 'owo', '>w<', '^w^', 'UwU', 'OwO', '~UwU~', 'uwu~'];
const VOWELS    = 'aeiouäöüAEIOUÄÖÜ';

// ---------------------------------------------------------------------------
// Core transform
// ---------------------------------------------------------------------------

/**
 * Splits the string into plain-text segments and RPG Maker escape-code tokens,
 * transforms only the plain-text segments, then re-joins.
 *
 * Preserved tokens: \X[digits]  \X  %digits
 * (covers \N[1], \C[3], \G, \n RPG-Maker control, %1, %2, …)
 */
function uwuTransform(str) {
  if (!str || typeof str !== 'string') return str;

  // Tokenise around escape codes
  const escapeRe = /\\[A-Za-z](?:\[\d+\])?|%\d+/g;
  const tokens = [];
  let cursor = 0;
  let m;

  while ((m = escapeRe.exec(str)) !== null) {
    if (m.index > cursor) {
      tokens.push({ plain: true,  value: str.slice(cursor, m.index) });
    }
    tokens.push({ plain: false, value: m[0] });
    cursor = m.index + m[0].length;
  }
  if (cursor < str.length) {
    tokens.push({ plain: true, value: str.slice(cursor) });
  }

  return tokens.map(tok => tok.plain ? transformSegment(tok.value) : tok.value).join('');
}

function transformSegment(t) {
  // n / N + vowel  →  ny / Ny + vowel
  t = t.replace(new RegExp(`n([${VOWELS}])`, 'g'), (_, v) => 'ny' + v);
  t = t.replace(new RegExp(`N([${VOWELS}])`, 'g'), (_, v) => 'Ny' + v);

  // r → w,  R → W
  t = t.replace(/r/g, 'w');
  t = t.replace(/R/g, 'W');

  // l → w,  L → W
  t = t.replace(/l/g, 'w');
  t = t.replace(/L/g, 'W');

  // ~ after terminal punctuation at end of string (trailing whitespace allowed)
  t = t.replace(/([.!?])(\s*)$/, (_, punct, trailing) => {
    const face = Math.random() < 0.28
      ? ' ' + UWU_FACES[Math.floor(Math.random() * UWU_FACES.length)]
      : '';
    return punct + '~' + face + trailing;
  });

  return t;
}

// ---------------------------------------------------------------------------
// Map file processing  (code 401 = dialog line, code 102 = choices array)
// ---------------------------------------------------------------------------

function processMapFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!Array.isArray(data.events)) return false;

  for (const event of data.events) {
    if (!event) continue;
    for (const page of event.pages) {
      for (const cmd of page.list) {

        // Show Text line
        if (cmd.code === 401 && typeof cmd.parameters[0] === 'string') {
          cmd.parameters[0] = uwuTransform(cmd.parameters[0]);
        }

        // Show Choices — parameters[0] is an array of choice label strings
        if (cmd.code === 102 && Array.isArray(cmd.parameters[0])) {
          cmd.parameters[0] = cmd.parameters[0].map(
            choice => typeof choice === 'string' ? uwuTransform(choice) : choice
          );
        }
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// Actors.json  (profile field only)
// ---------------------------------------------------------------------------

function processActors(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  for (const actor of data) {
    if (!actor) continue;
    if (actor.profile) {
      actor.profile = uwuTransform(actor.profile);
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let mapCount = 0;
for (let i = 1; i <= 38; i++) {
  const name = `Map${String(i).padStart(3, '0')}.json`;
  const fp   = path.join(DATA_DIR, name);
  if (fs.existsSync(fp)) {
    const changed = processMapFile(fp);
    if (changed) {
      console.log(`  ✓ ${name}`);
      mapCount++;
    }
  }
}

processActors(path.join(DATA_DIR, 'Actors.json'));
console.log(`  ✓ Actors.json (profile fields)`);

console.log(`\nDone! ${mapCount} map files and Actors.json UwU-ified. >w<`);
