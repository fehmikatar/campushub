import { SignJWT } from 'jose';
import { TextEncoder } from 'util';

const ROLES = ['ETUDIANT', 'ENSEIGNANT', 'ADMIN'];
const DEFAULT_SUB = '3f2a9c1e-7b4d-4e6a-9d21-5c8b0a1f2e34';

const role = process.argv[2]?.toUpperCase() || 'ETUDIANT';
const sub = process.argv[3] || DEFAULT_SUB;

if (!ROLES.includes(role)) {
  console.error(`Role invalide: ${role}. Choisir parmi: ${ROLES.join(', ')}`);
  process.exit(1);
}

const secret = process.env.JWT_SECRET || 'secret-de-test-au-moins-32-octets-de-long';
const issuer = process.env.JWT_ISSUER || 'campushub-user-service';

const token = await new SignJWT({ role, sub })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(sub)
  .setIssuer(issuer)
  .setExpirationTime('1h')
  .sign(new TextEncoder().encode(secret));

console.log(token);