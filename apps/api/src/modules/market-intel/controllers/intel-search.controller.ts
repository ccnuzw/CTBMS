import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    BadRequestException,
} from '@nestjs/common';
import { IntelSearchService } from '../intel-search.service';
import { IntelAnalysisService } from '../intel-analysis.service';
import { IntelCategory } from '@packages/types';

@Controller('market-intel')
export class IntelSearchController {
    constructor(
        private readonly intelSearchService: IntelSearchService,
        private readonly intelAnalysisService: IntelAnalysisService,
    ) { }

    @Get('universal-search')
    async universalSearch(
        @Query('keyword') keyword: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('sentiment') sentiment?: 'positive' | 'negative' | 'neutral',
        @Query('commodities') commodities?: string,
        @Query('sourceTypes') sourceTypes?: string,
        @Query('regionCodes') regionCodes?: string,
        @Query('pricePageSize') pricePageSize = '20',
        @Query('intelPageSize') intelPageSize = '10',
        @Query('docPageSize') docPageSize = '10',
    ) {
        if (!keyword || !keyword.trim()) {
            throw new BadRequestException('keyword is required');
        }
        const split = (s?: string) => (s ? s.split(',').filter(Boolean) : undefined);
        return this.intelSearchService.universalSearch({
            keyword: keyword.trim(),
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            sentiment,
            commodities: split(commodities),
            sourceTypes: split(sourceTypes),
            regionCodes: split(regionCodes),
            pricePageSize: parseInt(pricePageSize, 10),
            intelPageSize: parseInt(intelPageSize, 10),
            docPageSize: parseInt(docPageSize, 10),
        });
    }

    @Get('search-suggestions')
    async getSearchSuggestions(@Query('prefix') prefix: string, @Query('limit') limit = '10') {
        return this.intelSearchService.getSearchSuggestions(prefix || '', parseInt(limit, 10));
    }

    @Get('full-text-search')
    async fullTextSearch(
        @Query('keywords') keywords: string,
        @Query('category') category?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('page') page = '1',
        @Query('pageSize') pageSize = '20',
    ) {
        if (!keywords || !keywords.trim()) {
            throw new BadRequestException('keywords is required');
        }
        return this.intelSearchService.fullTextSearch({
            keywords: keywords.trim(),
            category: category as IntelCategory | undefined,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            page: parseInt(page, 10),
            pageSize: parseInt(pageSize, 10),
        });
    }

    @Get('related-content')
    async getRelatedContent(
        @Query('intelId') intelId?: string,
        @Query('tags') tags?: string,
        @Query('commodities') commodities?: string,
        @Query('regionCodes') regionCodes?: string,
        @Query('limit') limit = '10',
    ) {
        const split = (v?: string) => (v ? v.split(',').filter(Boolean) : []);
        return this.intelSearchService.getRelatedContent({
            intelId,
            tags: split(tags),
            commodities: split(commodities),
            regionCodes: split(regionCodes),
            limit: parseInt(limit, 10),
        });
    }

    @Get('dashboard/stats')
    async getDashboardStats(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('sourceTypes') sourceTypes?: string,
        @Query('regionCodes') regionCodes?: string,
        @Query('commodities') commodities?: string,
        @Query('processingStatus') processingStatus?: string,
        @Query('qualityLevel') qualityLevel?: string,
        @Query('keyword') keyword?: string,
        @Query('minScore') minScore?: string,
        @Query('maxScore') maxScore?: string,
    ) {
        const split = (s?: string) => (s ? s.split(',').filter(Boolean) : undefined);
        return this.intelAnalysisService.getDashboardStats({
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            sourceTypes: split(sourceTypes),
            regionCodes: split(regionCodes),
            commodities: split(commodities),
            processingStatus: split(processingStatus),
            qualityLevel: split(qualityLevel),
            keyword,
            minScore: minScore ? parseInt(minScore) : undefined,
            maxScore: maxScore ? parseInt(maxScore) : undefined,
        });
    }

    @Post('dashboard/actions/briefing')
    async generateSmartBriefing(
        @Body() body: { startDate?: string; endDate?: string;[key: string]: unknown },
    ) {
        return this.intelAnalysisService.generateSmartBriefing({
            ...body,
            startDate: body.startDate ? new Date(body.startDate) : undefined,
            endDate: body.endDate ? new Date(body.endDate) : undefined,
        });
    }

    @Get('trend-analysis')
    async getTrendAnalysis(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('commodities') commodities?: string,
        @Query('regions') regions?: string,
    ) {
        return this.intelAnalysisService.getTrendAnalysis({
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            commodities: commodities ? commodities.split(',') : undefined,
            regions: regions ? regions.split(',') : undefined,
        });
    }

    @Get('feed')
    async getIntelligenceFeed(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('eventTypeIds') eventTypeIds?: string,
        @Query('insightTypeIds') insightTypeIds?: string,
        @Query('sentiments') sentiments?: string,
        @Query('commodities') commodities?: string,
        @Query('keyword') keyword?: string,
        @Query('limit') limit = '50',
        @Query('sourceTypes') sourceTypes?: string,
        @Query('regionCodes') regionCodes?: string,
        @Query('minScore') minScore?: string,
        @Query('maxScore') maxScore?: string,
        @Query('processingStatus') processingStatus?: string,
        @Query('qualityLevel') qualityLevel?: string,
        @Query('contentTypes') contentTypes?: string,
    ) {
        const splitOrUndefined = (str: string | undefined): string[] | undefined => {
            if (!str || str.trim() === '') return undefined;
            const arr = str
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            return arr.length > 0 ? arr : undefined;
        };

        return this.intelAnalysisService.getIntelligenceFeed({
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            eventTypeIds: splitOrUndefined(eventTypeIds),
            insightTypeIds: splitOrUndefined(insightTypeIds),
            sentiments: splitOrUndefined(sentiments),
            commodities: splitOrUndefined(commodities),
            keyword: keyword?.trim() || undefined,
            limit: parseInt(limit, 10),
            sourceTypes: splitOrUndefined(sourceTypes),
            regionCodes: splitOrUndefined(regionCodes),
            minScore: minScore ? parseInt(minScore, 10) : undefined,
            maxScore: maxScore ? parseInt(maxScore, 10) : undefined,
            processingStatus: splitOrUndefined(processingStatus),
            qualityLevel: splitOrUndefined(qualityLevel),
            contentTypes: splitOrUndefined(contentTypes),
        });
    }

    @Get('hot-topics')
    async getHotTopics(@Query('limit') limit = '20') {
        return this.intelAnalysisService.getHotTopics(parseInt(limit, 10));
    }
}
