/**
 * npm run create-admin
 *
 * Creates an ADMIN user directly in the database.
 * There is NO public endpoint for admin registration.
 *
 * Usage:
 *   npm run create-admin
 *   -- or pass args to skip prompts --
 *   ADMIN_FIRST=John ADMIN_LAST=Doe ADMIN_EMAIL=admin@hau.edu.ph ADMIN_PASS=secret123 npm run create-admin
 */
require('dotenv').config();
const readline = require('readline');
const bcrypt   = require('bcryptjs');
const pool     = require('../src/db/pool');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log('\n─── SEA-IT-SOLVED: Create Admin Account ───\n');

  const firstName = process.env.ADMIN_FIRST || await ask('First name: ');
  const lastName  = process.env.ADMIN_LAST  || await ask('Last name:  ');
  const email     = process.env.ADMIN_EMAIL || await ask('Email:      ');
  const password  = process.env.ADMIN_PASS  || await ask('Password:   ');

  rl.close();

  if (!firstName || !lastName || !email || !password) {
    console.error('All fields are required.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password.trim(), 12);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, status)
       VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE')
       RETURNING id, first_name, last_name, email, role, status`,
      [firstName.trim(), lastName.trim(), email.trim().toLowerCase(), passwordHash]
    );

    console.log('\n✅ Admin account created successfully:');
    console.table(rows[0]);
    console.log('\nYou can now log in at /login with this email and password.\n');
  } catch (err) {
    if (err.code === '23505') {
      console.error(`\n❌ An account with email "${email}" already exists.`);
    } else {
      console.error('\n❌ Failed to create admin account:', err.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
