-- AlterTable
ALTER TABLE `organizations` DROP COLUMN `legacy_id`,
    MODIFY `type` ENUM('ACADEMIA', 'INDUSTRY', 'NASA_CENTER', 'FEDERAL_LAB') NULL;

-- CreateIndex
CREATE INDEX `organizations_type_idx` ON `organizations`(`type`);
