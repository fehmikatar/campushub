const HttpError = require('./httpError');

// Appel synchrone Forum -> Course : vérifie qu'un cours existe avant d'y créer un sujet.
// Règles : docs "règles communes du synchrone" (Eureka, JWT transmis, 3 s, jamais de 500).
//   COURSE_CHECK_ENABLED=true   active la vérification (sinon aucun appel, comme RABBITMQ_URL vide)
//   COURSE_SERVICE_URL=...      remplace Eureka si renseignée (utile en Docker)
//   COURSE_TIMEOUT_MS=3000      délai maximum (3 s par défaut)

let eurekaClient = null;

// Appelé par server.js une fois le client Eureka créé
function setEurekaClient(client) {
  eurekaClient = client;
}

function isEnabled() {
  return process.env.COURSE_CHECK_ENABLED === 'true';
}

function baseUrl() {
  if (process.env.COURSE_SERVICE_URL) return process.env.COURSE_SERVICE_URL.replace(/\/+$/, '');
  if (!eurekaClient) return null;
  try {
    // lève une erreur si COURSE-SERVICE n'est pas (encore) dans le registre
    const instances = eurekaClient.getInstancesByAppId('COURSE-SERVICE');
    const instance = instances.find((i) => i.status === 'UP') || instances[0];
    return instance ? `http://${instance.hostName}:${instance.port.$}` : null;
  } catch {
    return null;
  }
}

const unavailable = () => new HttpError(503, 'Service des cours indisponible, réessayez plus tard.');

async function assertCourseExists(courseId, authorization) {
  if (!isEnabled()) return;

  const url = baseUrl();
  if (!url) {
    console.warn('[course] course-service introuvable (Eureka / COURSE_SERVICE_URL)');
    throw unavailable();
  }

  let res;
  try {
    res = await fetch(`${url}/courses/${encodeURIComponent(courseId)}`, {
      // le JWT de l'utilisateur est transmis tel quel : Course le valide lui-même
      headers: authorization ? { Authorization: authorization } : {},
      signal: AbortSignal.timeout(Number(process.env.COURSE_TIMEOUT_MS) || 3000),
    });
  } catch (err) {
    console.warn(`[course] appel impossible : ${err.message}`);
    throw unavailable();
  }
  if (res.body) res.body.cancel().catch(() => {});

  if (res.ok) return;
  if (res.status === 404 || res.status === 400) throw new HttpError(404, 'Cours introuvable');
  if (res.status === 401) throw new HttpError(401, 'Token invalide');
  if (res.status === 403) throw new HttpError(403, 'Accès interdit');
  console.warn(`[course] réponse inattendue : ${res.status}`);
  throw unavailable();
}

module.exports = { isEnabled, setEurekaClient, assertCourseExists };