import { Empty, Spin } from 'antd';
import { PageContainer } from '@ant-design/pro-components';
import { useEffect } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useResolveLegacyKnowledge } from '../api/knowledge-hooks';

type Props = {
  source?: 'intel' | 'report';
};

export const LegacyKnowledgeRedirectPage: React.FC<Props> = ({ source: sourceProp }) => {
  const { source: sourceParam, id } = useParams<{ source?: 'intel' | 'report'; id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const source = sourceProp || sourceParam;
  const navigate = useNavigate();
  const { data, isLoading } = useResolveLegacyKnowledge(source, id);

  useEffect(() => {
    if (data?.id) {
      const state = (location.state as { from?: string; returnTo?: string } | null) || null;
      const from = searchParams.get('from') || state?.from;
      const returnTo =
        state?.returnTo ||
        (from === 'workbench'
          ? '/intel/knowledge?tab=workbench'
          : from === 'dashboard'
            ? '/intel/knowledge/dashboard?from=dashboard'
            : undefined);
      navigate(`/intel/knowledge/items/${data.id}`, {
        replace: true,
        state: from ? { from, ...(returnTo ? { returnTo } : {}) } : undefined,
      });
    }
  }, [data, navigate, searchParams, location.state]);

  if (isLoading) {
    return (
      <PageContainer>
        <div style={{ textAlign: 'center', padding: 120 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Empty description="未找到对应知识条目，请先执行回填" />
    </PageContainer>
  );
};
