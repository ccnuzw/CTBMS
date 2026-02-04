export interface CreateDictionaryDomainDto {
    code: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
}

export interface UpdateDictionaryDomainDto {
    name?: string;
    description?: string | null;
    isActive?: boolean;
}

export interface CreateDictionaryItemDto {
    code: string;
    label: string;
    sortOrder?: number;
    isActive?: boolean;
    parentCode?: string | null;
    meta?: unknown;
}

export interface UpdateDictionaryItemDto {
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
    parentCode?: string | null;
    meta?: unknown;
}
