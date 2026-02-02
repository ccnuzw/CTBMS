import { useEffect, useState } from 'react';

export interface VirtualUserInfo {
    id: string;
    name: string;
    email?: string | null;
    username?: string | null;
    avatar?: string | null;
    organizationName?: string | null;
    departmentName?: string | null;
    roleNames?: string[];
    employeeNo?: string | null;
    position?: string | null;
}

export const ADMIN_USER: VirtualUserInfo = {
    id: 'b0000000-0000-0000-0000-000000000001',
    username: 'admin',
    email: 'admin@example.com',
    name: '系统管理员',
    roleNames: ['SUPER_ADMIN'],
    position: '系统管理员',
};

const STORAGE_KEY = 'ctbms_virtual_login_user';
const EVENT_NAME = 'ctbms:virtual-user-changed';

const readVirtualUser = (): VirtualUserInfo | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as VirtualUserInfo;
        if (!parsed?.id || !parsed?.name) return null;
        return parsed;
    } catch {
        return null;
    }
};

export const setVirtualUser = (user: VirtualUserInfo | null) => {
    if (typeof window === 'undefined') return;
    if (user) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
        window.localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: user }));
};

export const useVirtualUser = () => {
    const [user, setUserState] = useState<VirtualUserInfo | null>(() => readVirtualUser());

    useEffect(() => {
        const handleChange = () => setUserState(readVirtualUser());
        const handleStorage = (event: StorageEvent) => {
            if (event.key === STORAGE_KEY) handleChange();
        };

        window.addEventListener(EVENT_NAME, handleChange as EventListener);
        window.addEventListener('storage', handleStorage);

        return () => {
            window.removeEventListener(EVENT_NAME, handleChange as EventListener);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    const currentUser = user || ADMIN_USER;

    return {
        user,
        currentUser,
        isVirtual: !!user,
        setUser: setVirtualUser,
        clear: () => setVirtualUser(null),
    };
};
