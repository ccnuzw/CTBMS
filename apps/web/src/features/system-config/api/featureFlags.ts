
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const FF_API = '/api/feature-flags';

// ─── Types ──────────────────────────────────────────────────────────

export interface FeatureFlag {
    id: string;
    flagKey: string;
    description: string | null;
    isEnabled: boolean;
    rolloutPercent: number;
    allowUserIds: string[];
    environments: string[];
    metadata: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateFeatureFlagDto {
    flagKey: string;
    description?: string;
    isEnabled?: boolean;
    rolloutPercent?: number;
    allowUserIds?: string[];
    environments?: string[];
    metadata?: Record<string, unknown>;
}

export interface UpdateFeatureFlagDto {
    description?: string;
    isEnabled?: boolean;
    rolloutPercent?: number;
    allowUserIds?: string[];
    environments?: string[];
    metadata?: Record<string, unknown>;
}

// ─── Query Hooks ────────────────────────────────────────────────────

export function useFeatureFlags() {
    return useQuery<FeatureFlag[]>({
        queryKey: ['feature-flags'],
        queryFn: async () => {
            const res = await fetch(FF_API);
            if (!res.ok) throw new Error('Failed to fetch feature flags');
            return res.json();
        },
    });
}

export function useCheckFeatureFlag(flagKey: string, userId?: string) {
    return useQuery<{ enabled: boolean }>({
        queryKey: ['feature-flags', 'check', flagKey, userId],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (userId) params.set('userId', userId);
            const res = await fetch(`${FF_API}/check/${flagKey}?${params}`);
            if (!res.ok) throw new Error('Failed to check flag');
            return res.json();
        },
        enabled: Boolean(flagKey),
    });
}

// ─── Mutation Hooks ─────────────────────────────────────────────────

export function useCreateFeatureFlag() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (dto: CreateFeatureFlagDto) => {
            const res = await fetch(FF_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dto),
            });
            if (!res.ok) throw new Error('Failed to create flag');
            return res.json();
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['feature-flags'] });
        },
    });
}

export function useUpdateFeatureFlag() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ flagKey, data }: { flagKey: string; data: UpdateFeatureFlagDto }) => {
            const res = await fetch(`${FF_API}/${flagKey}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to update flag');
            return res.json();
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['feature-flags'] });
        },
    });
}

export function useDeleteFeatureFlag() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (flagKey: string) => {
            const res = await fetch(`${FF_API}/${flagKey}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete flag');
            return res.json();
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['feature-flags'] });
        },
    });
}

export function useSeedFeatureFlags() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const res = await fetch(`${FF_API}/seed`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to seed flags');
            return res.json();
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['feature-flags'] });
        },
    });
}
