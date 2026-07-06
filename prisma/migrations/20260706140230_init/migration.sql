-- CreateTable
CREATE TABLE `principal_investigators` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `first_name` VARCHAR(191) NOT NULL,
    `last_name` VARCHAR(191) NOT NULL,
    `org_center` VARCHAR(191) NULL,

    INDEX `principal_investigators_last_name_first_name_idx`(`last_name`, `first_name`),
    UNIQUE INDEX `principal_investigators_first_name_last_name_org_center_key`(`first_name`, `last_name`, `org_center`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('ACADEMIA', 'INDUSTRY', 'NASA_CENTER', 'FEDERAL_LAB') NOT NULL,
    `legacy_id` INTEGER NULL,

    UNIQUE INDEX `organizations_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tech_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `legacy_gen_id` INTEGER NULL,
    `legacy_sub_id` INTEGER NULL,
    `parent_id` INTEGER NULL,

    INDEX `tech_categories_parent_id_idx`(`parent_id`),
    UNIQUE INDEX `tech_categories_legacy_gen_id_legacy_sub_id_key`(`legacy_gen_id`, `legacy_sub_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source_internal_id` INTEGER NULL,
    `program_flag` ENUM('ESTO', 'OTHER') NOT NULL,
    `project_code` VARCHAR(191) NULL,
    `title` TEXT NOT NULL,
    `abstract` TEXT NULL,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `status_text` VARCHAR(191) NULL,
    `completion_fy` INTEGER NULL,
    `trl_in` INTEGER NULL,
    `trl_current` INTEGER NULL,
    `trl_out` INTEGER NULL,
    `quad_chart_url` TEXT NULL,
    `pi_id` INTEGER NULL,
    `organization_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `projects_program_flag_idx`(`program_flag`),
    INDEX `projects_completed_idx`(`completed`),
    INDEX `projects_pi_id_idx`(`pi_id`),
    INDEX `projects_organization_id_idx`(`organization_id`),
    UNIQUE INDEX `projects_project_code_source_internal_id_key`(`project_code`, `source_internal_id`),
    FULLTEXT INDEX `projects_title_abstract_idx`(`title`, `abstract`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_tech_categories` (
    `project_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,

    INDEX `project_tech_categories_category_id_idx`(`category_id`),
    PRIMARY KEY (`project_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `file_size` INTEGER NULL,
    `last_modified` DATETIME(3) NULL,
    `url` TEXT NOT NULL,

    INDEX `project_documents_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'admin',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tech_categories` ADD CONSTRAINT `tech_categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `tech_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_pi_id_fkey` FOREIGN KEY (`pi_id`) REFERENCES `principal_investigators`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_tech_categories` ADD CONSTRAINT `project_tech_categories_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_tech_categories` ADD CONSTRAINT `project_tech_categories_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `tech_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_documents` ADD CONSTRAINT `project_documents_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
