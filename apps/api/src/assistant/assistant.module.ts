import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [ProjectsModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
