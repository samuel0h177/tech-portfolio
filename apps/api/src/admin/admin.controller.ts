import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';
import { AddDocumentDto, UpsertProjectDto } from './dto/project.dto';
import { UpsertCategoryDto, UpsertOrganizationDto, UpsertPiDto } from './dto/reference.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // Projects
  @Get('projects')
  listProjects(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('q') q?: string,
  ) {
    return this.admin.listProjects(parseInt(page, 10), parseInt(pageSize, 10), q);
  }

  @Post('projects')
  createProject(@Body() dto: UpsertProjectDto) {
    return this.admin.createProject(dto);
  }

  @Put('projects/:id')
  updateProject(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertProjectDto) {
    return this.admin.updateProject(id, dto);
  }

  @Delete('projects/:id')
  deleteProject(@Param('id', ParseIntPipe) id: number) {
    return this.admin.deleteProject(id);
  }

  // Documents
  @Post('projects/:id/documents')
  addDocument(@Param('id', ParseIntPipe) id: number, @Body() dto: AddDocumentDto) {
    return this.admin.addDocument(id, dto);
  }

  @Delete('documents/:id')
  deleteDocument(@Param('id', ParseIntPipe) id: number) {
    return this.admin.deleteDocument(id);
  }

  // Principal Investigators
  @Get('pis')
  listPis() {
    return this.admin.listPis();
  }

  @Post('pis')
  createPi(@Body() dto: UpsertPiDto) {
    return this.admin.createPi(dto);
  }

  @Put('pis/:id')
  updatePi(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertPiDto) {
    return this.admin.updatePi(id, dto);
  }

  @Delete('pis/:id')
  deletePi(@Param('id', ParseIntPipe) id: number) {
    return this.admin.deletePi(id);
  }

  // Organizations
  @Get('organizations')
  listOrganizations() {
    return this.admin.listOrganizations();
  }

  @Post('organizations')
  createOrganization(@Body() dto: UpsertOrganizationDto) {
    return this.admin.createOrganization(dto);
  }

  @Put('organizations/:id')
  updateOrganization(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertOrganizationDto) {
    return this.admin.updateOrganization(id, dto);
  }

  @Delete('organizations/:id')
  deleteOrganization(@Param('id', ParseIntPipe) id: number) {
    return this.admin.deleteOrganization(id);
  }

  // Categories
  @Get('categories')
  listCategories() {
    return this.admin.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: UpsertCategoryDto) {
    return this.admin.createCategory(dto);
  }

  @Put('categories/:id')
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertCategoryDto) {
    return this.admin.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.admin.deleteCategory(id);
  }
}
