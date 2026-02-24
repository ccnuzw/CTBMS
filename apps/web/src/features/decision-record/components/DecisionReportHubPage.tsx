import React, { useState } from 'react';
import { Segmented, Space } from 'antd';
import { DecisionRecordPage } from './DecisionRecordPage';
import { ReportExportPage } from '../../report-export/components/ReportExportPage';

type DecisionReportView = 'decisions' | 'exports';

export const DecisionReportHubPage: React.FC = () => {
  const [activeView, setActiveView] = useState<DecisionReportView>('decisions');

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Segmented
        options={[
          { label: '决策记录', value: 'decisions' },
          { label: '报告导出', value: 'exports' },
        ]}
        value={activeView}
        onChange={(value) => setActiveView(value as DecisionReportView)}
      />

      {activeView === 'decisions' ? <DecisionRecordPage /> : <ReportExportPage />}
    </Space>
  );
};
