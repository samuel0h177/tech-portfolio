import { Controller, Get, Query } from '@nestjs/common';
import { PiService } from './pi.service';

@Controller('pi')
export class PiController {
  constructor(private readonly pi: PiService) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.pi.list(q);
  }
}
