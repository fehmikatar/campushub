import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from './course.entity.js';
import { Chapter } from '../chapter/chapter.entity.js';
import { CourseService } from './course.service.js';
import { CourseController } from './course.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Course, Chapter])],
  providers: [CourseService],
  controllers: [CourseController],
  exports: [CourseService],
})
export class CourseModule {}
