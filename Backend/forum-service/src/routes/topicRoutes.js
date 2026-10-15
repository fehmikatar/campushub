const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');
const { mongoIdParam } = require('../utils/rules');
const c = require('../controllers/topicController');

const router = express.Router();

const courseIdRule = param('courseId').trim().notEmpty().isLength({ max: 64 });
const boolValue = body('value').isBoolean({ strict: true }).withMessage('value doit être true ou false');

const titleRule = (optional) => {
  const chain = body('title');
  return (optional ? chain.optional() : chain).trim().isLength({ min: 5, max: 150 }).withMessage('Titre : 5 à 150 caractères');
};
const contentRule = (optional) => {
  const chain = body('content');
  return (optional ? chain.optional() : chain).trim().isLength({ min: 1, max: 10000 }).withMessage('Contenu : 1 à 10000 caractères');
};
const tagsRules = [
  body('tags').optional().isArray({ max: 5 }).withMessage('5 tags maximum'),
  body('tags.*').optional().isString().trim().isLength({ max: 30 }),
];

router.get('/courses/:courseId/topics', courseIdRule, validate, c.listTopics);
router.post(
  '/courses/:courseId/topics',
  courseIdRule,
  titleRule(false),
  contentRule(false),
  ...tagsRules,
  body('categoryId').optional().isMongoId(),
  validate,
  c.createTopic
);

router.get('/topics/:topicId', mongoIdParam('topicId'), validate, c.getTopic);
router.put(
  '/topics/:topicId',
  mongoIdParam('topicId'),
  titleRule(true),
  contentRule(true),
  ...tagsRules,
  body('categoryId').optional({ values: 'null' }).isMongoId(),
  validate,
  c.updateTopic
);
router.delete('/topics/:topicId', mongoIdParam('topicId'), validate, c.deleteTopic);

router.patch('/topics/:topicId/pin', mongoIdParam('topicId'), boolValue, validate, c.pinTopic);
router.patch('/topics/:topicId/lock', mongoIdParam('topicId'), boolValue, validate, c.lockTopic);
router.patch('/topics/:topicId/resolve', mongoIdParam('topicId'), boolValue, validate, c.resolveTopic);

module.exports = router;