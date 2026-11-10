const express = require('express');
const { authenticate } = require('../shared/middlewares/auth');

const router = express.Router();

router.use(authenticate);
router.use(require('../topic/topicRoutes'));
router.use(require('../post/postRoutes'));
router.use(require('../category/categoryRoutes'));

module.exports = router;