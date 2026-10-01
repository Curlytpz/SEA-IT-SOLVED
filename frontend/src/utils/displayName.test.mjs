import assert from 'node:assert/strict';
import { formatDisplayName, formatPersonName } from './displayName.js';

assert.equal(formatDisplayName('  borje,   arnold  '), 'Borje, Arnold');
assert.equal(formatDisplayName('SANTOS, KRIS'), 'Santos, Kris');
assert.equal(formatDisplayName('McDonald, Anne'), 'McDonald, Anne');
assert.equal(formatPersonName({ lastName: 'delos santos', firstName: 'maria' }), 'Delos Santos, Maria');

console.log('display-name presentation tests passed');
