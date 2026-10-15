require('dotenv').config();

const connectDB = require('./config/db');
const app = require('./app');

const { PORT = 8086, MONGO_URI, JWT_SECRET } = process.env;

if (!MONGO_URI) {
  console.error('MONGO_URI manquant dans le .env');
  process.exit(1);
}
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET manquant ou trop court (32 caractères minimum)');
  process.exit(1);
}

connectDB(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`forum-service démarré sur le port ${PORT}`));
  })
  .catch((err) => {
    console.error('Connexion MongoDB impossible :', err.message);
    process.exit(1);
  });