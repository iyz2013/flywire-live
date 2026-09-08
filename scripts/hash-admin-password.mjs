import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
const silent = new Writable({ write(chunk, encoding, callback) { callback(); } });
const reader = createInterface({ input: process.stdin, output: silent, terminal: !!process.stdin.isTTY });
process.stderr.write('Admin password: ');
const password = await new Promise(resolve => reader.question('', resolve));
reader.close();process.stderr.write('\n');
if (!password) { console.error('Password cannot be empty.'); process.exit(1); }
const salt = randomBytes(32).toString('hex');
console.log(salt + ':' + scryptSync(password, salt, 64).toString('hex'));
