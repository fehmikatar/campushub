const express = require('express');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate);
router.use(require('./topicRoutes'));
router.use(require('./postRoutes'));
router.use(require('./categoryRoutes'));

module.exports = router;