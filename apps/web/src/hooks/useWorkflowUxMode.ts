import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '../api/client';

/**
 * 工作流 UX 模式
 *
 * - simple:   只看到和业务直接相关的控件，适合普通运营人员
 * - standard: 核心画布功能和简化配置面板，适合业务专家
 * - expert:   完整功能（当前默认行为），适合技术人员
 */
export type WorkflowUxMode = 'simple' | 'standard' | 'expert';

const WORKFLOW_UX_MODE_TARGET_ID = 'workflow_ux_mode';
const WORKFLOW_UX_MODE_BINDING_TYPE = 'PARAMETER_SET';
const DEFAULT_MODE: WorkflowUxMode = 'standard';

interface WorkflowUxModeState {
    mode: WorkflowUxMode;
    isServerSynced: boolean;
    setMode: (mode: WorkflowUxMode) => void;
    syncFromServer: () => Promise<void>;
}

export const useWorkflowUxMode = create<WorkflowUxModeState>()(
    persist(
        (set, get) => ({
            mode: DEFAULT_MODE,
            isServerSynced: false,

            setMode: (mode: WorkflowUxMode) => {
                set({ mode });
                // 异步同步到后端（upsert），不阻塞 UI
                apiClient
                    .post('/user-config-bindings', {
                        bindingType: WORKFLOW_UX_MODE_BINDING_TYPE,
                        targetId: WORKFLOW_UX_MODE_TARGET_ID,
                        metadata: { value: mode, source: 'workflow-ux-mode-switcher' },
                    })
                    .catch(() => {
                        // 静默失败：后端同步失败不影响本地使用
                    });
            },

            syncFromServer: async () => {
                if (get().isServerSynced) return;
                try {
                    const res = await apiClient.get<{
                        data: Array<{ metadata?: Record<string, unknown> }>;
                    }>('/user-config-bindings', {
                        params: {
                            bindingType: WORKFLOW_UX_MODE_BINDING_TYPE,
                            keyword: WORKFLOW_UX_MODE_TARGET_ID,
                            page: 1,
                            pageSize: 1,
                        },
                    });
                    const serverMode = res.data?.data?.[0]?.metadata?.value;
                    if (
                        serverMode === 'simple' ||
                        serverMode === 'standard' ||
                        serverMode === 'expert'
                    ) {
                        set({ mode: serverMode, isServerSynced: true });
                    } else {
                        set({ isServerSynced: true });
                    }
                } catch {
                    set({ isServerSynced: true });
                }
            },
        }),
        {
            name: 'workflow-ux-mode',
        },
    ),
);

// ─── 快捷判断 Hook ──────────────────────────────────────────
export const useIsSimpleMode = (): boolean => useWorkflowUxMode((s) => s.mode === 'simple');
export const useIsStandardMode = (): boolean => useWorkflowUxMode((s) => s.mode === 'standard');
export const useIsExpertMode = (): boolean => useWorkflowUxMode((s) => s.mode === 'expert');
export const useIsSimpleOrStandard = (): boolean =>
    useWorkflowUxMode((s) => s.mode === 'simple' || s.mode === 'standard');
