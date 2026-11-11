import { timeAgo } from './time-ago';

describe('timeAgo', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it("affiche « à l'instant » sous une minute", () => {
    expect(timeAgo(ago(20), now)).toBe("à l'instant");
  });

  it('affiche minutes, heures et jours en français', () => {
    expect(timeAgo(ago(5 * 60), now)).toBe('il y a 5 minutes');
    expect(timeAgo(ago(2 * 3600), now)).toBe('il y a 2 heures');
    expect(timeAgo(ago(3 * 24 * 3600), now)).toBe('il y a 3 jours');
  });

  it('gère le singulier', () => {
    expect(timeAgo(ago(3600), now)).toBe('il y a 1 heure');
  });

  it('renvoie une chaîne vide pour une date invalide', () => {
    expect(timeAgo('pas une date', now)).toBe('');
  });
});
