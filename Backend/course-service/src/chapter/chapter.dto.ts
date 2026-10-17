import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString,
  MaxLength,
} from 'class-validator';

// L'ordre n'est pas saisi : un nouveau chapitre est ajoute a la fin
// (on reordonne ensuite avec PATCH /courses/{coursId}/chapters/reorder).
export class CreateChapterDto {
  @ApiProperty({ example: 'Chapitre 1 : API Gateway', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  titre: string;

  @ApiPropertyOptional({ example: 'Contenu du chapitre (texte, markdown, lien...)' })
  @IsOptional()
  @IsString()
  contenu?: string;

  @ApiPropertyOptional({ default: false, description: 'Visible par les etudiants' })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Autoriser le telechargement du PDF' })
  @IsOptional()
  @IsBoolean()
  telechargementAutorise?: boolean;
}

export class UpdateChapterDto extends PartialType(CreateChapterDto) {}

export class ReorderChaptersDto {
  @ApiProperty({
    example: [3, 1, 2],
    description: 'Tous les IDs des chapitres du cours, dans le nouvel ordre',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  ids: number[];
}

const toBool = ({ value }: { value: unknown }) => value === true || value === 'true';

export class QueryChapterDto {
  @ApiPropertyOptional({ description: 'true = uniquement les chapitres visibles (vue etudiant)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  visibleSeulement?: boolean;
}

export class PdfQueryDto {
  @ApiPropertyOptional({ description: 'true = telecharger (sinon affichage dans le navigateur)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  download?: boolean;
}
