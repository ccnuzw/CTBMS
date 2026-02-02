import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import {
  CreateCollectionPointAllocationDto,
  BatchCreateAllocationDto,
  UpdateCollectionPointAllocationDto,
  QueryCollectionPointAllocationDto,
  AllocationMatrixQueryDto,
  AllocationMatrixResponse,
  CollectionPointAllocationResponse,
  CreatePriceSubmissionDto,
  QueryPriceSubmissionDto,
  PriceSubmissionResponse,
  SubmitPriceEntryDto,
  BulkSubmitPriceEntriesDto,
  ReviewPriceDataDto,
  BatchReviewPriceDataDto,
  ReviewPriceSubmissionDto,
  AllocationRole,
  SubmissionStatus,
  PriceReviewStatus,
} from '@packages/types';

// =============================================
// 采集点分配 API
// =============================================

const ALLOCATION_BASE_URL = '/collection-point-allocations';

export const useAllocations = (query: QueryCollectionPointAllocationDto) => {
  return useQuery({
    queryKey: ['collection-point-allocations', query],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        data: CollectionPointAllocationResponse[];
        total: number;
        page: number;
        pageSize: number;
      }>(ALLOCATION_BASE_URL, { params: query });
      return data;
    },
  });
};

export const useAllocationStatistics = () => {
  return useQuery({
    queryKey: ['allocation-statistics'],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        total: number;
        allocated: number;
        unallocated: number;
        byType: Array<{ type: string; total: number; allocated: number }>;
      }>(`${ALLOCATION_BASE_URL}/statistics`);
      return data;
    },
  });
};

export const useAllocationMatrix = (query: AllocationMatrixQueryDto, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['allocation-matrix', query],
    enabled: options?.enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<AllocationMatrixResponse>(
        `${ALLOCATION_BASE_URL}/matrix`,
        { params: query }
      );
      return data;
    },
  });
};

export const useMyAssignedPoints = (effectiveDate?: string, userId?: string) => {
  return useQuery({
    queryKey: ['my-assigned-points', effectiveDate, userId],
    queryFn: async () => {
      const params = effectiveDate ? { effectiveDate } : {};
      const { data } = await apiClient.get<any[]>(`${ALLOCATION_BASE_URL}/my-assigned`, { params });
      return data;
    },
  });
};

export const usePointAssignees = (collectionPointId: string) => {
  return useQuery({
    queryKey: ['point-assignees', collectionPointId],
    queryFn: async () => {
      const { data } = await apiClient.get<any[]>(`${ALLOCATION_BASE_URL}/by-point/${collectionPointId}`);
      return data;
    },
    enabled: !!collectionPointId,
  });
};

export const useAllocationsByUser = (userId?: string) => {
  return useQuery({
    queryKey: ['allocation-by-user', userId],
    queryFn: async () => {
      const { data } = await apiClient.get<CollectionPointAllocationResponse[]>(
        `${ALLOCATION_BASE_URL}/by-user/${userId}`
      );
      return data;
    },
    enabled: !!userId,
  });
};

export const useCreateAllocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateCollectionPointAllocationDto) => {
      const { data } = await apiClient.post<CollectionPointAllocationResponse>(ALLOCATION_BASE_URL, dto);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['collection-point-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['allocation-statistics'] });
      queryClient.invalidateQueries({ queryKey: ['collection-points'] });
      queryClient.invalidateQueries({ queryKey: ['point-assignees', variables.collectionPointId] });
      queryClient.invalidateQueries({ queryKey: ['allocation-by-user', variables.userId] });
    },
  });
};

export const useBatchCreateAllocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: BatchCreateAllocationDto) => {
      const { data } = await apiClient.post<any[]>(`${ALLOCATION_BASE_URL}/batch`, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-point-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['allocation-statistics'] });
    },
  });
};

export const useUpdateAllocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateCollectionPointAllocationDto }) => {
      const { data } = await apiClient.patch<CollectionPointAllocationResponse>(`${ALLOCATION_BASE_URL}/${id}`, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-point-allocations'] });
    },
  });
};

