import {
  Body,
  Controller,
  HttpException,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AssistantService } from './assistant.service';
import { ChatRequestDto, type AssistantStreamEvent } from './dto/chat.dto';

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

  /** SSE stream of status / thinking / tool steps, then final message. */
  @Post('chat/stream')
  async chatStream(
    @Body() body: ChatRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const last = body.messages?.[body.messages.length - 1];
    this.logger.log(
      `POST /assistant/chat/stream from ${req.ip} messages=${body.messages?.length ?? 0}` +
        ` preview="${(last?.content ?? '').slice(0, 80)}"`,
    );
    const started = Date.now();

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const write = (event: AssistantStreamEvent) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this.assistant.chat(body, write);
      this.logger.log(`chat/stream ok in ${Date.now() - started}ms`);
    } catch (err) {
      const message = this.httpErrorMessage(err);
      this.logger.error(`chat/stream failed in ${Date.now() - started}ms: ${message}`);
      write({ type: 'error', message });
      write({ type: 'done' });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  private httpErrorMessage(err: unknown): string {
    if (err instanceof HttpException) {
      const body = err.getResponse();
      if (typeof body === 'string') return body;
      if (body && typeof body === 'object' && 'message' in body) {
        const msg = (body as { message: string | string[] }).message;
        return Array.isArray(msg) ? msg.join(', ') : String(msg);
      }
      return err.message;
    }
    return err instanceof Error ? err.message : String(err);
  }
}
