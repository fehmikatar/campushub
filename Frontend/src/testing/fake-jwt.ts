const encode = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** Token factice (signature bidon) pour les tests : le front ne vérifie jamais la signature. */
export function fakeJwt(claims: Record<string, unknown> = {}, expiresInSeconds = 1800): string {
  const payload = {
    sub: '11111111-1111-4111-8111-111111111111',
    given_name: 'Élise',
    family_name: 'Martin',
    email: 'etudiant1@campushub.test',
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    realm_access: { roles: ['ETUDIANT', 'offline_access'] },
    ...claims,
  };
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}
