import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Course } from './course.entity.js';
import { Chapter } from '../chapter/chapter.entity.js';
import { CreateCourseDto, QueryCourseDto, UpdateCourseDto } from './course.dto.js';
import { IMAGE_URL_PREFIX, StatutCours } from './course.enums.js';
import { supprimerFichier } from '../common/upload.js';

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(Course) private repo: Repository<Course>,
    @InjectRepository(Chapter) private chapters: Repository<Chapter>,
  ) {}

  async create(dto: CreateCourseDto) {
    const { chapitres = [], ...data } = dto;
    if (data.statut === StatutCours.PUBLIE && chapitres.length === 0) {
      throw new BadRequestException('Impossible de publier un cours sans chapitre');
    }
    const course = this.repo.create({
      ...data,
      chapitres: chapitres.map((c, i) => ({ ...c, ordre: i + 1 })),
    });
    const saved = await this.repo.save(course);
    return this.findOne(saved.id);
  }

  async findAll(query: QueryCourseDto) {
    const { search, categorie, statut, formateurId, page, limit } = query;

    const qb = this.repo.createQueryBuilder('cours')
      .orderBy('cours.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);
    if (categorie) qb.andWhere('cours.categorie = :categorie', { categorie });
    if (statut) qb.andWhere('cours.statut = :statut', { statut });
    if (formateurId) qb.andWhere('cours.formateurId = :formateurId', { formateurId });
    if (search) {
      qb.andWhere(new Brackets((w) => {
        w.where('cours.titre ILIKE :search', { search: `%${search}%` })
          .orWhere('cours.description ILIKE :search', { search: `%${search}%` });
      }));
    }
    const [data, total] = await qb.getManyAndCount();

    // Nombre de chapitres par cours (badge "3 chapitres") en une seule requete
    if (data.length) {
      const counts: { coursId: number; nb: string }[] = await this.chapters
        .createQueryBuilder('ch')
        .select('ch.coursId', 'coursId')
        .addSelect('COUNT(*)', 'nb')
        .where('ch.coursId IN (:...ids)', { ids: data.map((c) => c.id) })
        .groupBy('ch.coursId')
        .getRawMany();
      const parCours = new Map(counts.map((c) => [Number(c.coursId), Number(c.nb)]));
      data.forEach((c) => (c.nbChapitres = parCours.get(c.id) ?? 0));
    }

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const course = await this.repo.findOne({
      where: { id },
      relations: { chapitres: true },
      order: { chapitres: { ordre: 'ASC', id: 'ASC' } },
    });
    if (!course) throw new NotFoundException(`Cours ${id} introuvable`);
    return course;
  }

  async update(id: number, dto: UpdateCourseDto) {
    const course = await this.findOne(id);
    if (dto.statut === StatutCours.PUBLIE && course.chapitres.length === 0) {
      throw new BadRequestException('Impossible de publier un cours sans chapitre');
    }
    if (dto.imageUrl !== undefined && dto.imageUrl !== course.imageUrl) {
      this.supprimerImageLocale(course.imageUrl);
    }
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async publish(id: number) {
    const course = await this.findOne(id);
    if (course.statut === StatutCours.PUBLIE) {
      throw new BadRequestException(`Le cours ${id} est deja publie`);
    }
    if (course.chapitres.length === 0) {
      throw new BadRequestException('Impossible de publier un cours sans chapitre');
    }
    await this.repo.update(id, { statut: StatutCours.PUBLIE });
    return this.findOne(id);
  }

  async archive(id: number) {
    const course = await this.findOne(id);
    if (course.statut === StatutCours.ARCHIVE) {
      throw new BadRequestException(`Le cours ${id} est deja archive`);
    }
    await this.repo.update(id, { statut: StatutCours.ARCHIVE });
    return this.findOne(id);
  }

  async setImage(id: number, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier recu (champ "file")');
    const course = await this.findOne(id).catch((e) => {
      supprimerFichier('images', file.filename); // cours inexistant : on jette le fichier
      throw e;
    });
    this.supprimerImageLocale(course.imageUrl);
    await this.repo.update(id, { imageUrl: IMAGE_URL_PREFIX + file.filename });
    return this.findOne(id);
  }

  async removeImage(id: number) {
    const course = await this.findOne(id);
    this.supprimerImageLocale(course.imageUrl);
    await this.repo.update(id, { imageUrl: null });
    return this.findOne(id);
  }

  async remove(id: number) {
    const course = await this.findOne(id);
    await this.repo.remove(course); // chapitres supprimes par ON DELETE CASCADE
    this.supprimerImageLocale(course.imageUrl);
    course.chapitres.forEach((ch) => supprimerFichier('pdfs', ch.pdfFichier));
  }

  private supprimerImageLocale(imageUrl?: string | null) {
    if (imageUrl?.startsWith(IMAGE_URL_PREFIX)) {
      supprimerFichier('images', imageUrl.slice(IMAGE_URL_PREFIX.length));
    }
  }
}
