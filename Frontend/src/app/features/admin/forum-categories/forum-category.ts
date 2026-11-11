/** Catégorie du forum (forum-service). Pas de compteurs de sujets dans l'API. */
export interface ForumCategory {
  _id: string;
  name: string;
  slug: string;
  description: string;
  order: number;
}

export interface ForumCategoryInput {
  name: string;
  description: string;
  order: number;
}
