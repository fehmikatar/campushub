const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { ROLES } = require('../config/roles');

// Mode Keycloak : actif si KEYCLOAK_ISSUER_URI est renseigné (RS256, clés publiques du realm).
// Sinon : ancien mode HS256 avec JWT_SECRET (tests locaux).
const keycloakEnabled = () => Boolean(process.env.KEYCLOAK_ISSUER_URI);

let client = null;
let clientUri = null;

function jwks() {
  // KEYCLOAK_JWKS_URI permet d'aller chercher les clés par une autre adresse que l'issuer (Docker)
  const uri =
    process.env.KEYCLOAK_JWKS_URI ||
    `${process.env.KEYCLOAK_ISSUER_URI}/protocol/openid-connect/certs`;
  if (!client || clientUri !== uri) {
    client = jwksClient({ jwksUri: uri, cache: true, cacheMaxAge: 10 * 60 * 1000, timeout: 3000 });
    clientUri = uri;
  }
  return client;
}

// Parmi les rôles du realm, on garde le plus élevé que CampusHub connaît
function pickRole(payload) {
  const roles = (payload.realm_access && payload.realm_access.roles) || [];
  return [...ROLES].reverse().find((r) => roles.includes(r));
}

function verifyKeycloak(token) {
  let keyError = null;
  const getKey = (header, cb) => {
    jwks().getSigningKey(header.kid, (err, key) => {
      if (err) {
        keyError = err;
        return cb(err);
      }
      cb(null, key.getPublicKey());
    });
  };
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      { algorithms: ['RS256'], issuer: process.env.KEYCLOAK_ISSUER_URI },
      (err, payload) => {
        if (err) {
          err.keyError = keyError;
          return reject(err);
        }
        resolve(payload);
      }
    );
  });
}

function verifyLegacy(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: process.env.JWT_ISSUER || 'campushub-user-service',
  });
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Token manquant' });
  }

  try {
    let payload;
    let role;
    if (keycloakEnabled()) {
      payload = await verifyKeycloak(token);
      if (typeof payload.sub !== 'string') {
        return res.status(401).json({ message: 'Token invalide' });
      }
      role = pickRole(payload);
      if (!role) {
        return res.status(403).json({ message: 'Accès interdit' });
      }
    } else {
      payload = verifyLegacy(token);
      role = payload.role;
      if (typeof payload.sub !== 'string' || !ROLES.includes(role)) {
        return res.status(401).json({ message: 'Token invalide' });
      }
    }

    req.user = { id: payload.sub, role };
    next();
  } catch (err) {
    // Keycloak injoignable (et clé inconnue du cache) : ce n'est pas la faute du client
    if (err.keyError && err.keyError.name !== 'SigningKeyNotFoundError') {
      console.error('[auth] Keycloak injoignable :', err.keyError.message);
      return res.status(503).json({ message: "Service d'authentification indisponible, réessayez plus tard." });
    }
    const message = err.name === 'TokenExpiredError' ? 'Token expiré' : 'Token invalide';
    return res.status(401).json({ message });
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès interdit' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };