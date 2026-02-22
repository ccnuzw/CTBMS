import React from 'react';
import { Card, Typography, theme } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { SearchResultDetail } from './SearchResultDetail';
import { useUniversalSearchViewModel } from './universal-search/useUniversalSearchViewModel';
import { UniversalSearchHeader } from './universal-search/UniversalSearchHeader';
import { UniversalSearchStats } from './universal-search/UniversalSearchStats';
import { UniversalSearchOverview } from './universal-search/UniversalSearchOverview';
import { UniversalSearchColumns } from './universal-search/UniversalSearchColumns';
import { highlightKeywords } from './universal-search/utils';

const { Title } = Typography;

export const UniversalSearch: React.FC = () => {
  const { token } = theme.useToken();
  const viewModel = useUniversalSearchViewModel();

  const {
    state: { hasResults, selectedItem, debouncedQuery },
    actions: { setSelectedItem }
  } = viewModel;

  return (
    <>
      <div style={{ height: '100%', overflow: 'auto', padding: '32px 24px', background: token.colorBgLayout }}>
        <UniversalSearchHeader viewModel={viewModel} />

        {hasResults ? (
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <UniversalSearchStats viewModel={viewModel} />
            <UniversalSearchOverview viewModel={viewModel} />
            <UniversalSearchColumns viewModel={viewModel} />
          </div>
        ) : (
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <Card style={{ textAlign: 'center', padding: 48 }}>
              <SearchOutlined style={{ fontSize: 64, color: token.colorTextQuaternary, marginBottom: 16 }} />
              <Title level={4} type="secondary">输入关键词，开始全维度检索...</Title>
            </Card>
          </div>
        )}
      </div>

      <SearchResultDetail
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        item={selectedItem!}
        highlightKeywords={(text: string, keywords: string) => highlightKeywords(text, keywords, token.colorWarningBg)}
        keywords={debouncedQuery}
      />
    </>
  );
};

export default UniversalSearch;
