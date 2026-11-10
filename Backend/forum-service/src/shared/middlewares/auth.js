const jwt = require('jsonwebtoken');
const { ROLES } = require('../config/roles');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Token manquant' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: process.env.JWT_ISSUER || 'campushub-user-service',
    });

    if (typeof payload.sub !== 'string' || !ROLES.includes(payload.role)) {
      return res.status(401).json({ message: 'Token invalide' });
    }

    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
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