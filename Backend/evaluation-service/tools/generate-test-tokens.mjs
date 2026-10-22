// Générateur de tokens JWT HS256 de TEST pour le service Evaluation.
//
// Usage (le secret doit être identique à celui du User Service, min 32 octets) :
//   JWT_SECRET="..." JWT_ISSUER="campushub-user-service" node tools/generate-test-tokens.mjs
//
// Les tokens produits couvrent : rôles valides, token expiré, mauvais secret,
// mauvais issuer, rôle inconnu et "sub" qui n'est pas un Guid.
import crypto from 'node:crypto';

const secret = process.env.JWT_SECRET;
const issuer = process.env.JWT_ISSUER ?? 'campushub-user-service';

if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
  console.error('JWT_SECRET est absent ou trop court (minimum 32 octets).');
  process.exit(1);
}

// Encodage base64url d'un objet JSON.
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

// Construit un token HS256 signé.
function signerToken({ sub, role, iss = issuer, key = secret, ttlSecondes = 3600 }) {
  const maintenant = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub,
    role,
    iss,
    iat: maintenant,
    exp: maintenant + ttlSecondes,
    jti: crypto.randomUUID(),
  };
  const donnees = `${b64url(header)}.${b64url(payload)}`;
  const signature = crypto.createHmac('sha256', key).update(donnees).digest('base64url');
  return `${donnees}.${signature}`;
}

// Identifiants (sub) de test, réutilisés pour les tests d'accès.
const ids = {
  etudiant: '11111111-1111-1111-1111-111111111111',
  etudiant2: '44444444-4444-4444-4444-444444444444',
  enseignant: '22222222-2222-2222-2222-222222222222',
  enseignant2: '55555555-5555-5555-5555-555555555555',
  admin: '33333333-3333-3333-3333-333333333333',
};

const tokens = {
  tokenEtudiant: signerToken({ sub: ids.etudiant, role: 'ETUDIANT' }),
  tokenEtudiant2: signerToken({ sub: ids.etudiant2, role: 'ETUDIANT' }),
  tokenEnseignant: signerToken({ sub: ids.enseignant, role: 'ENSEIGNANT' }),
  tokenEnseignant2: signerToken({ sub: ids.enseignant2, role: 'ENSEIGNANT' }),
  tokenAdmin: signerToken({ sub: ids.admin, role: 'ADMIN' }),
  tokenExpire: signerToken({ sub: ids.etudiant, role: 'ETUDIANT', ttlSecondes: -60 }),
  tokenMauvaisSecret: signerToken({
    sub: ids.etudiant,
    role: 'ETUDIANT',
    key: 'un-autre-secret-tres-long-mais-different-0123456789',
  }),
  tokenMauvaisIssuer: signerToken({ sub: ids.etudiant, role: 'ETUDIANT', iss: 'attacker-service' }),
  tokenRoleInconnu: signerToken({ sub: ids.etudiant, role: 'SUPER_ADMIN' }),
  tokenSubNonGuid: signerToken({ sub: 'pas-un-guid', role: 'ETUDIANT' }),
};

console.log(`# IDs de test (sub)`);
for (const [nom, valeur] of Object.entries(ids)) {
  console.log(`#   ${nom} = ${valeur}`);
}
console.log('#');
console.log('# Tokens — coller les valeurs dans EvaluationService.http');
for (const [nom, valeur] of Object.entries(tokens)) {
  console.log(`@${nom} = ${valeur}`);
}
