import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FuturesQuotePageDto,
  FuturesQuoteSnapshotDto,
  FuturesDerivedFeaturePageDto,
  CalculateFuturesDerivedFeatureDto,
  CalculateFuturesDerivedFeatureResultDto,
  PositionPageDto,
  VirtualFuturesPositionDto,
  TradeLedgerPageDto,
  VirtualAccountSummaryDto,
  OpenPositionDto,
  ClosePositionDto,
  VirtualTradeLedgerDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

// ── 行情快照 ──

export interface QuoteQuery {
  contractCode?: string;
  exchange?: string;
  tradingDay?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export const useQuoteSnapshots = (query?: QuoteQuery) => {
  return useQuery<FuturesQuotePageDto>({
    queryKey: ['futures-quotes', query],
    queryFn: async () => {
      const res = await apiClient.get<FuturesQuotePageDto>('/futures-sim/quotes', { params: query });
      return res.data;
    },
  });
};

export const useLatestQuote = (contractCode?: string) => {
  return useQuery<FuturesQuoteSnapshotDto>({
    queryKey: ['futures-quote-latest', contractCode],
    queryFn: async () => {
      const res = await apiClient.get<FuturesQuoteSnapshotDto>(`/futures-sim/quotes/latest/${contractCode}`);
      return res.data;
    },
    enabled: Boolean(contractCode),
  });
};

// ── 衍生特征 ──

export interface DerivedFeatureQuery {
  contractCode?: string;
  featureType?: string;
  tradingDay?: string;
  page?: number;
  pageSize?: number;
}

export const useDerivedFeatures = (query?: DerivedFeatureQuery) => {
  return useQuery<FuturesDerivedFeaturePageDto>({
    queryKey: ['futures-derived-features', query],
    queryFn: async () => {
      const res = await apiClient.get<FuturesDerivedFeaturePageDto>('/futures-sim/features', {
        params: query,
      });
      return res.data;
    },
  });
};

export const useCalculateDerivedFeatures = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CalculateFuturesDerivedFeatureDto) => {
      const res = await apiClient.post<CalculateFuturesDerivedFeatureResultDto>(
        '/futures-sim/features/calculate',
        dto,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['futures-derived-features'] });
    },
  });
};

// ── 虚拟持仓 ──

export interface PositionQuery {
  accountId?: string;
  contractCode?: string;
  direction?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export const usePositions = (query?: PositionQuery) => {
  return useQuery<PositionPageDto>({
    queryKey: ['futures-positions', query],
    queryFn: async () => {
      const res = await apiClient.get<PositionPageDto>('/futures-sim/positions', { params: query });
      return res.data;
    },
  });
};

export const usePositionDetail = (id?: string) => {
  return useQuery<VirtualFuturesPositionDto & { trades: VirtualTradeLedgerDto[] }>({
    queryKey: ['futures-position-detail', id],
    queryFn: async () => {
      const res = await apiClient.get(`/futures-sim/positions/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
};

export const useOpenPosition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: OpenPositionDto) => {
      const res = await apiClient.post<VirtualFuturesPositionDto>('/futures-sim/positions', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['futures-positions'] });
      queryClient.invalidateQueries({ queryKey: ['futures-account-summary'] });
    },
  });
};

export const useClosePosition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: ClosePositionDto }) => {
      const res = await apiClient.post<VirtualFuturesPositionDto>(`/futures-sim/positions/${id}/close`, dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['futures-positions'] });
      queryClient.invalidateQueries({ queryKey: ['futures-trades'] });
      queryClient.invalidateQueries({ queryKey: ['futures-account-summary'] });
    },
  });
};

// ── 成交流水 ──

export interface TradeQuery {
  accountId?: string;
  contractCode?: string;
  action?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export const useTrades = (query?: TradeQuery) => {
  return useQuery<TradeLedgerPageDto>({
    queryKey: ['futures-trades', query],
    queryFn: async () => {
      const res = await apiClient.get<TradeLedgerPageDto>('/futures-sim/trades', { params: query });
      return res.data;
    },
  });
};

// ── 账户概览 ──

export const useAccountSummary = (accountId?: string) => {
  return useQuery<VirtualAccountSummaryDto>({
    queryKey: ['futures-account-summary', accountId],
    queryFn: async () => {
      const res = await apiClient.get<VirtualAccountSummaryDto>(`/futures-sim/accounts/${accountId}/summary`);
      return res.data;
    },
    enabled: Boolean(accountId),
  });
};

// ── Mock Data (Dev) ──

export const useGenerateMockData = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractCode, days }: { contractCode: string; days?: number }) => {
      const res = await apiClient.post<{ count: number }>('/futures-sim/mock-data', {
        contractCode,
        days,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['futures-quotes'] });
    },
  });
};
