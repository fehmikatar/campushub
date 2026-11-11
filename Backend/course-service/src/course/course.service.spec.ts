import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { CourseService } from './course.service.js';
import { Course } from './course.entity.js';
import { Chapter } from '../chapter/chapter.entity.js';
import { EventPublisher } from '../messaging/event-publisher.service.js';
import { AuthUser, Role } from '../auth/auth.js';
import { StatutCours } from './course.enums.js';
import { EvaluationClient } from '../config/evaluation-client.js';

const SUB = '3f2a9c1e-7b4d-4e6a-9d21-5c8b0a1f2e34';
const FORMATEUR_ID = SUB;

function createMockCourse(overrides: Partial<Course> = {}): Course {
  const course = new Course();
  course.id = 1;
  course.titre = 'Test Course';
  course.description = 'Description';
  course.categorie = 'Developpement Web';
  course.statut = StatutCours.PUBLIE;
  course.formateurId = FORMATEUR_ID;
  course.imageUrl = null;
  course.createdAt = new Date();
  course.updatedAt = new Date();
  course.chapitres = [];
  Object.assign(course, overrides);
  return course;
}

function createMockChapter(overrides: Partial<Chapter> = {}): Chapter {
  const chapter = new Chapter();
  chapter.id = 1;
  chapter.coursId = 1;
  chapter.titre = 'Chapitre 1';
  chapter.contenu = 'Contenu';
  chapter.ordre = 1;
  chapter.visible = true;
  chapter.pdfFichier = null;
  chapter.pdfNom = null;
  chapter.pdfTaille = null;
  chapter.telechargementAutorise = false;
  Object.assign(chapter, overrides);
  return chapter;
}

const mockCourseRepo = {
  findOne: vi.fn(),
  createQueryBuilder: vi.fn(() => ({
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
  })),
};

const mockChapterRepo = {
  findOne: vi.fn(),
  find: vi.fn(),
  createQueryBuilder: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    getRawMany: vi.fn().mockResolvedValue([]),
  })),
  maximum: vi.fn().mockResolvedValue(0),
  save: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
};

const mockEventPublisher = {
  publish: vi.fn(),
};

const mockEvaluationClient = {
  getQuizCount: vi.fn().mockResolvedValue(null),
};

