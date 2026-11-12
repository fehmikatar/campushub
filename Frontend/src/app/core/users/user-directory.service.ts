import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

/**
 * Noms des utilisateurs. L'API du forum ne renvoie que `authorId` et `authorRole` ; le service User
 * (GET /api/v1/users/{id}/public) n'existe pas encore : le nom est donc toujours `null` et l'écran affiche le rôle.
 * À brancher ici quand le service User sera disponible.
 */
@Injectable({ providedIn: 'root' })
export class UserDirectoryService {
  name(_userId: string): Observable<string | null> {
    return of(null);
  }
}
