const pool = require('../db/pool');

// Characters that are visually unambiguous (no 0/O, 1/I/l confusion)
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generate a random join code of the given length.
 */
function generateCode(length = 8) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

/**
 * Generate a join code guaranteed to be unique in the sections table.
 * Retries up to 10 times before giving up (astronomically unlikely to fail).
 */
async function uniqueJoinCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateCode(8);
    const { rows } = await pool.query(
      'SELECT id FROM sections WHERE join_code = $1',
      [code]
    );
    if (rows.length === 0) return code;
  }
  throw new Error('Could not generate a unique join code after 10 attempts.');
}

module.exports = { uniqueJoinCode };
