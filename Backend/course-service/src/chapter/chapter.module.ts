import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from './chapter.entity.js';
import { ChapterService } from './chapter.service.js';
import { ChapterController } from './chapter.controller.js';
import { CourseModule } from '../course/course.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Chapter]), CourseModule],
  providers: [ChapterService],
  controllers: [ChapterController],
})
export class ChapterModule {}
