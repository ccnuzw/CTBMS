import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    ParseUUIDPipe,
} from '@nestjs/common';
import { EnterpriseService } from './enterprise.service';
import {
    CreateEnterpriseDto,
    UpdateEnterpriseDto,
    EnterpriseQueryDto,
    CreateContactDto,
    UpdateContactDto,
    CreateBankAccountDto,
    UpdateBankAccountDto,
} from './dto';

@Controller('enterprises')
export class EnterpriseController {
    constructor(private readonly enterpriseService: EnterpriseService) { }

    // ============= Enterprise Routes =============

    @Get()
    findAll(@Query() query: EnterpriseQueryDto) {
        return this.enterpriseService.findAll(query);
    }

    @Get('tree')
    findTree() {
        return this.enterpriseService.findTree();
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.enterpriseService.findOne(id);
    }

    @Post()
    create(@Body() dto: CreateEnterpriseDto) {
        return this.enterpriseService.create(dto);
    }

    @Patch(':id')
    update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEnterpriseDto) {
        return this.enterpriseService.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.enterpriseService.remove(id);
    }

    // ============= Contact Routes =============

    @Post(':id/contacts')
    addContact(
        @Param('id', ParseUUIDPipe) enterpriseId: string,
        @Body() dto: CreateContactDto,
    ) {
        return this.enterpriseService.addContact(enterpriseId, dto);
    }

    @Patch('contacts/:contactId')
    updateContact(
        @Param('contactId', ParseUUIDPipe) contactId: string,
        @Body() dto: UpdateContactDto,
    ) {
        return this.enterpriseService.updateContact(contactId, dto);
    }

    @Delete('contacts/:contactId')
    removeContact(@Param('contactId', ParseUUIDPipe) contactId: string) {
        return this.enterpriseService.removeContact(contactId);
    }

    // ============= BankAccount Routes =============

    @Post(':id/bank-accounts')
    addBankAccount(
        @Param('id', ParseUUIDPipe) enterpriseId: string,
        @Body() dto: CreateBankAccountDto,
    ) {
        return this.enterpriseService.addBankAccount(enterpriseId, dto);
    }

    @Patch('bank-accounts/:accountId')
    updateBankAccount(
        @Param('accountId', ParseUUIDPipe) accountId: string,
        @Body() dto: UpdateBankAccountDto,
    ) {
        return this.enterpriseService.updateBankAccount(accountId, dto);
    }

    @Delete('bank-accounts/:accountId')
    removeBankAccount(@Param('accountId', ParseUUIDPipe) accountId: string) {
        return this.enterpriseService.removeBankAccount(accountId);
    }
}
