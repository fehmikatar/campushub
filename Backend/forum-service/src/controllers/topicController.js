const Topic = require('../models/Topic');
const Category = require('../models/Category');
const HttpError = require('../utils/httpError');
const { findActiveTopic } = require('../utils/finders');
const { isModerator, isOwnerOrModerator } = require('../utils/permissions');
const paginate = require('../utils/pagination');

async function assertCategoryExists(categoryId) {
  if (categoryId && !(await Category.exists({ _id: categoryId }))) {
    throw new HttpError(400, 'Catégorie introuvable');
  }
}

exports.createTopic = async (req, res) => {
  const { title, content, tags, categoryId } = req.body;
  await assertCategoryExists(categoryId);

  const topic = await Topic.create({
    title,
    content,
    tags,
    categoryId,
    courseId: req.params.courseId,
    authorId: req.user.id,
    authorRole: req.user.role,
  });

  res.status(201).json(topic);
};

exports.listTopics = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { categoryId, tag, resolved, q } = req.query;

  const filter = { courseId: req.params.courseId, isDeleted: false };
  if (categoryId) filter.categoryId = categoryId;
  if (tag) filter.tags = String(tag).toLowerCase();
  if (resolved === 'true' || resolved === 'false') filter.isResolved = resolved === 'true';
  if (q) filter.$text = { $search: String(q) };

  const [items, total] = await Promise.all([
    Topic.find(filter).sort({ isPinned: -1, lastActivityAt: -1 }).skip(skip).limit(limit).lean(),
    Topic.countDocuments(filter),
  ]);

  res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
};

exports.getTopic = async (req, res) => {
  const topic = await Topic.findOneAndUpdate(
    { _id: req.params.topicId, isDeleted: false },
    { $inc: { viewsCount: 1 } },
    { returnDocument: 'after' }
  ).lean();
  if (!topic) throw new HttpError(404, 'Sujet introuvable');
  res.json(topic);
};

exports.updateTopic = async (req, res) => {
  const topic = await findActiveTopic(req.params.topicId);
  if (!isOwnerOrModerator(req.user, topic.authorId)) throw new HttpError(403, 'Accès interdit');
  if (topic.isLocked && !isModerator(req.user)) throw new HttpError(403, 'Sujet verrouillé');

  const { title, content, tags, categoryId } = req.body;
  if (title !== undefined) topic.title = title;
  if (content !== undefined) topic.content = content;
  if (tags !== undefined) topic.tags = tags;
  if (categoryId !== undefined) {
    await assertCategoryExists(categoryId);
    topic.categoryId = categoryId;
  }

  await topic.save();
  res.json(topic);
};

exports.deleteTopic = async (req, res) => {
  const topic = await findActiveTopic(req.params.topicId);
  if (!isOwnerOrModerator(req.user, topic.authorId)) throw new HttpError(403, 'Accès interdit');

  topic.isDeleted = true;
  await topic.save();
  res.status(204).end();
};

const setFlag = (field, { moderatorOnly }) => async (req, res) => {
  const topic = await findActiveTopic(req.params.topicId);
  const allowed = moderatorOnly ? isModerator(req.user) : isOwnerOrModerator(req.user, topic.authorId);
  if (!allowed) throw new HttpError(403, 'Accès interdit');

  topic[field] = req.body.value;
  await topic.save();
  res.json({ id: topic.id, [field]: topic[field] });
};

exports.pinTopic = setFlag('isPinned', { moderatorOnly: true });
exports.lockTopic = setFlag('isLocked', { moderatorOnly: true });
exports.resolveTopic = setFlag('isResolved', { moderatorOnly: false });