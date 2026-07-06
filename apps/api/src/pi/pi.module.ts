import { Module } from '@nestjs/common';
import { PiController } from './pi.controller';
import { PiService } from './pi.service';

@Module({
  controllers: [PiController],
  providers: [PiService],
})
export class PiModule {}
