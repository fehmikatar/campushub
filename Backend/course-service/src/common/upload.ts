import { BadRequestException } from '@nestjs/common';
import multer from 'multer';
import { mkdirSync, unlink } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';

// Fichiers stockes sur le disque du service : uploads/images et uploads/pdfs
export const UPLOAD_ROOT = join(process.cwd(), 'uploads');

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PDF_TYPES = ['application/pdf'];

export function uploadOptions(sousDossier: string, types: string[], tailleMaxMo: number) {
  const dossier = join(UPLOAD_ROOT, sousDossier);
  mkdirSync(dossier, { recursive: true });
  return {
    storage: multer.diskStorage({
      destination: dossier,
      filename: (_req, file, cb) =>
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: tailleMaxMo * 1024 * 1024 },
    fileFilter: (
      _req: unknown,
      file: { mimetype: string },
      cb: (error: Error | null, accepte: boolean) => void,
    ) => {
      if (types.includes(file.mimetype)) return cb(null, true);
      cb(new BadRequestException(`Type de fichier non autorise. Acceptes : ${types.join(', ')}`), false);
    },
  };
}

export function cheminFichier(sousDossier: string, nom: string) {
  return join(UPLOAD_ROOT, sousDossier, nom);
}

export function supprimerFichier(sousDossier: string, nom?: string | null) {
  if (nom) unlink(cheminFichier(sousDossier, nom), () => {});
}

// multer lit les noms de fichiers en latin1 : on les remet en UTF-8 (accents)
export function nomOriginal(file: Express.Multer.File) {
  return Buffer.from(file.originalname, 'latin1').toString('utf8');
}

// Schema Swagger pour un champ "file" en multipart/form-data
export const FILE_BODY_SCHEMA = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary' } },
  },
};
