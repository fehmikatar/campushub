import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse,
  ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation,
  ApiPayloadTooLargeResponse, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CourseService } from './course.service.js';
import { Course } from './course.entity.js';
import {
  CreateCourseDto, PaginatedCoursesDto, QueryCourseDto, UpdateCourseDto,
} from './course.dto.js';
import { CATEGORIES } from './course.enums.js';
import { FILE_BODY_SCHEMA, IMAGE_TYPES, uploadOptions } from '../common/upload.js';
import { CurrentUser, Role, Roles } from '../auth/auth.js';
import type { AuthUser } from '../auth/auth.js';

// Lecture : tout utilisateur connecte. Ecriture : ENSEIGNANT (ses cours) ou ADMIN.
@ApiTags('Courses')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token manquant, invalide ou expire' })
@Controller('courses')
export class CourseController {
  constructor(private readonly service: CourseService) {}

  @Post()
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @ApiOperation({ summary: 'Creer un cours, avec ou sans chapitres (formateur = utilisateur connecte)' })
  @ApiCreatedResponse({ type: Course })
  @ApiBadRequestResponse({ description: 'Donnees invalides ou PUBLIE sans chapitre' })
  @ApiForbiddenResponse({ description: 'Reserve aux enseignants et aux administrateurs' })
  create(@Body() dto: CreateCourseDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les cours (un etudiant ne voit que les cours publies)' })
  @ApiOkResponse({ type: PaginatedCoursesDto })
  @ApiBadRequestResponse({ description: 'Parametres invalides' })
  findAll(@Query() query: QueryCourseDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(query, user);
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
  @ApiNotFoundResponse({ description: 'Cours introuvable (ou non publie pour un etudiant)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.findOneFor(id, user);
  }

  @Put(':id')
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @ApiOperation({ summary: 'Modifier un cours (titre, categorie, description, statut, imageUrl)' })
  @ApiOkResponse({ type: Course })
  @ApiBadRequestResponse({ description: 'Donnees invalides ou PUBLIE sans chapitre' })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/publish')
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @ApiOperation({ summary: 'Publier un cours (au moins 1 chapitre requis)' })
  @ApiOkResponse({ type: Course })
  @ApiBadRequestResponse({ description: 'Deja publie ou aucun chapitre' })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.publish(id, user);
  }

  @Patch(':id/archive')
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @ApiOperation({ summary: 'Archiver un cours' })
  @ApiOkResponse({ type: Course })
  @ApiBadRequestResponse({ description: 'Deja archive' })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  archive(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.archive(id, user);
  }

  @Post(':id/image')
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', uploadOptions('images', IMAGE_TYPES, 1)))
  @ApiOperation({ summary: 'Uploader l\'image de couverture (JPG, PNG ou WebP, 1 Mo max)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY_SCHEMA)
  @ApiCreatedResponse({ type: Course })
  @ApiBadRequestResponse({ description: 'Aucun fichier ou type non autorise' })
  @ApiPayloadTooLargeResponse({ description: 'Fichier > 1 Mo' })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setImage(id, user, file);
  }

  @Delete(':id/image')
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @ApiOperation({ summary: 'Retirer l\'image (retour a l\'image par defaut)' })
  @ApiOkResponse({ type: Course })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  removeImage(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.removeImage(id, user);
  }

  @Delete(':id')
  @Roles(Role.ENSEIGNANT, Role.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer un cours (et ses chapitres et fichiers)' })
  @ApiNoContentResponse({ description: 'Cours supprime' })
  @ApiForbiddenResponse({ description: "Role insuffisant ou cours d'un autre enseignant" })
  @ApiNotFoundResponse({ description: 'Cours introuvable' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
