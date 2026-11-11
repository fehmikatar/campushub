export interface JwtPayload {
  sub?: string;
  exp?: number;
  given_name?: string;
  family_name?: string;
  email?: string;
  realm_access?: { roles?: string[] };
}

/** Décode seulement le contenu du token : la signature est vérifiée par la Gateway et les services. */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const part = token.split('.')[1];
    if (!part) {
      return null;
    }
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as JwtPayload;
  } catch {
    return null;
  }
}
