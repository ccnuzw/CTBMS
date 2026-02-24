import React, { useState } from 'react';
import { Segmented, Space } from 'antd';
import { ExperimentEvaluationPage } from './ExperimentEvaluationPage';
import { ExecutionAnalyticsDashboard } from '../../execution-analytics/components/ExecutionAnalyticsDashboard';

type ExperimentAnalyticsView = 'experiments' | 'analytics';

export const ExperimentAnalyticsHubPage: React.FC = () => {
  const [activeView, setActiveView] = useState<ExperimentAnalyticsView>('experiments');

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Segmented
        options={[
          { label: '灰度实验', value: 'experiments' },
          { label: '执行分析', value: 'analytics' },
        ]}
        value={activeView}
        onChange={(value) => setActiveView(value as ExperimentAnalyticsView)}
      />

      {activeView === 'experiments' ? <ExperimentEvaluationPage /> : <ExecutionAnalyticsDashboard />}
    </Space>
  );
};
