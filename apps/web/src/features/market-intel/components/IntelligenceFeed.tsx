/**
 * IntelligenceFeed - B类情报流看板
 * 
 * 该组件已重构为企业级情报中枢，使用新的 intel-feed 模块。
 * 保留此文件作为向后兼容的入口点。
 */

import React from 'react';
import { IntelFeedDashboard } from './intel-feed';

export const IntelligenceFeed: React.FC = () => {
    return <IntelFeedDashboard />;
};

export default IntelligenceFeed;
