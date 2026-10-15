const Topic = require('../models/Topic');
const Post = require('../models/Post');
const HttpError = require('./httpError');

async function findActiveTopic(id) {
  const topic = await Topic.findOne({ _id: id, isDeleted: false });
  if (!topic) throw new HttpError(404, 'Sujet introuvable');
  return topic;
}

async function findActivePost(id) {
  const post = await Post.findOne({ _id: id, isDeleted: false });
  if (!post) throw new HttpError(404, 'Réponse introuvable');
  return post;
}

module.exports = { findActiveTopic, findActivePost };