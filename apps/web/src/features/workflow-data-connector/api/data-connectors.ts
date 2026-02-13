import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateDataConnectorDto,
  DataConnectorDto,
  DataConnectorHealthCheckDto,
  DataConnectorHealthCheckResultDto,
  DataConnectorPageDto,
  DataConnectorQueryDto,
  UpdateDataConnectorDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

const API_BASE = '/data-connectors';

export const useDataConnectors = (query?: Partial<DataConnectorQueryDto>) => {
  return useQuery<DataConnectorPageDto>({
    queryKey: ['data-connectors', query],
    queryFn: async () => {
      const res = await apiClient.get<DataConnectorPageDto>(API_BASE, { params: query });
      return res.data;
    },
  });
};

export const useCreateDataConnector = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateDataConnectorDto) => {
      const res = await apiClient.post<DataConnectorDto>(API_BASE, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-connectors'] });
    },
  });
};

export const useUpdateDataConnector = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateDataConnectorDto }) => {
      const res = await apiClient.patch<DataConnectorDto>(`${API_BASE}/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-connectors'] });
    },
  });
};

export const useDeleteDataConnector = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`${API_BASE}/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-connectors'] });
    },
  });
};

export const useHealthCheckDataConnector = () => {
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload?: DataConnectorHealthCheckDto }) => {
      const res = await apiClient.post<DataConnectorHealthCheckResultDto>(
        `${API_BASE}/${id}/health-check`,
        payload ?? {},
      );
      return res.data;
    },
  });
};
