import { Injectable } from '@angular/core';

/**
 * Noms des auteurs. L'API forum ne donne que `authorId` ; les noms viendront du service User plus tard.
 * Pour l'instant : toujours `null` (l'écran affiche alors « Utilisateur »).
 */
@Injectable({ providedIn: 'root' })
export class UserDirectoryService {
  displayName(_userId: string): string | null {
    return null;
  }
}
