import {
  ApiProperty, ApiPropertyOptional, OmitType, PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl,
  IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Course } from './course.entity.js';
import { CATEGORIES, StatutCours } from './course.enums.js';
import { CreateChapterDto } from '../chapter/chapter.dto.js';

export class CreateCourseDto {
  @ApiProperty({ example: 'Introduction aux microservices', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  titre: string;

  @ApiPropertyOptional({ example: 'Developpement Web', enum: CATEGORIES })
  @IsOptional()
  @IsIn(CATEGORIES)
  categorie?: string;

  @ApiPropertyOptional({ example: 'Principes, API Gateway, Eureka...', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: StatutCours, default: StatutCours.BROUILLON })
  @IsOptional()
  @IsEnum(StatutCours)
  statut?: StatutCours;

  @ApiPropertyOptional({
    example: 'https://exemple.com/image.png',
    description: "URL d'une image (bouton Utiliser). Pour un fichier : POST /courses/{id}/image",
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  imageUrl?: string;

  @ApiProperty({
    example: '3f2a9c1e-7b4d-4e6a-9d21-5c8b0a1f2e34',
    description: 'UUID du formateur (User Service)',
  })
  @IsUUID()
  formateurId: string;

  @ApiPropertyOptional({
    type: () => [CreateChapterDto],
    description: "Chapitres crees avec le cours, dans l'ordre du tableau",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateChapterDto)
  chapitres?: CreateChapterDto[];
}

// Le formateur proprietaire ne change pas ; les chapitres ont leurs propres routes.
export class UpdateCourseDto extends PartialType(
  OmitType(CreateCourseDto, ['formateurId', 'chapitres'] as const),
) {}

export class QueryCourseDto {
  @ApiPropertyOptional({ description: 'Recherche dans le titre et la description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsOptional()
  @IsIn(CATEGORIES)
  categorie?: string;

  @ApiPropertyOptional({ enum: StatutCours })
  @IsOptional()
  @IsEnum(StatutCours)
  statut?: StatutCours;

  @ApiPropertyOptional({
    example: '3f2a9c1e-7b4d-4e6a-9d21-5c8b0a1f2e34',
    description: 'Mes cours (UUID du formateur)',
  })
  @IsOptional()
  @IsUUID()
  formateurId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}

export class PaginatedCoursesDto {
  @ApiProperty({ type: () => [Course] })
  data: Course[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;
}
