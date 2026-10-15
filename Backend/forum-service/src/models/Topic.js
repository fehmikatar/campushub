const mongoose = require('mongoose');
const { ROLES } = require('../config/roles');

const topicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 150 },
    content: { type: String, required: true, trim: true, maxlength: 10000 },
    courseId: { type: String, required: true, trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    tags: { type: [{ type: String, trim: true, lowercase: true, maxlength: 30 }], default: [] },

    authorId: { type: String, required: true },
    authorRole: { type: String, enum: ROLES, required: true },

    isPinned: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    isResolved: { type: Boolean, default: false },

    repliesCount: { type: Number, default: 0, min: 0 },
    viewsCount: { type: Number, default: 0, min: 0 },
    lastActivityAt: { type: Date, default: Date.now },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

topicSchema.index({ courseId: 1, isPinned: -1, lastActivityAt: -1 });
topicSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.model('Topic', topicSchema);