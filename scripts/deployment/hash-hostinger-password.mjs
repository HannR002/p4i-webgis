// Operator-local helper. Read a protected file/stdin; never pass the password in process arguments.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
if (password.length < 24 || password.length > 256 || !/^[\x21-\x7e]+$/.test(password)) {
  console.error('Use an owner-generated high-entropy ASCII password of 24–256 characters.');
  process.exit(1);
}
// Treat this verifier as confidential; store it only in the isolated app's hPanel environment.
console.log(createHash('sha256').update(password).digest('hex'));
