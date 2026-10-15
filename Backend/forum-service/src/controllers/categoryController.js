const Category = require('../models/Category');
const Topic = require('../models/Topic');
const HttpError = require('../utils/httpError');
const slugify = require('../utils/slugify');

exports.listCategories = async (req, res) => {
  res.json(await Category.find().sort({ order: 1, name: 1 }).lean());
};

exports.createCategory = async (req, res) => {
  const { name, description, order } = req.body;
  const category = await Category.create({ name, slug: slugify(name), description, order });
  res.status(201).json(category);
};

exports.updateCategory = async (req, res) => {
  const category = await Category.findById(req.params.categoryId);
  if (!category) throw new HttpError(404, 'Catégorie introuvable');

  const { name, description, order } = req.body;
  if (name !== undefined) {
    category.name = name;
    category.slug = slugify(name);
  }
  if (description !== undefined) category.description = description;
  if (order !== undefined) category.order = order;

  await category.save();
  res.json(category);
};

exports.deleteCategory = async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.categoryId);
  if (!category) throw new HttpError(404, 'Catégorie introuvable');

  await Topic.updateMany({ categoryId: category._id }, { $set: { categoryId: null } });
  res.status(204).end();
};