import React, { useState } from 'react';
import { Row, Col, theme, Grid } from 'antd';
import { OrgDeptTree, SelectedNode } from './OrgDeptTree';
import { UserCardList } from './UserCardList';
import { UserDetailPanel } from './UserDetailPanel';

// localStorage 键名
const STORAGE_KEY_SHOW_ALL_LEVELS = 'org_user_management_show_all_levels';

/**
 * 组织架构与用户统一管理页面
 *
 * 三栏布局：
 * - 左侧：组织架构树（组织 + 部门）
 * - 中间：用户卡片列表
 * - 右侧：用户详情面板
 */
export const OrgUserManagement: React.FC = () => {
    const { token } = theme.useToken();
    const screens = Grid.useBreakpoint();

    // 状态管理
    const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

    // 从 localStorage 读取开关状态，默认为 false（不显示下级员工）
    const [showAllLevels, setShowAllLevels] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEY_SHOW_ALL_LEVELS);
        return stored === 'true';
    });

    // 当开关变化时保存到 localStorage
    const handleShowAllLevelsChange = (value: boolean) => {
        setShowAllLevels(value);
        localStorage.setItem(STORAGE_KEY_SHOW_ALL_LEVELS, String(value));
    };

    // 处理组织/部门选择
    const handleNodeSelect = (node: SelectedNode | null) => {
        setSelectedNode(node);
        // 切换组织时清空用户选择
        setSelectedUserId(null);
    };

    // 处理用户选择
    const handleUserSelect = (userId: string | null) => {
        setSelectedUserId(userId);
    };

    // 用户被删除后的回调
    const handleUserDeleted = () => {
        setSelectedUserId(null);
    };

    return (
        <Row
            style={{
                height: 'calc(100vh - 112px)',
                overflow: 'hidden',
                background: token.colorBgLayout,
            }}
        >
            {/* 左侧：组织架构树 */}
            <Col
                xs={24}
                sm={24}
                md={8}
                lg={6}
                xl={5}
                style={{ height: '100%' }}
            >
                <OrgDeptTree
                    selectedNode={selectedNode}
                    onSelect={handleNodeSelect}
                    showAllLevels={showAllLevels}
                    onShowAllLevelsChange={handleShowAllLevelsChange}
                />
            </Col>

            {/* 中间：用户卡片列表 */}
            <Col
                xs={24}
                sm={24}
                md={8}
                lg={6}
                xl={5}
                style={{ height: '100%' }}
            >
                <UserCardList
                    selectedNode={selectedNode}
                    selectedUserId={selectedUserId}
                    onSelectUser={handleUserSelect}
                    showAllLevels={showAllLevels}
                />
            </Col>

            {/* 右侧：用户详情面板 */}
            <Col
                xs={24}
                sm={24}
                md={8}
                lg={12}
                xl={14}
                style={{ height: '100%' }}
            >
                <UserDetailPanel
                    userId={selectedUserId}
                    onUserDeleted={handleUserDeleted}
                />
            </Col>
        </Row>
    );
};

export default OrgUserManagement;