export const useDeleteAllocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`${ALLOCATION_BASE_URL}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-point-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['allocation-statistics'] });
      queryClient.invalidateQueries({ queryKey: ['collection-points'] });
      queryClient.invalidateQueries({ queryKey: ['point-assignees'] });
      queryClient.invalidateQueries({ queryKey: ['allocation-by-user'] });
    },
  });
};

// =============================================
// 价格填报 API
// =============================================

const SUBMISSION_BASE_URL = '/price-submissions';

export const useSubmissions = (query: QueryPriceSubmissionDto) => {
  return useQuery({
    queryKey: ['price-submissions', query],
    queryFn: async () => {
      const params = { ...query };
      if (params.effectiveDateStart) (params as any).effectiveDateStart = (params.effectiveDateStart as Date).toISOString();
      if (params.effectiveDateEnd) (params as any).effectiveDateEnd = (params.effectiveDateEnd as Date).toISOString();
      const { data } = await apiClient.get<{
        data: PriceSubmissionResponse[];
        total: number;
        page: number;
        pageSize: number;
      }>(SUBMISSION_BASE_URL, { params });
      return data;
    },
  });
};

export const useMySubmissions = (
  query: Omit<QueryPriceSubmissionDto, 'submittedById'>,
  userId?: string,
) => {
  return useQuery({
    queryKey: ['my-submissions', query, userId],
    queryFn: async () => {
      const params = { ...query };
      if (params.effectiveDateStart) (params as any).effectiveDateStart = (params.effectiveDateStart as Date).toISOString();
      if (params.effectiveDateEnd) (params as any).effectiveDateEnd = (params.effectiveDateEnd as Date).toISOString();
      const { data } = await apiClient.get<{
        data: PriceSubmissionResponse[];
        total: number;
      }>(`${SUBMISSION_BASE_URL}/my`, { params });
      return data;
    },
  });
};

export const useSubmission = (id: string) => {
  return useQuery({
    queryKey: ['price-submission', id],
    queryFn: async () => {
      const { data } = await apiClient.get<PriceSubmissionResponse>(`${SUBMISSION_BASE_URL}/${id}`);
      return data;
    },
    enabled: !!id,
  });
};

export const useSubmissionStatistics = (userId?: string) => {
  return useQuery({
    queryKey: ['submission-statistics', userId],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        todayPending: number;
        todayCompleted: number;
        weekCompleted: number;
        monthCompleted: number;
        pendingReview: number;
        rejectedCount: number;
      }>(`${SUBMISSION_BASE_URL}/statistics`);
      return data;
    },
  });
};

export const usePendingReviews = (query?: { page?: number; pageSize?: number }) => {
  return useQuery({
    queryKey: ['pending-reviews', query],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        data: PriceSubmissionResponse[];
        total: number;
      }>(`${SUBMISSION_BASE_URL}/pending-reviews`, { params: query });
      return data;
    },
  });
};

export const usePointPriceHistory = (collectionPointId: string, days: number = 7, commodity?: string) => {
  return useQuery({
    queryKey: ['point-price-history', collectionPointId, days, commodity],
    queryFn: async () => {
      const { data } = await apiClient.get<any[]>(`${SUBMISSION_BASE_URL}/point/${collectionPointId}/history`, {
        params: { days, commodity },
      });
      return data;
    },
    enabled: !!collectionPointId,
  });
};

export const useCreateSubmission = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreatePriceSubmissionDto) => {
      const { data } = await apiClient.post<PriceSubmissionResponse>(SUBMISSION_BASE_URL, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['submission-statistics'] });
    },
  });
};

export const useAddPriceEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ submissionId, dto }: { submissionId: string; dto: SubmitPriceEntryDto }) => {
      const { data } = await apiClient.post<any>(`${SUBMISSION_BASE_URL}/${submissionId}/entries`, dto);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['price-submission', variables.submissionId] });
    },
  });
};

export const useBulkAddPriceEntries = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ submissionId, dto }: { submissionId: string; dto: BulkSubmitPriceEntriesDto }) => {
      const { data } = await apiClient.post<any[]>(`${SUBMISSION_BASE_URL}/${submissionId}/entries/bulk`, dto);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['price-submission', variables.submissionId] });
    },
  });
};

export const useUpdatePriceEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ submissionId, entryId, dto }: { submissionId: string; entryId: string; dto: SubmitPriceEntryDto }) => {
      const { data } = await apiClient.patch<any>(`${SUBMISSION_BASE_URL}/${submissionId}/entries/${entryId}`, dto);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['price-submission', variables.submissionId] });
    },
  });
};

export const useDeletePriceEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ submissionId, entryId }: { submissionId: string; entryId: string }) => {
      await apiClient.delete(`${SUBMISSION_BASE_URL}/${submissionId}/entries/${entryId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['price-submission', variables.submissionId] });
    },
  });
};

export const useSubmitSubmission = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (submissionId: string) => {
      const { data } = await apiClient.post<PriceSubmissionResponse>(`${SUBMISSION_BASE_URL}/${submissionId}/submit`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['submission-statistics'] });
      queryClient.invalidateQueries({ queryKey: ['my-assigned-points'] });
    },
  });
};

