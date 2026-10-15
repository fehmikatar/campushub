const express = require('express');
const { body } = require('express-validator');
const { requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { mongoIdParam } = require('../utils/rules');
const c = require('../controllers/categoryController');

const router = express.Router();

const nameRule = (optional) => {
  const chain = body('name');
  return (optional ? chain.optional() : chain).trim().isLength({ min: 2, max: 80 }).withMessage('Nom : 2 à 80 caractères');
};
const otherRules = [
  body('description').optional().isString().trim().isLength({ max: 300 }),
  body('order').optional().isInt({ min: 0 }).toInt(),
];

router.get('/categories', c.listCategories);
router.post('/categories', requireRole('ADMIN'), nameRule(false), ...otherRules, validate, c.createCategory);
router.put('/categories/:categoryId', requireRole('ADMIN'), mongoIdParam('categoryId'), nameRule(true), ...otherRules, validate, c.updateCategory);
router.delete('/categories/:categoryId', requireRole('ADMIN'), mongoIdParam('categoryId'), validate, c.deleteCategory);

module.exports = router;