import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ProjectsService } from './projects.service';
import { SearchQueryDto } from './dto/search-query.dto';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  search(@Query() query: SearchQueryDto) {
    return this.projects.search(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projects.findOne(id);
  }

  /**
   * Same-origin proxy for a project's quad-chart PDF. NASA serves the file with
   * `X-Frame-Options: SAMEORIGIN`, which blocks embedding it directly in our
   * iframe; streaming it through our API (which sets no frame restrictions)
   * makes it embeddable and also sidesteps cross-origin fetch issues.
   */
  @Get(':id/quad-chart')
  async quadChart(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const project = await this.projects.findOne(id);
    if (!project.quadChartUrl) throw new NotFoundException('No quad chart for this project');

    const upstream = await fetch(project.quadChartUrl);
    if (!upstream.ok || !upstream.body) {
      throw new NotFoundException('Quad chart is not available upstream');
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="quad-chart.pdf"');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  }
}
