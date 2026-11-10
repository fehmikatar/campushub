const express = require('express');
const { body } = require('express-validator');
const validate = require('../shared/middlewares/validate');
const { mongoIdParam } = require('../shared/utils/rules');
const c = require('./postController');

const router = express.Router();

const contentRule = body('content').trim().isLength({ min: 1, max: 10000 }).withMessage('Contenu : 1 à 10000 caractères');

router.get('/topics/:topicId/posts', mongoIdParam('topicId'), validate, c.listPosts);
router.post(
  '/topics/:topicId/posts',
  mongoIdParam('topicId'),
  contentRule,
  body('parentPostId').optional().isMongoId(),
  validate,
  c.createPost
);

router.put('/posts/:postId', mongoIdParam('postId'), contentRule, validate, c.updatePost);
router.delete('/posts/:postId', mongoIdParam('postId'), validate, c.deletePost);

router.patch(
  '/posts/:postId/accept',
  mongoIdParam('postId'),
  body('value').isBoolean({ strict: true }).withMessage('value doit être true ou false'),
  validate,
  c.acceptPost
);

router.post('/posts/:postId/like', mongoIdParam('postId'), validate, c.likePost);
router.delete('/posts/:postId/like', mongoIdParam('postId'), validate, c.unlikePost);

module.exports = router;