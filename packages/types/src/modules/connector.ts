import { z } from 'zod';

// --- ETL Process ---
export const ETLProcessSchema = z.object({
    op: z.enum(['json_pick', 'list_slice', 'unit_convert', 'template_render']),
    args: z.record(z.any()),
});

export type ETLProcess = z.infer<typeof ETLProcessSchema>;

// --- Connector Manifest ---
export const ConnectorManifestSchema = z.object({
    meta: z.object({
        id: z.string(),
        version: z.string(),
        name: z.string(),
        category: z.enum(['FINANCE', 'NEWS', 'UTILITY']),
        description: z.string().optional(),
        icon: z.string().optional(),
    }),

    auth: z.object({
        type: z.enum(['NONE', 'API_KEY', 'OAUTH2']),
        config: z.object({
            header_name: z.string().optional(),
            token_prefix: z.string().optional(),
        }).optional(),
    }),

    endpoints: z.array(z.object({
        id: z.string(),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
        url: z.string(),
        params: z.array(z.object({
            name: z.string(),
            required: z.boolean(),
            in: z.enum(['QUERY', 'BODY', 'PATH', 'HEADER']),
        })).optional(),
    })),

    transform: z.array(ETLProcessSchema).optional(),
});

export type ConnectorManifest = z.infer<typeof ConnectorManifestSchema>;

// --- API DTOs ---
export const ExecuteConnectorRequestSchema = z.object({
    connectorId: z.string(),
    endpointId: z.string(),
    params: z.record(z.any()),
    debug: z.boolean().optional(),
});

export type ExecuteConnectorRequest = z.infer<typeof ExecuteConnectorRequestSchema>;
