import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Adresses de l'API et de Keycloak. Valeurs de `environment.ts`, remplacées au démarrage par
 * `public/config.local.json` s'il existe (fichier local non versionné, ex. {"apiUrl": "http://localhost:8090"}).
 */
@Injectable({ providedIn: 'root' })
export class AppConfig {
  apiUrl: string = environment.apiUrl;
  keycloakUrl: string = environment.keycloakUrl;
  realm: string = environment.realm;
  clientId: string = environment.clientId;

  async load(): Promise<void> {
    try {
      const response = await fetch('config.local.json', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const overrides = (await response.json()) as Record<string, unknown>;
      for (const key of ['apiUrl', 'keycloakUrl', 'realm', 'clientId'] as const) {
        const value = overrides[key];
        if (typeof value === 'string' && value !== '') {
          this[key] = value;
        }
      }
    } catch {
      // pas de fichier local (le serveur renvoie alors la page d'index) : valeurs par défaut
    }
  }
}
