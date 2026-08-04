import { Body, Controller, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AssistantService } from './assistant.service';
import { ChatRequestDto } from './dto/chat.dto';

@Controller('assistant')
export class AssistantController {
  private readonly logger = new Logger(AssistantController.name);

  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  async chat(@Body() body: ChatRequestDto, @Req() req: Request) {
    const last = body.messages?.[body.messages.length - 1];
    this.logger.log(
      `POST /assistant/chat from ${req.ip} messages=${body.messages?.length ?? 0}` +
        ` lastRole=${last?.role ?? '-'} preview="${(last?.content ?? '').slice(0, 80)}"`,
    );
    const started = Date.now();
    try {
      const result = await this.assistant.chat(body);
      this.logger.log(
        `chat ok in ${Date.now() - started}ms actions=${result.actions.length}` +
          ` replyChars=${result.message.length}`,
      );
      return result;
    } catch (err) {
      this.logger.error(
        `chat failed in ${Date.now() - started}ms: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }
}
