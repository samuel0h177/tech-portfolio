import { Module } from '@nestjs/common';
import { FacetsController } from './facets.controller';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  controllers: [FacetsController],
})
export class FacetsModule {}
