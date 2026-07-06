import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'node:path';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { FacetsModule } from './facets/facets.module';
import { PiModule } from './pi/pi.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '../../../.env'),
    }),
    PrismaModule,
    ProjectsModule,
    FacetsModule,
    PiModule,
    AuthModule,
    AdminModule,
  ],
})
export class AppModule {}
