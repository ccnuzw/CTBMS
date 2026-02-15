import { useEffect, useState } from 'react';

export interface WorkflowNodeTemplate {
    id: string;
    name: string;
    nodeType: string;
    description?: string;
    createdAt: string;
    data: {
        type: string;
        name: string;
        config: Record<string, unknown>;
        runtimePolicy?: Record<string, unknown>;
        inputBindings?: Record<string, unknown>;
        outputSchema?: string | Record<string, unknown>;
        enabled?: boolean;
    };
}

const STORAGE_KEY = 'ctbms.workflow-studio.node-templates.v1';
const EVENT_NAME = 'ctbms:workflow-node-templates-updated';

const safeParseTemplates = (raw: string | null): WorkflowNodeTemplate[] => {
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter((item) => item && typeof item === 'object') as WorkflowNodeTemplate[];
    } catch {
        return [];
    }
};

export const listNodeTemplates = (): WorkflowNodeTemplate[] => {
    if (typeof window === 'undefined') {
        return [];
    }
    return safeParseTemplates(window.localStorage.getItem(STORAGE_KEY));
};

const writeTemplates = (templates: WorkflowNodeTemplate[]) => {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
};

export const saveNodeTemplate = (
    payload: Omit<WorkflowNodeTemplate, 'id' | 'createdAt'>,
): WorkflowNodeTemplate => {
    const templates = listNodeTemplates();
    const template: WorkflowNodeTemplate = {
        ...payload,
        id: `node_tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
    };
    writeTemplates([template, ...templates].slice(0, 100));
    return template;
};

export const removeNodeTemplate = (id: string) => {
    const next = listNodeTemplates().filter((item) => item.id !== id);
    writeTemplates(next);
};

export const useNodeTemplates = (): WorkflowNodeTemplate[] => {
    const [templates, setTemplates] = useState<WorkflowNodeTemplate[]>(() => listNodeTemplates());

    useEffect(() => {
        const sync = () => setTemplates(listNodeTemplates());
        window.addEventListener(EVENT_NAME, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(EVENT_NAME, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    return templates;
};
