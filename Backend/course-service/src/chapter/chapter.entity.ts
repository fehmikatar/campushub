import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { ApiHideProperty, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Course } from '../course/course.entity.js';

// Diagramme de classes : Chapitre { id, titre, contenu : Text, coursId }
@Entity('chapitres')
export class Chapter {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'Chapitre 1 : API Gateway' })
  @Column({ length: 150 })
  titre: string;

  @ApiPropertyOptional({ example: 'Contenu du chapitre (texte, markdown, lien...)', nullable: true })
  @Column({ type: 'text', nullable: true })
  contenu: string | null;

  // Position dans le parcours (1, 2, 3...)
  @ApiProperty({ example: 1 })
  @Column({ default: 1 })
  ordre: number;

  // "Visible par les etudiants" : masque par defaut
  @ApiProperty({ example: false })
  @Column({ default: false })
  visible: boolean;

  // "Autoriser le telechargement" du PDF
  @ApiProperty({ example: true })
  @Column({ default: true })
  telechargementAutorise: boolean;

  // Nom du fichier stocke dans uploads/pdfs (interne)
  @ApiHideProperty()
  @Column({ type: 'varchar', nullable: true })
  pdfFichier: string | null;

  @ApiPropertyOptional({ example: 'support-cours.pdf', nullable: true })
  @Column({ type: 'varchar', nullable: true })
  pdfNom: string | null;

  @ApiPropertyOptional({ example: 524288, description: 'Taille en octets', nullable: true })
  @Column({ type: 'int', nullable: true })
  pdfTaille: number | null;

  @ApiProperty({ example: 1 })
  @Column()
  coursId: number;

  @ApiProperty()
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;

  // Relation<> evite l'erreur d'import circulaire en ESM (Course <-> Chapter)
  @ApiHideProperty()
  @ManyToOne(() => Course, (course) => course.chapitres, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coursId' })
  cours: Relation<Course>;
}
