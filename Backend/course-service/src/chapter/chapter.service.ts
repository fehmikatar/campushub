import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chapter } from './chapter.entity.js';
import { CreateChapterDto, UpdateChapterDto } from './chapter.dto.js';
import { CourseService } from '../course/course.service.js';
import { StatutCours } from '../course/course.enums.js';
import { cheminFichier, nomOriginal, supprimerFichier } from '../common/upload.js';
import { EventPublisher } from '../messaging/event-publisher.service.js';
import { AuthUser, Role } from '../auth/auth.js';

@Injectable()
export class ChapterService {
  constructor(
    @InjectRepository(Chapter) private repo: Repository<Chapter>,
    private courses: CourseService,
    private events: EventPublisher,
  ) {}

  async create(coursId: number, dto: CreateChapterDto, user: AuthUser) {
    const course = await this.courses.findOwned(coursId, user); // 404 cours inconnu, 403 pas le sien
    const max = (await this.repo.maximum('ordre', { coursId })) ?? 0;
    const saved = await this.repo.save(this.repo.create({ ...dto, coursId, ordre: max + 1 }));
    // Evenement RabbitMQ : nouveau chapitre visible dans un cours deja publie
    if (saved.visible && course.statut === StatutCours.PUBLIE) {
      this.events.publish('chapter.created', course.formateurId, {
        courseId: course.id,
        chapterId: saved.id,
        titre: saved.titre,
      });
    }
    return saved;
  }

  // Un etudiant ne voit que les chapitres visibles d'un cours publie
  async findByCourse(coursId: number, user: AuthUser, visibleSeulement = false) {
    await this.courses.findOneFor(coursId, user);
    return this.lister(coursId, visibleSeulement || user.role === Role.ETUDIANT);
  }

  async findOne(coursId: number, id: number) {
    const chapter = await this.repo.findOneBy({ id, coursId });
    if (!chapter) throw new NotFoundException(`Chapitre ${id} introuvable dans le cours ${coursId}`);
    return chapter;
  }

  // Consultation : pour un etudiant, un chapitre masque n'existe pas (404)
  async findOneFor(coursId: number, id: number, user: AuthUser) {
    await this.courses.findOneFor(coursId, user);
    const chapter = await this.findOne(coursId, id);
    if (user.role === Role.ETUDIANT && !chapter.visible) {
      throw new NotFoundException(`Chapitre ${id} introuvable dans le cours ${coursId}`);
    }
    return chapter;
  }

  async update(coursId: number, id: number, dto: UpdateChapterDto, user: AuthUser) {
    await this.courses.findOwned(coursId, user);
    const chapter = await this.findOne(coursId, id);
    Object.assign(chapter, dto);
    return this.repo.save(chapter);
  }

  async reorder(coursId: number, ids: number[], user: AuthUser) {
    await this.courses.findOwned(coursId, user);
    const chapters = await this.lister(coursId);
    const existants = new Set(chapters.map((c) => c.id));
    if (ids.length !== chapters.length || !ids.every((id) => existants.has(id))) {
      throw new BadRequestException(
        `ids doit contenir exactement les chapitres du cours : [${[...existants].join(', ')}]`,
      );
    }
    const position = new Map(ids.map((id, i) => [id, i + 1]));
    chapters.forEach((c) => (c.ordre = position.get(c.id)!));
    await this.repo.save(chapters);
    return this.lister(coursId);
  }

  async remove(coursId: number, id: number, user: AuthUser) {
    const course = await this.courses.findOwned(coursId, user);
    const chapter = await this.findOne(coursId, id);
    if (course.statut === StatutCours.PUBLIE && course.chapitres.length === 1) {
      throw new BadRequestException(
        "Impossible de supprimer le dernier chapitre d'un cours publie (archivez ou repassez-le en brouillon)",
      );
    }
    await this.repo.remove(chapter);
    supprimerFichier('pdfs', chapter.pdfFichier);
    await this.renumeroter(coursId);
  }

  async setPdf(coursId: number, id: number, user: AuthUser, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier recu (champ "file")');
    const chapter = await this.courses
      .findOwned(coursId, user)
      .then(() => this.findOne(coursId, id))
      .catch((e) => {
        supprimerFichier('pdfs', file.filename); // chapitre inexistant ou interdit : on jette le fichier
        throw e;
      });
    supprimerFichier('pdfs', chapter.pdfFichier);
    chapter.pdfFichier = file.filename;
    chapter.pdfNom = nomOriginal(file);
    chapter.pdfTaille = file.size;
    return this.repo.save(chapter);
  }

  async getPdf(coursId: number, id: number, user: AuthUser, download = false) {
    const chapter = await this.findOneFor(coursId, id, user);
    if (!chapter.pdfFichier) throw new NotFoundException(`Le chapitre ${id} n'a pas de PDF`);
    if (download && !chapter.telechargementAutorise) {
      throw new ForbiddenException("Le telechargement de ce PDF n'est pas autorise");
    }
    return { chemin: cheminFichier('pdfs', chapter.pdfFichier), nom: chapter.pdfNom ?? 'chapitre.pdf' };
  }

  async removePdf(coursId: number, id: number, user: AuthUser) {
    await this.courses.findOwned(coursId, user);
    const chapter = await this.findOne(coursId, id);
    supprimerFichier('pdfs', chapter.pdfFichier);
    chapter.pdfFichier = null;
    chapter.pdfNom = null;
    chapter.pdfTaille = null;
    return this.repo.save(chapter);
  }

  private lister(coursId: number, visibleSeulement = false) {
    return this.repo.find({
      where: visibleSeulement ? { coursId, visible: true } : { coursId },
      order: { ordre: 'ASC', id: 'ASC' },
    });
  }

  // Apres une suppression : ordres 1, 2, 3... sans trou
  private async renumeroter(coursId: number) {
    const chapters = await this.lister(coursId);
    chapters.forEach((c, i) => (c.ordre = i + 1));
    await this.repo.save(chapters);
  }
}
