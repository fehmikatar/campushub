const mongoose = require('mongoose');
const { ROLES } = require('../config/roles');

const postSchema = new mongoose.Schema(
  {
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
    parentPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
    content: { type: String, required: true, trim: true, maxlength: 10000 },

    authorId: { type: String, required: true },
    authorRole: { type: String, enum: ROLES, required: true },

    isAcceptedAnswer: { type: Boolean, default: false },
    likesCount: { type: Number, default: 0, min: 0 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

postSchema.index({ topicId: 1, createdAt: 1 });

module.exports = mongoose.model('Post', postSchema);