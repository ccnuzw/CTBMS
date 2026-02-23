import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AgentSkillPageDto, AgentSkillQueryDto } from '@packages/types';
import { apiClient } from '../../../api/client';

const API_BASE = '/agent-skills';

export const useAgentSkills = (query?: Partial<AgentSkillQueryDto>) => {
    return useQuery<AgentSkillPageDto>({
        queryKey: ['agent-skills', query],
        queryFn: async () => {
            const res = await apiClient.get<AgentSkillPageDto>(API_BASE, { params: query });
            return res.data;
        },
    });
};

export const useToggleSkillActive = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.patch(`${API_BASE}/${id}/toggle-active`);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-skills'] }),
    });
};

export const useUpdateSkill = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: { name?: string; description?: string; isActive?: boolean } }) => {
            const res = await apiClient.patch(`${API_BASE}/${id}`, data);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-skills'] }),
    });
};
