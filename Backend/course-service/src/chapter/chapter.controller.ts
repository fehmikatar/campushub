import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query,
  StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse, ApiBody, ApiConsumes, ApiCreatedResponse, ApiForbiddenResponse,
  ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation,
  ApiPayloadTooLargeResponse, ApiProduces, ApiTags,
} from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import { ChapterService } from './chapter.service.js';
import { Chapter } from './chapter.entity.js';
import {
  CreateChapterDto, PdfQueryDto, QueryChapterDto, ReorderChaptersDto, UpdateChapterDto,
} from './chapter.dto.js';
import { FILE_BODY_SCHEMA, PDF_TYPES, uploadOptions } from '../common/upload.js';

@ApiTags('Chapters')
@Controller('courses/:coursId/chapters')
export class ChapterController {
  constructor(private readonly service: ChapterService) {}

  @Post()
  @ApiOperation({ summary: 'Ajouter un chapitre (a la fin du parcours)' })
  @ApiCreatedResponse({ type: Chapter })
  @ApiBadRequestResponse({ description: 'Donnees invalides' })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  create(@Param('coursId', ParseIntPipe) coursId: number, @Body() dto: CreateChapterDto) {
    return this.service.create(coursId, dto);
  }

  @Get()
  @ApiOperation({ summary: "Lister les chapitres d'un cours (tries par ordre)" })
  @ApiOkResponse({ type: [Chapter] })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  findAll(@Param('coursId', ParseIntPipe) coursId: number, @Query() query: QueryChapterDto) {
    return this.service.findByCourse(coursId, query.visibleSeulement);
  }

  // Declare avant ':id' pour ne pas etre capture par ParseIntPipe
  @Patch('reorder')
  @ApiOperation({ summary: 'Reordonner les chapitres' })
  @ApiOkResponse({ type: [Chapter] })
  @ApiBadRequestResponse({ description: 'Liste d\'IDs incomplete ou invalide' })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  reorder(@Param('coursId', ParseIntPipe) coursId: number, @Body() dto: ReorderChaptersDto) {
    return this.service.reorder(coursId, dto.ids);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulter un chapitre' })
  @ApiOkResponse({ type: Chapter })
  @ApiNotFoundResponse({ description: 'Chapitre introuvable' })
  findOne(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOne(coursId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifier un chapitre (titre, contenu, visible, telechargement)' })
  @ApiOkResponse({ type: Chapter })
  @ApiBadRequestResponse({ description: 'Donnees invalides' })
  @ApiNotFoundResponse({ description: 'Chapitre introuvable' })
  update(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChapterDto,
  ) {
    return this.service.update(coursId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer un chapitre (les suivants sont renumerotes)' })
  @ApiNoContentResponse({ description: 'Chapitre supprime' })
  @ApiBadRequestResponse({ description: "Dernier chapitre d'un cours publie" })
  @ApiNotFoundResponse({ description: 'Chapitre introuvable' })
  remove(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(coursId, id);
  }

  @Post(':id/pdf')
  @UseInterceptors(FileInterceptor('file', uploadOptions('pdfs', PDF_TYPES, 2)))
  @ApiOperation({ summary: 'Ajouter / remplacer le PDF du chapitre (PDF, 2 Mo max)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY_SCHEMA)
  @ApiCreatedResponse({ type: Chapter })
  @ApiBadRequestResponse({ description: 'Aucun fichier ou pas un PDF' })
  @ApiPayloadTooLargeResponse({ description: 'Fichier > 2 Mo' })
  @ApiNotFoundResponse({ description: 'Chapitre introuvable' })
  uploadPdf(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.setPdf(coursId, id, file);
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
  ) {
    const { chemin, nom } = await this.service.getPdf(coursId, id, query.download);
    const mode = query.download ? 'attachment' : 'inline';
    return new StreamableFile(createReadStream(chemin), {
      type: 'application/pdf',
      disposition: `${mode}; filename*=UTF-8''${encodeURIComponent(nom)}`,
    });
  }

  @Delete(':id/pdf')
  @ApiOperation({ summary: 'Retirer le PDF du chapitre' })
  @ApiOkResponse({ type: Chapter })
  @ApiNotFoundResponse({ description: 'Chapitre introuvable' })
  removePdf(
    @Param('coursId', ParseIntPipe) coursId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.removePdf(coursId, id);
  }
}
