import { Controller, Get, Query } from '@nestjs/common';
import { ProjectsService } from '../projects/projects.service';
import { SearchQueryDto } from '../projects/dto/search-query.dto';

@Controller('facets')
export class FacetsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  facets(@Query() query: SearchQueryDto) {
    return this.projects.facets(query);
  }
}
