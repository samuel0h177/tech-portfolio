import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

/** Legacy tech-category tree reverse-engineered from the live TechPortfolio search form. */
const CATEGORY_TREE: Array<{
  name: string;
  genId: number;
  children?: Array<{ name: string; subId: number }>;
}> = [
  {
    name: 'Sensors',
    genId: 1,
    children: [
      { name: 'Active Microwave', subId: 5 },
      { name: 'Passive Microwave', subId: 6 },
      { name: 'Active Optical', subId: 7 },
      { name: 'Passive Optical', subId: 8 },
      { name: 'Other', subId: 15 },
    ],
  },
  {
    name: 'Information Systems',
    genId: 5,
    children: [
      { name: 'Data and Information Production', subId: 9 },
      { name: 'Data Collection and Handling', subId: 10 },
      { name: 'Search, Access, Analysis and Display', subId: 11 },
      { name: 'Systems Management', subId: 12 },
      { name: 'Transmission and Dissemination', subId: 13 },
    ],
  },
  { name: 'Platforms', genId: 2 },
  { name: 'Computational Technology', genId: 3 },
  { name: 'FireSense Technology', genId: 7 },
  { name: 'Flight Validation', genId: 6 },
];

async function seedCategories() {
  for (const parent of CATEGORY_TREE) {
    const parentRow = await prisma.techCategory.upsert({
      where: { legacy_category: { legacyGenId: parent.genId, legacySubId: 0 } },
      update: { name: parent.name },
      create: { name: parent.name, legacyGenId: parent.genId, legacySubId: 0 },
    });

    for (const child of parent.children ?? []) {
      await prisma.techCategory.upsert({
        where: { legacy_category: { legacyGenId: parent.genId, legacySubId: child.subId } },
        update: { name: child.name, parentId: parentRow.id },
        create: {
          name: child.name,
          legacyGenId: parent.genId,
          legacySubId: child.subId,
          parentId: parentRow.id,
        },
      });
    }
  }
  console.log('Seeded tech categories.');
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@esto.local';
  const password = process.env.ADMIN_PASSWORD ?? 'changeme123';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, role: 'admin' },
  });
  console.log(`Seeded admin user: ${email}`);
}

async function main() {
  await seedCategories();
  await seedAdmin();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
