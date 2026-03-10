import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Body,
} from '@nestjs/common';
import { ConfigService } from './config.service';
import { CreateAIModelConfigDto } from './dto/create-ai-model-config.dto';
import { UpdateAIModelConfigDto } from './dto/update-ai-model-config.dto';

@Controller('v1/ai-model-configs')
export class AIModelConfigsV1Controller {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  async getAll(@Query('includeInactive') includeInactive?: string) {
    return this.configService.getAllAIModelConfigs(includeInactive === 'true');
  }

  @Get(':configKey')
  async getOne(@Param('configKey') configKey: string) {
    const config = await this.configService.getAIModelConfig(configKey);
    if (!config) {
      throw new NotFoundException('AI model config not found');
    }
    return config;
  }

  @Post()
  async create(@Body() body: CreateAIModelConfigDto) {
    const existing = await this.configService.findAIModelConfigByKey(body.configKey);
    if (existing) {
      throw new ConflictException('AI model config already exists');
    }
    return this.configService.upsertAIModelConfig(body.configKey, body);
  }

  @Put(':configKey')
  async replace(@Param('configKey') configKey: string, @Body() body: CreateAIModelConfigDto) {
    if (body.configKey && body.configKey !== configKey) {
      throw new BadRequestException('configKey in path and body must match');
    }
    return this.configService.upsertAIModelConfig(configKey, { ...body, configKey });
  }

  @Patch(':configKey')
  async update(@Param('configKey') configKey: string, @Body() body: UpdateAIModelConfigDto) {
    const existing = await this.configService.findAIModelConfigByKey(configKey);
    if (!existing) {
      throw new NotFoundException('AI model config not found');
    }
    return this.configService.updateAIModelConfig(configKey, body);
  }

  @Delete(':configKey')
  async remove(@Param('configKey') configKey: string) {
    return this.configService.deleteAIModelConfig(configKey);
  }
}
