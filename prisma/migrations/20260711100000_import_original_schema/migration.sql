-- DropForeignKey
ALTER TABLE `projects` DROP FOREIGN KEY `projects_pi_id_fkey`;

-- Null out primary-PI references before the investigators table is rebuilt.
-- The ETL importer (prisma/import.ts) repopulates pi_id from the source database.
UPDATE `projects` SET `pi_id` = NULL;

-- DropIndex
DROP INDEX `projects_project_code_source_internal_id_key` ON `projects`;

-- DropIndex
DROP INDEX `tech_categories_legacy_gen_id_legacy_sub_id_key` ON `tech_categories`;

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `source_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `projects` ADD COLUMN `budget_code` VARCHAR(191) NULL,
    ADD COLUMN `project_abbrev` VARCHAR(191) NULL,
    ADD COLUMN `year_valid` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `tech_categories` DROP COLUMN `legacy_gen_id`,
    DROP COLUMN `legacy_sub_id`,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `disp_order` INTEGER NULL,
    ADD COLUMN `source_id` INTEGER NULL;

-- DropTable
DROP TABLE `principal_investigators`;

-- CreateTable
CREATE TABLE `investigators` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source_id` INTEGER NULL,
    `first_name` VARCHAR(191) NOT NULL,
    `middle_name` VARCHAR(191) NULL,
    `last_name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `org_center` VARCHAR(191) NULL,

    UNIQUE INDEX `investigators_source_id_key`(`source_id`),
    INDEX `investigators_last_name_first_name_idx`(`last_name`, `first_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_investigators` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source_xref_id` INTEGER NULL,
    `project_id` INTEGER NOT NULL,
    `investigator_id` INTEGER NOT NULL,
    `role` ENUM('PRINCIPAL', 'CO_INVESTIGATOR') NOT NULL DEFAULT 'PRINCIPAL',
    `organization_id` INTEGER NULL,

    UNIQUE INDEX `project_investigators_source_xref_id_key`(`source_xref_id`),
    INDEX `project_investigators_project_id_idx`(`project_id`),
    INDEX `project_investigators_investigator_id_idx`(`investigator_id`),
    INDEX `project_investigators_organization_id_idx`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `organizations_source_id_key` ON `organizations`(`source_id`);

-- CreateIndex
CREATE UNIQUE INDEX `projects_source_internal_id_key` ON `projects`(`source_internal_id`);

-- CreateIndex
CREATE UNIQUE INDEX `tech_categories_source_id_key` ON `tech_categories`(`source_id`);

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_pi_id_fkey` FOREIGN KEY (`pi_id`) REFERENCES `investigators`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_investigators` ADD CONSTRAINT `project_investigators_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_investigators` ADD CONSTRAINT `project_investigators_investigator_id_fkey` FOREIGN KEY (`investigator_id`) REFERENCES `investigators`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_investigators` ADD CONSTRAINT `project_investigators_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
