const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const app = express();

app.use(helmet());
app.use(express.json());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    service: 'forum-service',
    status: dbUp ? 'UP' : 'DOWN',
  });
});

app.use('/api/v1', require('./routes'));

app.use((req, res) => {
  res.status(404).json({ message: 'Route introuvable' });
});

app.use((err, req, res, next) => {
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Identifiant invalide' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Données invalides',
      errors: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'Ressource déjà existante' });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  res.status(500).json({ message: 'Erreur interne' });
});

module.exports = app;