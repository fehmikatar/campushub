import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Course } from './course.entity.js';
import { Chapter } from '../chapter/chapter.entity.js';
import { CreateCourseDto, QueryCourseDto, UpdateCourseDto } from './course.dto.js';
import { IMAGE_URL_PREFIX, StatutCours } from './course.enums.js';
import { supprimerFichier } from '../common/upload.js';
import { EventPublisher } from '../messaging/event-publisher.service.js';
import { AuthUser, Role } from '../auth/auth.js';

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(Course) private repo: Repository<Course>,
    @InjectRepository(Chapter) private chapters: Repository<Chapter>,
    private events: EventPublisher,
  ) {}

  // Evenement RabbitMQ (queue course.events) quand le statut passe a PUBLIE ou ARCHIVE
  private emettreChangementStatut(course: Course, ancien: StatutCours | null) {
    if (course.statut === ancien) return;
    if (course.statut === StatutCours.PUBLIE) {
      // Format attendu par le Notification Service : courseId en texte, title, userIds (>= 1).
      // Destinataire pour l'instant : le formateur du cours. Quand l'Enrollment Service
      // sera pret, userIds pourra contenir les etudiants concernes.
      this.events.publish('course.published', course.formateurId, {
        courseId: String(course.id),
        title: course.titre,
        userIds: [course.formateurId],
      });
    } else if (course.statut === StatutCours.ARCHIVE) {
      this.events.publish('course.archived', course.formateurId, {
        courseId: course.id,
        titre: course.titre,
        formateurId: course.formateurId,
      });
    }
  }

  // Le formateur est l'utilisateur connecte (claim "sub" du JWT), jamais le corps de la requete
  async create(dto: CreateCourseDto, user: AuthUser) {
    const { chapitres = [], ...data } = dto;
    if (data.statut === StatutCours.PUBLIE && chapitres.length === 0) {
      throw new BadRequestException('Impossible de publier un cours sans chapitre');
    }
    const course = this.repo.create({
      ...data,
      formateurId: user.id,
      chapitres: chapitres.map((c, i) => ({ ...c, ordre: i + 1 })),
    });
    const saved = await this.repo.save(course);
    const created = await this.findOne(saved.id);
    this.emettreChangementStatut(created, null);
    return created;
  }

  async findAll(query: QueryCourseDto, user: AuthUser) {
    const { search, categorie, formateurId, page, limit } = query;
    // Un etudiant ne voit que les cours publies et leurs chapitres visibles
    const etudiant = user.role === Role.ETUDIANT;
    const statut = etudiant ? StatutCours.PUBLIE : query.statut;

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
      const countQb = this.chapters
        .createQueryBuilder('ch')
        .select('ch.coursId', 'coursId')
        .addSelect('COUNT(*)', 'nb')
        .where('ch.coursId IN (:...ids)', { ids: data.map((c) => c.id) })
        .groupBy('ch.coursId');
      if (etudiant) countQb.andWhere('ch.visible = true');
      const counts: { coursId: number; nb: string }[] = await countQb.getRawMany();
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

  // Consultation : pour un etudiant, un cours non publie n'existe pas (404)
  async findOneFor(id: number, user: AuthUser) {
    const course = await this.findOne(id);
    if (user.role === Role.ETUDIANT) {
      if (course.statut !== StatutCours.PUBLIE) throw new NotFoundException(`Cours ${id} introuvable`);
      course.chapitres = course.chapitres.filter((c) => c.visible);
    }
    return course;
  }

  // Modification : un enseignant n'agit que sur ses propres cours (403), un admin sur tous
  async findOwned(id: number, user: AuthUser) {
    const course = await this.findOne(id);
    if (user.role !== Role.ADMIN && course.formateurId !== user.id) {
      throw new ForbiddenException("Vous n'etes pas le formateur de ce cours");
    }
    return course;
  }

  async update(id: number, dto: UpdateCourseDto, user: AuthUser) {
    const course = await this.findOwned(id, user);
    if (dto.statut === StatutCours.PUBLIE && course.chapitres.length === 0) {
      throw new BadRequestException('Impossible de publier un cours sans chapitre');
    }
    if (dto.imageUrl !== undefined && dto.imageUrl !== course.imageUrl) {
      this.supprimerImageLocale(course.imageUrl);
    }
    await this.repo.update(id, dto);
    const updated = await this.findOne(id);
    this.emettreChangementStatut(updated, course.statut);
    return updated;
  }

  async publish(id: number, user: AuthUser) {
    const course = await this.findOwned(id, user);
    if (course.statut === StatutCours.PUBLIE) {
      throw new BadRequestException(`Le cours ${id} est deja publie`);
    }
    if (course.chapitres.length === 0) {
      throw new BadRequestException('Impossible de publier un cours sans chapitre');
    }
    await this.repo.update(id, { statut: StatutCours.PUBLIE });
    const published = await this.findOne(id);
    this.emettreChangementStatut(published, course.statut);
    return published;
  }

  async archive(id: number, user: AuthUser) {
    const course = await this.findOwned(id, user);
    if (course.statut === StatutCours.ARCHIVE) {
      throw new BadRequestException(`Le cours ${id} est deja archive`);
    }
    await this.repo.update(id, { statut: StatutCours.ARCHIVE });
    const archived = await this.findOne(id);
    this.emettreChangementStatut(archived, course.statut);
    return archived;
  }

  async setImage(id: number, user: AuthUser, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier recu (champ "file")');
    const course = await this.findOwned(id, user).catch((e) => {
      supprimerFichier('images', file.filename); // cours inexistant ou interdit : on jette le fichier
      throw e;
    });
    this.supprimerImageLocale(course.imageUrl);
    await this.repo.update(id, { imageUrl: IMAGE_URL_PREFIX + file.filename });
    return this.findOne(id);
  }

  async removeImage(id: number, user: AuthUser) {
    const course = await this.findOwned(id, user);
    this.supprimerImageLocale(course.imageUrl);
    await this.repo.update(id, { imageUrl: null });
    return this.findOne(id);
  }

  async remove(id: number, user: AuthUser) {
    const course = await this.findOwned(id, user);
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
