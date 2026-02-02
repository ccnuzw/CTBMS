import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
} from '@nestjs/common';
import { CollectionPointAllocationService } from './collection-point-allocation.service';
import {
  CreateCollectionPointAllocationDto,
  BatchCreateAllocationDto,
  UpdateCollectionPointAllocationDto,
  QueryCollectionPointAllocationDto,
} from './dto';

@Controller('collection-point-allocations')
export class CollectionPointAllocationController {
  constructor(private readonly allocationService: CollectionPointAllocationService) {}

  @Post()
  create(@Body() dto: CreateCollectionPointAllocationDto, @Request() req: any) {
    const assignedById = req.user?.id;
    return this.allocationService.create(dto, assignedById);
  }

  @Post('batch')
  batchCreate(@Body() dto: BatchCreateAllocationDto, @Request() req: any) {
    const assignedById = req.user?.id;
    return this.allocationService.batchCreate(dto, assignedById);
  }

  @Get()
  findAll(@Query() query: QueryCollectionPointAllocationDto) {
    return this.allocationService.findAll(query);
  }

  @Get('statistics')
  getStatistics() {
    return this.allocationService.getStatistics();
  }

  @Get('matrix')
  getAllocationMatrix(@Query() query: any) {
    return this.allocationService.getAllocationMatrix(query);
  }

  @Get('my-assigned')
  findMyAssigned(@Request() req: any, @Query('effectiveDate') effectiveDate?: string) {
    const userId = req.user?.id;
    const date = effectiveDate ? new Date(effectiveDate) : undefined;
    return this.allocationService.findMyAssignedPoints(userId, date);
  }

  @Get('by-user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.allocationService.findByUser(userId);
  }

  @Get('by-point/:collectionPointId')
  findByCollectionPoint(@Param('collectionPointId') collectionPointId: string) {
    return this.allocationService.findByCollectionPoint(collectionPointId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.allocationService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCollectionPointAllocationDto) {
    return this.allocationService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.allocationService.remove(id);
  }
}
