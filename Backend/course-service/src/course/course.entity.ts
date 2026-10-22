import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Chapter } from '../chapter/chapter.entity.js';
import { StatutCours } from './course.enums.js';

// Diagramme de classes : Cours { id, titre, description, formateurId }
@Entity('cours')
export class Course {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'Introduction aux microservices' })
  @Column({ length: 150 })
  titre: string;

  @ApiPropertyOptional({ example: 'Principes, API Gateway, Eureka...' })
  @Column({ type: 'text', nullable: true })
  description: string;

  @ApiPropertyOptional({ example: 'Developpement Web' })
  @Column({ length: 50, nullable: true })
  categorie: string;

  @ApiProperty({ enum: StatutCours, example: StatutCours.BROUILLON })
  @Column({ type: 'enum', enum: StatutCours, default: StatutCours.BROUILLON })
  statut: StatutCours;

  // URL externe (https://...) ou image uploadee (/uploads/images/...). null = image par defaut.
  @ApiPropertyOptional({ example: '/uploads/images/3f2a...e1.png', nullable: true })
  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  // Reference vers Utilisateur (User Service). Pas de cle etrangere : bases separees.
  @ApiProperty({ example: 1 })
  @Column()
  formateurId: number;

  @ApiProperty()
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;

  // Relation<> evite l'erreur d'import circulaire en ESM (Course <-> Chapter)
  // cascade insert : POST /courses peut creer le cours et ses chapitres en une fois
  @ApiPropertyOptional({ type: () => [Chapter] })
  @OneToMany(() => Chapter, (chapter) => chapter.cours, { cascade: ['insert'] })
  chapitres: Relation<Chapter>[];

  // Calcule dans la liste (GET /courses), pas stocke en base
  @ApiPropertyOptional({ example: 3 })
  nbChapitres?: number;
}
