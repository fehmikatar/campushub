import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { UPLOAD_ROOT } from './common/upload.js';
import { registerWithEureka } from './config/eureka.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Meme secret que le User Service (HS256) : sans lui, aucun token ne peut etre verifie
  if (Buffer.byteLength(process.env.JWT_SECRET ?? '', 'utf8') < 32) {
    throw new Error('JWT_SECRET est absent ou trop court (minimum 32 octets) : voir .env.example');
  }
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // Images de couverture accessibles publiquement. Les PDF passent par
  // GET /courses/:coursId/chapters/:id/pdf (controle "telechargement autorise").
  app.useStaticAssets(join(UPLOAD_ROOT, 'images'), { prefix: '/uploads/images/' });

  const config = new DocumentBuilder()
    .setTitle('CampusHub - Course Service')
    .setDescription('Gestion des cours, des chapitres, des images de couverture et des PDF')
    .setVersion('1.0')
    .addBearerAuth() // bouton "Authorize" : coller le JWT du User Service
    .build();
  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT || 8082;
  await app.listen(port);
  if (process.env.EUREKA_ENABLED !== 'false') registerWithEureka(port);
  console.log(`Course Service : http://localhost:${port}`);
  console.log(`Swagger        : http://localhost:${port}/api`);
}
await bootstrap();
