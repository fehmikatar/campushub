// Cycle de vie : BROUILLON -> PUBLIE -> ARCHIVE (un cours archive peut etre republie)
export enum StatutCours {
  BROUILLON = 'BROUILLON',
  PUBLIE = 'PUBLIE',
  ARCHIVE = 'ARCHIVE',
}

// Liste du select "Categorie" (exposee par GET /courses/categories)
export const CATEGORIES = [
  'Developpement Web',
  'Developpement Mobile',
  'Data Science',
  'Intelligence Artificielle',
  'Reseaux et Securite',
  'Cloud et DevOps',
  'Bases de donnees',
  'Design',
  'Langues',
  'Gestion de projet',
  'Autre',
];

// Prefixe des images uploadees (servies en statique par main.ts)
export const IMAGE_URL_PREFIX = '/uploads/images/';
