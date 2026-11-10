require('dotenv').config();

const connectDB = require('./shared/config/db');
const app = require('./app');
const rabbitPublisher = require('./shared/utils/rabbitPublisher');

const { PORT = 8086, MONGO_URI, JWT_SECRET } = process.env;

if (!MONGO_URI) {
  console.error('MONGO_URI manquant dans le .env');
  process.exit(1);
}
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET manquant ou trop court (32 caractères minimum)');
  process.exit(1);
}

const registerWithEureka = require('./shared/config/eureka');

let server;
let eurekaClient;

connectDB(MONGO_URI)
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`forum-service démarré sur le port ${PORT}`);
      if (process.env.EUREKA_ENABLED !== 'false') {
        eurekaClient = registerWithEureka({ port: PORT });
      }
    });
  })
  .catch((err) => {
    console.error('Connexion MongoDB impossible :', err.message);
    process.exit(1);
  });

// Arrêt propre : Eureka (désenregistrement), serveur HTTP, puis RabbitMQ
async function shutdown(signal) {
  console.log(`${signal} reçu, arrêt du forum-service...`);
  if (server) server.close();
  if (eurekaClient) {
    // on n'attend pas plus de 3 s si Eureka ne répond pas
    await Promise.race([
      new Promise((resolve) =>
        eurekaClient.stop((err) => {
          if (err) console.error('Désenregistrement Eureka échoué :', err.message || err);
          else console.log("Désenregistré d'Eureka");
          resolve();
        })
      ),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }
  await rabbitPublisher.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));