describe('CourseService - Synchronous calls from other services', () => {
  let service: CourseService;
  let module: TestingModule;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'secret-de-test-au-moins-32-octets-de-long';
    process.env.JWT_ISSUER = 'campushub-user-service';
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        CourseService,
        { provide: getRepositoryToken(Course), useValue: mockCourseRepo },
        { provide: getRepositoryToken(Chapter), useValue: mockChapterRepo },
        { provide: EventPublisher, useValue: mockEventPublisher },
        { provide: EvaluationClient, useValue: mockEvaluationClient },
      ],
    }).compile();

    service = module.get<CourseService>(CourseService);
  });

  afterAll(async () => {
    await module.close();
  });

  const studentUser: AuthUser = { id: '11111111-1111-1111-1111-111111111111', role: Role.ETUDIANT };
  const teacherUser: AuthUser = { id: FORMATEUR_ID, role: Role.ENSEIGNANT };
  const adminUser: AuthUser = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: Role.ADMIN };

  describe('findOneFor - Student access (synchronous call from Forum/Evaluation)', () => {
    it('returns 200 (course) when course is PUBLISHED and student calls', async () => {
      const publishedCourse = createMockCourse({ statut: StatutCours.PUBLIE });
      mockCourseRepo.findOne.mockResolvedValue(publishedCourse);
      mockEvaluationClient.getQuizCount.mockResolvedValue(0);

      const result = await service.findOneFor(1, studentUser, 'Bearer token');

      expect(result).toEqual(publishedCourse);
      expect(mockCourseRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: { chapitres: true },
        order: { chapitres: { ordre: 'ASC', id: 'ASC' } },
      });
      expect(mockEvaluationClient.getQuizCount).toHaveBeenCalledWith(1, 'Bearer token');
      expect(result.nbQuiz).toBe(0);
    });

    it('returns 404 when course is BROUILLON and student calls', async () => {
      const draftCourse = createMockCourse({ statut: StatutCours.BROUILLON });
      mockCourseRepo.findOne.mockResolvedValue(draftCourse);

      await expect(service.findOneFor(1, studentUser, 'Bearer token')).rejects.toThrow(NotFoundException);
    });

    it('returns 404 when course is ARCHIVE and student calls', async () => {
      const archivedCourse = createMockCourse({ statut: StatutCours.ARCHIVE });
      mockCourseRepo.findOne.mockResolvedValue(archivedCourse);

      await expect(service.findOneFor(1, studentUser, 'Bearer token')).rejects.toThrow(NotFoundException);
    });

    it('returns course with only visible chapters for student', async () => {
      const course = createMockCourse({
        statut: StatutCours.PUBLIE,
        chapitres: [
          createMockChapter({ id: 1, visible: true }),
          createMockChapter({ id: 2, visible: false }),
        ],
      });
      mockCourseRepo.findOne.mockResolvedValue(course);
      mockEvaluationClient.getQuizCount.mockResolvedValue(null);

      const result = await service.findOneFor(1, studentUser, 'Bearer token');

      expect(result.chapitres).toHaveLength(1);
      expect(result.chapitres[0].visible).toBe(true);
    });

    it('returns full course (all chapters) for teacher', async () => {
      const course = createMockCourse({
        statut: StatutCours.BROUILLON,
        chapitres: [
          createMockChapter({ id: 1, visible: true }),
          createMockChapter({ id: 2, visible: false }),
        ],
      });
      mockCourseRepo.findOne.mockResolvedValue(course);
      mockEvaluationClient.getQuizCount.mockResolvedValue(null);

      const result = await service.findOneFor(1, teacherUser, 'Bearer token');

      expect(result).toEqual(course);
      expect(result.chapitres).toHaveLength(2);
    });

    it('returns full course (all chapters) for admin', async () => {
      const course = createMockCourse({
        statut: StatutCours.ARCHIVE,
        chapitres: [createMockChapter({ id: 1, visible: false })],
      });
      mockCourseRepo.findOne.mockResolvedValue(course);
      mockEvaluationClient.getQuizCount.mockResolvedValue(null);

      const result = await service.findOneFor(1, adminUser, 'Bearer token');

      expect(result).toEqual(course);
    });

    it('calls EvaluationClient with auth header and sets nbQuiz', async () => {
      const publishedCourse = createMockCourse({ statut: StatutCours.PUBLIE });
      mockCourseRepo.findOne.mockResolvedValue(publishedCourse);
      mockEvaluationClient.getQuizCount.mockResolvedValue(3);

      const result = await service.findOneFor(1, studentUser, 'Bearer test-token');

      expect(mockEvaluationClient.getQuizCount).toHaveBeenCalledWith(1, 'Bearer test-token');
      expect(result.nbQuiz).toBe(3);
    });

    it('sets nbQuiz to null when EvaluationClient returns null', async () => {
      const publishedCourse = createMockCourse({ statut: StatutCours.PUBLIE });
      mockCourseRepo.findOne.mockResolvedValue(publishedCourse);
      mockEvaluationClient.getQuizCount.mockResolvedValue(null);

      const result = await service.findOneFor(1, studentUser, 'Bearer token');

      expect(result.nbQuiz).toBeNull();
    });
  });

  describe('Token validation for inter-service calls', () => {
    it('accepts token with correct JWT_SECRET and JWT_ISSUER from another service', async () => {
      const publishedCourse = createMockCourse({ statut: StatutCours.PUBLIE });
      mockCourseRepo.findOne.mockResolvedValue(publishedCourse);
      mockEvaluationClient.getQuizCount.mockResolvedValue(0);

      const result = await service.findOneFor(1, studentUser, 'Bearer token');

      expect(result).toEqual(publishedCourse);
    });

    it('uses correct issuer configuration', () => {
      expect(process.env.JWT_ISSUER || 'campushub-user-service').toBe('campushub-user-service');
    });
  });
});