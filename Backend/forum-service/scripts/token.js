require('dotenv').config();
const jwt = require('jsonwebtoken');

const DEFAULT_SUBS = {
  ETUDIANT: '11111111-1111-4111-8111-111111111111',
  ENSEIGNANT: '3f2b8c1e-5d4a-4c1b-9a0e-2d7f6b1c8e90',
  ADMIN: '99999999-9999-4999-8999-999999999999',
};

const [role = 'ETUDIANT', sub = DEFAULT_SUBS[role]] = process.argv.slice(2);

console.log(
  jwt.sign({ role }, process.env.JWT_SECRET, {
    subject: sub,
    issuer: process.env.JWT_ISSUER || 'campushub-user-service',
    expiresIn: '1h',
  })
);