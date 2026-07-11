import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { FacetsModule } from './facets/facets.module';
import { PiModule } from './pi/pi.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';

// Built Vue SPA (apps/web/dist) relative to the compiled API (apps/api/dist).
const webDist = path.resolve(__dirname, '..', '..', 'web', 'dist');
const serveSpa = fs.existsSync(webDist);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '../../../.env'),
    }),
    // In production the API also serves the built SPA (same origin, no CORS).
    // `/api` routes are excluded so they still reach the controllers, and any
    // other path falls back to index.html for client-side routing.
    ...(serveSpa
      ? [
          ServeStaticModule.forRoot({
            rootPath: webDist,
            exclude: ['/api/(.*)'],
          }),
        ]
      : []),
    PrismaModule,
    ProjectsModule,
    FacetsModule,
    PiModule,
    AuthModule,
    AdminModule,
  ],
})
export class AppModule {}
