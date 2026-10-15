const mongoose = require('mongoose');

async function connectDB(uri) {
  await mongoose.connect(uri);
  console.log(`MongoDB connecté : ${mongoose.connection.name}`);
}

module.exports = connectDB;