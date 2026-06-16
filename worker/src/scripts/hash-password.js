// Usage: node src/scripts/hash-password.js <plaintext>
// Prints ADMIN_PASSWORD_HASH ready to paste into .env.

const bcrypt = require('bcryptjs');

const plain = process.argv[2];
if (!plain) {
  console.error('Usage: npm run hash-password -- <plaintext>');
  process.exit(1);
}
if (plain.length < 8) {
  console.error('Use a password with at least 8 characters.');
  process.exit(1);
}

const hash = bcrypt.hashSync(plain, 12);
console.log(hash);
