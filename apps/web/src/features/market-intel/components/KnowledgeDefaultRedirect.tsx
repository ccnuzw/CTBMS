import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Handles backward compatibility for old ?tab= query parameters
 * Redirects to the new route structure
 */
export const KnowledgeDefaultRedirect: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    useEffect(() => {
        const tab = searchParams.get('tab');

        if (tab === 'workbench') {
            navigate('/intel/knowledge/workbench', { replace: true });
        } else if (tab === 'library') {
            // Preserve other params like content=reports
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('tab');
            const search = newParams.toString();
            navigate(`/intel/knowledge/items${search ? `?${search}` : ''}`, { replace: true });
        } else if (tab === 'dashboard') {
            navigate('/intel/knowledge/dashboard', { replace: true });
        } else {
            // Default fallback
            navigate('/intel/knowledge/workbench', { replace: true });
        }
    }, [navigate, searchParams]);

    return null;
};
