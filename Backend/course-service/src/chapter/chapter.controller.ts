import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query,
  StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse,
  ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation,
  ApiPayloadTooLargeResponse, ApiProduces, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import { ChapterService } from './chapter.service.js';
import { Chapter } from './chapter.entity.js';
import {
  CreateChapterDto, PdfQueryDto, QueryChapterDto, ReorderChaptersDto, UpdateChapterDto,
} from './chapter.dto.js';
import { FILE_BODY_SCHEMA, PDF_TYPES, uploadOptions } from '../common/upload.js';
import { CurrentUser, Role, Roles } from '../auth/auth.js';
import type { AuthUser } from '../auth/auth.js';

// Lecture : tout utilisateur connecte. Ecriture : ENSEIGNANT (ses cours) ou ADMIN.
@ApiTags('Chapters')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token manquant, invalide ou expire' })
@Controller('courses/:coursId/chapters')
export class ChapterController {
  constructor(private readonly service: ChapterService) {}

  @Post()
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @ApiOperation({ summary: 'Ajouter un chapitre (a la fin du parcours)' })
  @ApiCreatedResponse({ type: Chapter })
  @ApiBadRequestResponse({ description: 'Donnees invalides' })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  create(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Body() dto: CreateChapterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(coursId, dto, user);
  }

  @Get()
  @ApiOperation({ summary: "Lister les chapitres d'un cours (un etudiant ne voit que les visibles)" })
  @ApiOkResponse({ type: [Chapter] })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  findAll(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Query() query: QueryChapterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findByCourse(coursId, user, query.visibleSeulement);
  }

  // Declare avant ':id' pour ne pas etre capture par ParseIntPipe
  @Patch('reorder')
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @ApiOperation({ summary: 'Reordonner les chapitres' })
  @ApiOkResponse({ type: [Chapter] })
  @ApiBadRequestResponse({ description: 'Liste d\'IDs incomplete ou invalide' })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  reorder(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Body() dto: ReorderChaptersDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reorder(coursId, dto.ids, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulter un chapitre' })
  @ApiOkResponse({ type: Chapter })
  @ApiNotFoundResponse({ description: 'Chapitre introuvable (ou masque pour un etudiant)' })
  findOne(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOneFor(coursId, id, user);
  }

  @Put(':id')
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @ApiOperation({ summary: 'Modifier un chapitre (titre, contenu, visible, telechargement)' })
  @ApiOkResponse({ type: Chapter })
  @ApiBadRequestResponse({ description: 'Donnees invalides' })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Chapitre introuvable' })
  update(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChapterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(coursId, id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer un chapitre (les suivants sont renumerotes)' })
  @ApiNoContentResponse({ description: 'Chapitre supprime' })
  @ApiBadRequestResponse({ description: "Dernier chapitre d'un cours publie" })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Chapitre introuvable' })
  remove(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(coursId, id, user);
  }

  @Post(':id/pdf')
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', uploadOptions('pdfs', PDF_TYPES, 20)))
  @ApiOperation({ summary: 'Ajouter / remplacer le PDF du chapitre (PDF, 20 Mo max)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY_SCHEMA)
  @ApiCreatedResponse({ type: Chapter })
  @ApiBadRequestResponse({ description: 'Aucun fichier ou pas un PDF' })
  @ApiPayloadTooLargeResponse({ description: 'Fichier > 20 Mo' })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Chapitre introuvable' })
  uploadPdf(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setPdf(coursId, id, user, file);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Lire (ou telecharger avec download=true) le PDF du chapitre' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Le fichier PDF' })
  @ApiForbiddenResponse({ description: 'Telechargement non autorise' })
  @ApiNotFoundResponse({ description: 'Chapitre ou PDF introuvable' })
  async getPdf(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PdfQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const { chemin, nom } = await this.service.getPdf(coursId, id, user, query.download);
    const mode = query.download ? 'attachment' : 'inline';
    return new StreamableFile(createReadStream(chemin), {
      type: 'application/pdf',
      disposition: `${mode}; filename*=UTF-8''${encodeURIComponent(nom)}`,
    });
  }

  @Delete(':id/pdf')
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @ApiOperation({ summary: 'Retirer le PDF du chapitre' })
  @ApiOkResponse({ type: Chapter })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Chapitre introuvable' })
  removePdf(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removePdf(coursId, id, user);
  }
}
