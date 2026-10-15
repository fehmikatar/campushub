const Post = require('../models/Post');
const Topic = require('../models/Topic');
const Like = require('../models/Like');
const HttpError = require('../utils/httpError');
const { findActiveTopic, findActivePost } = require('../utils/finders');
const { isModerator, isOwnerOrModerator } = require('../utils/permissions');
const paginate = require('../utils/pagination');

exports.createPost = async (req, res) => {
  const topic = await findActiveTopic(req.params.topicId);
  if (topic.isLocked && !isModerator(req.user)) throw new HttpError(403, 'Sujet verrouillé');

  const { content, parentPostId } = req.body;
  if (parentPostId) {
    const parent = await Post.findOne({ _id: parentPostId, topicId: topic._id, isDeleted: false });
    if (!parent) throw new HttpError(400, 'Réponse parente introuvable dans ce sujet');
    if (parent.parentPostId) throw new HttpError(400, 'Un seul niveau de réponse imbriquée est autorisé');
  }

  const post = await Post.create({
    topicId: topic._id,
    parentPostId: parentPostId || null,
    content,
    authorId: req.user.id,
    authorRole: req.user.role,
  });

  await Topic.updateOne(
    { _id: topic._id },
    { $inc: { repliesCount: 1 }, $set: { lastActivityAt: new Date() } }
  );

  res.status(201).json(post);
};

exports.listPosts = async (req, res) => {
  const topic = await findActiveTopic(req.params.topicId);
  const { page, limit, skip } = paginate(req.query);
  const filter = { topicId: topic._id, isDeleted: false };

  const [posts, total] = await Promise.all([
    Post.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
    Post.countDocuments(filter),
  ]);

  const likes = await Like.find({ userId: req.user.id, postId: { $in: posts.map((p) => p._id) } })
    .select('postId')
    .lean();
  const liked = new Set(likes.map((l) => String(l.postId)));
  const items = posts.map((p) => ({ ...p, likedByMe: liked.has(String(p._id)) }));

  res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
};

exports.updatePost = async (req, res) => {
  const post = await findActivePost(req.params.postId);
  if (!isOwnerOrModerator(req.user, post.authorId)) throw new HttpError(403, 'Accès interdit');

  post.content = req.body.content;
  await post.save();
  res.json(post);
};

exports.deletePost = async (req, res) => {
  const post = await findActivePost(req.params.postId);
  if (!isOwnerOrModerator(req.user, post.authorId)) throw new HttpError(403, 'Accès interdit');

  const result = await Post.updateOne(
    { _id: post._id, isDeleted: false },
    { $set: { isDeleted: true, isAcceptedAnswer: false } }
  );

  if (result.modifiedCount === 1) {
    const update = { $inc: { repliesCount: -1 } };
    if (post.isAcceptedAnswer) update.$set = { isResolved: false };
    await Topic.updateOne({ _id: post.topicId }, update);
  }

  res.status(204).end();
};

exports.acceptPost = async (req, res) => {
  const post = await findActivePost(req.params.postId);
  const topic = await findActiveTopic(post.topicId);
  if (!isOwnerOrModerator(req.user, topic.authorId)) {
    throw new HttpError(403, "Seul l'auteur du sujet ou un enseignant peut valider une réponse");
  }

  const accepted = req.body.value;
  if (accepted) {
    await Post.updateMany({ topicId: topic._id, isAcceptedAnswer: true }, { $set: { isAcceptedAnswer: false } });
  }
  await Post.updateOne({ _id: post._id }, { $set: { isAcceptedAnswer: accepted } });
  await Topic.updateOne({ _id: topic._id }, { $set: { isResolved: accepted } });

  res.json({ postId: post.id, isAcceptedAnswer: accepted, topicResolved: accepted });
};

exports.likePost = async (req, res) => {
  const post = await findActivePost(req.params.postId);

  await Like.create({ userId: req.user.id, postId: post._id });
  const updated = await Post.findByIdAndUpdate(post._id, { $inc: { likesCount: 1 } }, { returnDocument: 'after' }).lean();

  res.status(201).json({ postId: post.id, likesCount: updated.likesCount, likedByMe: true });
};

exports.unlikePost = async (req, res) => {
  const post = await findActivePost(req.params.postId);

  const result = await Like.deleteOne({ userId: req.user.id, postId: post._id });
  if (result.deletedCount === 0) throw new HttpError(404, "Vous n'avez pas aimé cette réponse");

  const updated = await Post.findByIdAndUpdate(post._id, { $inc: { likesCount: -1 } }, { returnDocument: 'after' }).lean();

  res.json({ postId: post.id, likesCount: updated.likesCount, likedByMe: false });
};