export const useCopyYesterdayData = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (submissionId: string) => {
      const { data } = await apiClient.post<any[]>(`${SUBMISSION_BASE_URL}/${submissionId}/copy-yesterday`);
      return data;
    },
    onSuccess: (_, submissionId) => {
      queryClient.invalidateQueries({ queryKey: ['price-submission', submissionId] });
    },
  });
};

export const useReviewSubmission = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ submissionId, dto }: { submissionId: string; dto: ReviewPriceSubmissionDto }) => {
      const { data } = await apiClient.post<PriceSubmissionResponse>(`${SUBMISSION_BASE_URL}/${submissionId}/review`, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['submission-statistics'] });
    },
  });
};

export const useReviewPriceData = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ priceId, dto }: { priceId: string; dto: ReviewPriceDataDto }) => {
      const { data } = await apiClient.post<any>(`/price-data/${priceId}/review`, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
    },
  });
};

export const useBatchReviewPriceData = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: BatchReviewPriceDataDto) => {
      const { data } = await apiClient.post<any[]>('/price-data/batch-review', dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['submission-statistics'] });
    },
  });
};

// Re-export types for convenience
export { AllocationRole, SubmissionStatus, PriceReviewStatus };

// =============================================
// 任务模板 API
// =============================================

const TEMPLATE_BASE_URL = '/intel-tasks/templates';

export interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  taskType: string;
  priority: string;
  cycleType: string;
  timezone?: string;
  deadlineOffset: number;
  runDayOfWeek?: number | null;
  runDayOfMonth?: number | null;
  assigneeMode: string;
  assigneeIds: string[];
  departmentIds: string[];
  organizationIds: string[];
  collectionPointIds: string[];
  targetPointType?: string;
  collectionPointId?: string;
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  activeFrom: string;
  activeUntil?: string;
  runAtMinute: number;
  dueAtMinute: number;
  dueDayOfWeek?: number | null;
  dueDayOfMonth?: number | null;
  allowLate?: boolean;
  maxBackfillPeriods?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskTemplateDto {
  name: string;
  description?: string;
  taskType: string;
  priority?: string;
  cycleType: string;
  timezone?: string;
  deadlineOffset?: number;
  runDayOfWeek?: number | null;
  runDayOfMonth?: number | null;
  assigneeMode?: string;
  assigneeIds?: string[];
  departmentIds?: string[];
  organizationIds?: string[];
  collectionPointIds?: string[];
  targetPointType?: string;
  collectionPointId?: string;
  runAtMinute?: number;
  dueAtMinute?: number;
  dueDayOfWeek?: number | null;
  dueDayOfMonth?: number | null;
  allowLate?: boolean;
  maxBackfillPeriods?: number;
  activeFrom?: string;
  activeUntil?: string;
}

export const useTaskTemplates = () => {
  return useQuery({
    queryKey: ['task-templates'],
    queryFn: async () => {
      const { data } = await apiClient.get<TaskTemplate[]>(TEMPLATE_BASE_URL);
      return data;
    },
  });
};

export const useTaskTemplate = (id: string) => {
  return useQuery({
    queryKey: ['task-template', id],
    queryFn: async () => {
      const { data } = await apiClient.get<TaskTemplate>(`${TEMPLATE_BASE_URL}/${id}`);
      return data;
    },
    enabled: !!id,
  });
};

export const useCreateTaskTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateTaskTemplateDto) => {
      const { data } = await apiClient.post<TaskTemplate>(TEMPLATE_BASE_URL, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
    },
  });
};

export const useUpdateTaskTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: Partial<CreateTaskTemplateDto> }) => {
      const { data } = await apiClient.put<TaskTemplate>(`${TEMPLATE_BASE_URL}/${id}`, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
    },
  });
};

export const useDeleteTaskTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`${TEMPLATE_BASE_URL}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
    },
  });
};

export const useExecuteTaskTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data } = await apiClient.post<{ count: number; message: string }>(
        `/intel-tasks/templates/${templateId}/execute`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
    },
  });
};

export const useDistributeTasks = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { templateId: string; assigneeIds?: string[]; overrideDeadline?: string }) => {
      const { data } = await apiClient.post<{ count: number; message: string }>(
        '/intel-tasks/distribute',
        dto
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
    },
  });
};

export const usePreviewTaskDistribution = () => {
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data } = await apiClient.post<import('@packages/types').DistributionPreviewResponse>(
        `/intel-tasks/templates/${templateId}/preview`
      );
      return data;
    },
  });
};
