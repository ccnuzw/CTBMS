import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateWorkflowDefinitionDto,
  CreateWorkflowVersionDto,
  PublishWorkflowVersionDto,
  PreflightWorkflowDslDto,
  ValidateWorkflowDslDto,
  ValidateWorkflowNodePreviewDto,
  WorkflowDefinitionDto,
  WorkflowDefinitionPageDto,
  WorkflowNodePreviewResult,
  WorkflowPublishAuditPageDto,
  WorkflowPublishAuditQueryDto,
  WorkflowDefinitionQueryDto,
  WorkflowExecutionDetailDto,
  WorkflowValidationResult,
  WorkflowDslPreflightResultDto,
  WorkflowVersionDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

const API_BASE = '/workflow-definitions';

export const useWorkflowDefinitions = (query?: Partial<WorkflowDefinitionQueryDto>) => {
  return useQuery<WorkflowDefinitionPageDto>({
    queryKey: ['workflow-definitions', query],
    queryFn: async () => {
      const res = await apiClient.get<WorkflowDefinitionPageDto>(API_BASE, {
        params: query,
      });
      return res.data;
    },
  });
};

export const usePublishedWorkflows = (query?: {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  keyword?: string;
  orderBy?: 'stars' | 'createdAt';
}) => {
  return useQuery<any>({
    queryKey: ['workflow-definitions-published', query],
    queryFn: async () => {
      const res = await apiClient.get<any>(`${API_BASE}/public/published`, {
        params: query,
      });
      return res.data;
    },
  });
};

export const useWorkflowDefinitionDetail = (id?: string) => {
  return useQuery<WorkflowDefinitionDto>({
    queryKey: ['workflow-definition', id],
    queryFn: async () => {
      const res = await apiClient.get<WorkflowDefinitionDto>(`${API_BASE}/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
};

export const useWorkflowVersions = (workflowDefinitionId?: string) => {
  return useQuery<WorkflowVersionDto[]>({
    queryKey: ['workflow-versions', workflowDefinitionId],
    queryFn: async () => {
      const res = await apiClient.get<WorkflowVersionDto[]>(
        `${API_BASE}/${workflowDefinitionId}/versions`,
      );
      return res.data;
    },
    enabled: Boolean(workflowDefinitionId),
  });
};

export const useWorkflowPublishAudits = (
  workflowDefinitionId?: string,
  query?: Partial<WorkflowPublishAuditQueryDto>,
) => {
  return useQuery<WorkflowPublishAuditPageDto>({
    queryKey: ['workflow-publish-audits', workflowDefinitionId, query],
    queryFn: async () => {
      const res = await apiClient.get<WorkflowPublishAuditPageDto>(
        `${API_BASE}/${workflowDefinitionId}/publish-audits`,
        {
          params: query,
        },
      );
      return res.data;
    },
    enabled: Boolean(workflowDefinitionId),
  });
};

export const useCreateWorkflowDefinition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateWorkflowDefinitionDto) => {
      const res = await apiClient.post(`${API_BASE}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
    },
  });
};

export const useCreateWorkflowVersion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workflowDefinitionId,
      payload,
    }: {
      workflowDefinitionId: string;
      payload: CreateWorkflowVersionDto;
    }) => {
      const res = await apiClient.post(`${API_BASE}/${workflowDefinitionId}/versions`, payload);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['workflow-versions', variables.workflowDefinitionId],
      });
      queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
    },
  });
};

export const usePublishWorkflowVersion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workflowDefinitionId,
      payload,
    }: {
      workflowDefinitionId: string;
      payload: PublishWorkflowVersionDto;
    }) => {
      const res = await apiClient.post(`${API_BASE}/${workflowDefinitionId}/publish`, payload);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['workflow-versions', variables.workflowDefinitionId],
      });
      queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
      queryClient.invalidateQueries({
        queryKey: ['workflow-definition', variables.workflowDefinitionId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workflow-publish-audits', variables.workflowDefinitionId],
      });
    },
  });
};

export const useValidateWorkflowDsl = () => {
  return useMutation({
    mutationFn: async (payload: ValidateWorkflowDslDto) => {
      const res = await apiClient.post<WorkflowValidationResult>(
        `${API_BASE}/validate-dsl`,
        payload,
      );
      return res.data;
    },
  });
};

export const usePreflightWorkflowDsl = () => {
  return useMutation({
    mutationFn: async (payload: PreflightWorkflowDslDto) => {
      const res = await apiClient.post<WorkflowDslPreflightResultDto>(
        `${API_BASE}/preflight-dsl`,
        payload,
      );
      return res.data;
    },
  });
};

export const usePreviewWorkflowNode = () => {
  return useMutation({
    mutationFn: async (payload: ValidateWorkflowNodePreviewDto) => {
      const res = await apiClient.post<WorkflowNodePreviewResult>(
        `${API_BASE}/preview-node`,
        payload,
      );
      return res.data;
    },
  });
};

export const useTriggerWorkflowExecution = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      workflowDefinitionId: string;
      workflowVersionId?: string;
      paramSnapshot?: Record<string, unknown>;
    }) => {
      const res = await apiClient.post<WorkflowExecutionDetailDto>(
        '/workflow-executions/trigger',
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-executions'] });
    },
  });
};

export const useSmartParseParams = () => {
  return useMutation({
    mutationFn: async (payload: {
      workflowDefinitionId: string;
      userInput: string;
      paramSchema?: Record<string, unknown>;
    }) => {
      const { workflowDefinitionId, ...body } = payload;
      const res = await apiClient.post<{
        params: Record<string, unknown>;
        confidence: string;
        reasoning: string;
      }>(`${API_BASE}/${workflowDefinitionId}/smart-parse-params`, body);
      return res.data;
    },
  });
};
