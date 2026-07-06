import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PiService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q?: string, limit = 50) {
    const pis = await this.prisma.principalInvestigator.findMany({
      where: q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
            ],
          }
        : undefined,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: limit,
      include: { _count: { select: { projects: true } } },
    });
    return pis.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      orgCenter: p.orgCenter,
      label: `${p.lastName}, ${p.firstName}`,
      projectCount: p._count.projects,
    }));
  }
}
