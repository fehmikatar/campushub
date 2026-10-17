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

@Injectable()
export class ChapterService {
  constructor(
    @InjectRepository(Chapter) private repo: Repository<Chapter>,
    private courses: CourseService,
  ) {}

  async create(coursId: number, dto: CreateChapterDto) {
    await this.courses.findOne(coursId); // 404 si le cours n'existe pas
    const max = (await this.repo.maximum('ordre', { coursId })) ?? 0;
    return this.repo.save(this.repo.create({ ...dto, coursId, ordre: max + 1 }));
  }

  async findByCourse(coursId: number, visibleSeulement = false) {
    await this.courses.findOne(coursId);
    return this.repo.find({
      where: visibleSeulement ? { coursId, visible: true } : { coursId },
      order: { ordre: 'ASC', id: 'ASC' },
    });
  }

  async findOne(coursId: number, id: number) {
    const chapter = await this.repo.findOneBy({ id, coursId });
    if (!chapter) throw new NotFoundException(`Chapitre ${id} introuvable dans le cours ${coursId}`);
    return chapter;
  }

  async update(coursId: number, id: number, dto: UpdateChapterDto) {
    const chapter = await this.findOne(coursId, id);
    Object.assign(chapter, dto);
    return this.repo.save(chapter);
  }

  async reorder(coursId: number, ids: number[]) {
    const chapters = await this.findByCourse(coursId);
    const existants = new Set(chapters.map((c) => c.id));
    if (ids.length !== chapters.length || !ids.every((id) => existants.has(id))) {
      throw new BadRequestException(
        `ids doit contenir exactement les chapitres du cours : [${[...existants].join(', ')}]`,
      );
    }
    const position = new Map(ids.map((id, i) => [id, i + 1]));
    chapters.forEach((c) => (c.ordre = position.get(c.id)!));
    await this.repo.save(chapters);
    return this.findByCourse(coursId);
  }

  async remove(coursId: number, id: number) {
    const course = await this.courses.findOne(coursId);
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

  async setPdf(coursId: number, id: number, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier recu (champ "file")');
    const chapter = await this.findOne(coursId, id).catch((e) => {
      supprimerFichier('pdfs', file.filename); // chapitre inexistant : on jette le fichier
      throw e;
    });
    supprimerFichier('pdfs', chapter.pdfFichier);
    chapter.pdfFichier = file.filename;
    chapter.pdfNom = nomOriginal(file);
    chapter.pdfTaille = file.size;
    return this.repo.save(chapter);
  }

  async getPdf(coursId: number, id: number, download = false) {
    const chapter = await this.findOne(coursId, id);
    if (!chapter.pdfFichier) throw new NotFoundException(`Le chapitre ${id} n'a pas de PDF`);
    if (download && !chapter.telechargementAutorise) {
      throw new ForbiddenException("Le telechargement de ce PDF n'est pas autorise");
    }
    return { chemin: cheminFichier('pdfs', chapter.pdfFichier), nom: chapter.pdfNom ?? 'chapitre.pdf' };
  }

  async removePdf(coursId: number, id: number) {
    const chapter = await this.findOne(coursId, id);
    supprimerFichier('pdfs', chapter.pdfFichier);
    chapter.pdfFichier = null;
    chapter.pdfNom = null;
    chapter.pdfTaille = null;
    return this.repo.save(chapter);
  }

  // Apres une suppression : ordres 1, 2, 3... sans trou
  private async renumeroter(coursId: number) {
    const chapters = await this.repo.find({ where: { coursId }, order: { ordre: 'ASC', id: 'ASC' } });
    chapters.forEach((c, i) => (c.ordre = i + 1));
    await this.repo.save(chapters);
  }
}
