import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse, ApiBody, ApiConsumes, ApiCreatedResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiPayloadTooLargeResponse, ApiTags,
} from '@nestjs/swagger';
import { CourseService } from './course.service.js';
import { Course } from './course.entity.js';
import {
  CreateCourseDto, PaginatedCoursesDto, QueryCourseDto, UpdateCourseDto,
} from './course.dto.js';
import { CATEGORIES } from './course.enums.js';
import { FILE_BODY_SCHEMA, IMAGE_TYPES, uploadOptions } from '../common/upload.js';

@ApiTags('Courses')
@Controller('courses')
export class CourseController {
  constructor(private readonly service: CourseService) {}

  @Post()
  @ApiOperation({ summary: 'Creer un cours (Formateur), avec ou sans chapitres' })
  @ApiCreatedResponse({ type: Course })
  @ApiBadRequestResponse({ description: 'Donnees invalides ou PUBLIE sans chapitre' })
  create(@Body() dto: CreateCourseDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les cours (recherche, filtres, pagination)' })
  @ApiOkResponse({ type: PaginatedCoursesDto })
  @ApiBadRequestResponse({ description: 'Parametres invalides' })
  findAll(@Query() query: QueryCourseDto) {
    return this.service.findAll(query);
  }

  // Declare avant ':id' pour ne pas etre capture par ParseIntPipe
  @Get('categories')
  @ApiOperation({ summary: 'Liste des categories (select du formulaire)' })
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'string' }, example: CATEGORIES } })
  categories() {
    return CATEGORIES;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulter un cours avec ses chapitres' })
  @ApiOkResponse({ type: Course })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifier un cours (titre, categorie, description, statut, imageUrl)' })
  @ApiOkResponse({ type: Course })
  @ApiBadRequestResponse({ description: 'Donnees invalides ou PUBLIE sans chapitre' })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCourseDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publier un cours (au moins 1 chapitre requis)' })
  @ApiOkResponse({ type: Course })
  @ApiBadRequestResponse({ description: 'Deja publie ou aucun chapitre' })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.service.publish(id);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archiver un cours' })
  @ApiOkResponse({ type: Course })
  @ApiBadRequestResponse({ description: 'Deja archive' })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.service.archive(id);
  }

  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file', uploadOptions('images', IMAGE_TYPES, 1)))
  @ApiOperation({ summary: 'Uploader l\'image de couverture (JPG, PNG ou WebP, 1 Mo max)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY_SCHEMA)
  @ApiCreatedResponse({ type: Course })
  @ApiBadRequestResponse({ description: 'Aucun fichier ou type non autorise' })
  @ApiPayloadTooLargeResponse({ description: 'Fichier > 1 Mo' })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  uploadImage(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File) {
    return this.service.setImage(id, file);
  }

  @Delete(':id/image')
  @ApiOperation({ summary: 'Retirer l\'image (retour a l\'image par defaut)' })
  @ApiOkResponse({ type: Course })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  removeImage(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeImage(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer un cours (et ses chapitres et fichiers)' })
  @ApiNoContentResponse({ description: 'Cours supprime' })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
