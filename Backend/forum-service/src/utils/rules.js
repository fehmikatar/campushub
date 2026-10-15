const { param } = require('express-validator');

exports.mongoIdParam = (name) => param(name).isMongoId().withMessage('Identifiant invalide');