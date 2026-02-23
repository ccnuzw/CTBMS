import { useEffect, useMemo, useState, useCallback } from 'react';
import { App } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import {
    WorkflowDefinitionDto,
    WorkflowDefinitionStatus,
    WorkflowMode,
    WorkflowUsageMethod,
    WorkflowValidationResult,
    WorkflowVersionDto,
    WorkflowDsl,
} from '@packages/types';
import { getErrorMessage } from '../../../../api/client';
import {
    useCreateWorkflowVersion,
    usePreflightWorkflowDsl,
    usePublishWorkflowVersion,
    useTriggerWorkflowExecution,
    useValidateWorkflowDsl,
    useWorkflowDefinitions,
    useWorkflowPublishAudits,
    useWorkflowVersions,
} from '../../api';
import {
    useUpdateWorkflowAgentStrictMode,
    useWorkflowAgentStrictMode,
} from '../../../system-config/api';
import { useDecisionRulePacks } from '../../../workflow-rule-center/api';
import { useParameterSets } from '../../../workflow-parameter-center/api';
import { useAgentProfiles } from '../../../workflow-agent-center/api';
import { useDataConnectors } from '../../../workflow-data-connector/api';
import {
    DependencyLookupItem,
    WorkflowDependencyCheckResult,
    PublishDryRunPreview,
} from './types';
import { checkPublishDependenciesByLookups, isPublished, readBindingCodes, asRecord, extractRulePackCodesFromDsl, extractAgentCodesFromDsl, extractParameterSetCodesFromDsl, classifyDependencyCodes, countDependencyIssues, hasBlockingDependencyIssues } from './utils';

export const useWorkflowDefinitionViewModel = () => {
    const { message } = App.useApp();
    const [createVisible, setCreateVisible] = useState(false);
    const [versionVisible, setVersionVisible] = useState(false);
    const [studioVisible, setStudioVisible] = useState(false);
    const [diffVisible, setDiffVisible] = useState(false);
    const [studioVersion, setStudioVersion] = useState<WorkflowVersionDto | null>(null);
    const [selectedDefinition, setSelectedDefinition] = useState<WorkflowDefinitionDto | null>(null);
    const [publishingVersionId, setPublishingVersionId] = useState<string | null>(null);
    const [runningVersionId, setRunningVersionId] = useState<string | null>(null);
    const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);
    const [auditPage, setAuditPage] = useState(1);
    const [auditPageSize, setAuditPageSize] = useState(10);
    const [auditWorkflowVersionId, setAuditWorkflowVersionId] = useState<string | undefined>();
    const [auditPublisherInput, setAuditPublisherInput] = useState('');
    const [auditPublisher, setAuditPublisher] = useState<string | undefined>();
    const [auditPublishedAtRange, setAuditPublishedAtRange] = useState<[Dayjs, Dayjs] | null>(null);
    const [keywordInput, setKeywordInput] = useState('');
    const [keyword, setKeyword] = useState<string | undefined>();
    const [selectedMode, setSelectedMode] = useState<WorkflowMode | undefined>();
    const [selectedUsageMethod, setSelectedUsageMethod] = useState<WorkflowUsageMethod | undefined>();
    const [selectedStatus, setSelectedStatus] = useState<WorkflowDefinitionStatus | undefined>();
    const [includePublic, setIncludePublic] = useState(true);
    const [definitionPageNumber, setDefinitionPageNumber] = useState(1);
    const [definitionPageSize, setDefinitionPageSize] = useState(20);
    const [publishWizardVersion, setPublishWizardVersion] = useState<WorkflowVersionDto | null>(null);
    const [publishWizardDependencyResult, setPublishWizardDependencyResult] =
        useState<WorkflowDependencyCheckResult | null>(null);
    const [publishWizardValidationResult, setPublishWizardValidationResult] =
        useState<WorkflowValidationResult | null>(null);
    const [publishWizardValidationLoading, setPublishWizardValidationLoading] = useState(false);
    const [publishWizardDependencyRefreshing, setPublishWizardDependencyRefreshing] = useState(false);
    const [publishWizardDryRunLoading, setPublishWizardDryRunLoading] = useState(false);
    const [publishWizardDryRunPreview, setPublishWizardDryRunPreview] =
        useState<PublishDryRunPreview | null>(null);
    const [quickRunnerVisible, setQuickRunnerVisible] = useState(false);
    const [quickRunnerVersion, setQuickRunnerVersion] = useState<WorkflowVersionDto | null>(null);

    const definitionQuery = useMemo(
        () => ({
            keyword,
            mode: selectedMode,
            usageMethod: selectedUsageMethod,
            status: selectedStatus,
            includePublic,
            page: definitionPageNumber,
            pageSize: definitionPageSize,
        }),
        [keyword, selectedMode, selectedUsageMethod, selectedStatus, includePublic, definitionPageNumber, definitionPageSize],
    );

    const { data: definitionPage, isLoading: isDefinitionLoading } = useWorkflowDefinitions(definitionQuery);
    const { data: versions, isLoading: isVersionLoading } = useWorkflowVersions(selectedDefinition?.id);
    const { data: publishAuditPage, isLoading: isPublishAuditLoading } = useWorkflowPublishAudits(
        selectedDefinition?.id,
        {
            workflowVersionId: auditWorkflowVersionId,
            publishedByUserId: auditPublisher,
            publishedAtFrom: auditPublishedAtRange?.[0]?.startOf('day').toDate(),
            publishedAtTo: auditPublishedAtRange?.[1]?.endOf('day').toDate(),
            page: auditPage,
            pageSize: auditPageSize,
        },
    );

    const { data: rulePackCatalog, isLoading: isRulePackLoading, refetch: refetchRulePackCatalog } = useDecisionRulePacks({ includePublic: true, page: 1, pageSize: 500 });
    const { data: parameterSetCatalog, isLoading: isParameterSetLoading, refetch: refetchParameterSetCatalog } = useParameterSets({ includePublic: true, page: 1, pageSize: 500 });
    const { data: agentProfileCatalog, isLoading: isAgentProfileLoading, refetch: refetchAgentProfileCatalog } = useAgentProfiles({ includePublic: true, page: 1, pageSize: 500 });
    const { data: dataConnectorCatalog, isLoading: isDataConnectorLoading } = useDataConnectors({ isActive: true, page: 1, pageSize: 500 });

    const createVersionMutation = useCreateWorkflowVersion();
    const publishMutation = usePublishWorkflowVersion();
    const triggerExecutionMutation = useTriggerWorkflowExecution();
    const validateDslMutation = useValidateWorkflowDsl();
    const preflightDslMutation = usePreflightWorkflowDsl();
    const { data: strictModeSetting, isLoading: strictModeLoading } = useWorkflowAgentStrictMode();
    const updateStrictModeMutation = useUpdateWorkflowAgentStrictMode();


    const rulePackOptions = useMemo(() => (rulePackCatalog?.data || []).filter((pack: any) => pack.isActive).map((pack: any) => ({ label: `${pack.name} (${pack.rulePackCode})`, value: pack.rulePackCode })), [rulePackCatalog?.data]);

    const agentBindingOptions = useMemo(() => (agentProfileCatalog?.data || []).filter((item: any) => item.isActive).map((item: any) => ({ label: `${item.agentName} (${item.agentCode})`, value: item.agentCode })), [agentProfileCatalog?.data]);

    const parameterBindingOptions = useMemo(() => (parameterSetCatalog?.data || []).filter((item: any) => item.isActive).map((item: any) => ({ label: `${item.name} (${item.setCode})`, value: item.setCode })), [parameterSetCatalog?.data]);

    const dataConnectorBindingOptions = useMemo(() => (dataConnectorCatalog?.data || []).filter((item: any) => item.isActive).map((item: any) => ({ label: `${item.connectorName} (${item.connectorCode})`, value: item.connectorCode })), [dataConnectorCatalog?.data]);


    const rulePackCodeMap = useMemo(() => new Map((rulePackCatalog?.data || []).map((item: any) => [item.rulePackCode, item])), [rulePackCatalog?.data]);

    const parameterSetCodeMap = useMemo(() => new Map((parameterSetCatalog?.data || []).map((item: any) => [item.setCode, item])), [parameterSetCatalog?.data]);

    const agentProfileCodeMap = useMemo(() => new Map((agentProfileCatalog?.data || []).map((item: any) => [item.agentCode, item])), [agentProfileCatalog?.data]);

    const dependencyCatalogLoading = isRulePackLoading || isParameterSetLoading || isAgentProfileLoading;

    const checkPublishDependencies = useCallback((dslSnapshot: WorkflowDsl): WorkflowDependencyCheckResult =>
        checkPublishDependenciesByLookups(dslSnapshot, {
            rulePacks: rulePackCodeMap as Map<string, DependencyLookupItem>,
            parameterSets: parameterSetCodeMap as Map<string, DependencyLookupItem>,
            agentProfiles: agentProfileCodeMap as Map<string, DependencyLookupItem>,
        }), [rulePackCodeMap, parameterSetCodeMap, agentProfileCodeMap]);

    useEffect(() => {
        setAuditPage(1);
        setAuditPageSize(10);
        setAuditWorkflowVersionId(undefined);
        setAuditPublisherInput('');
        setAuditPublisher(undefined);
        setAuditPublishedAtRange(null);
        setPublishWizardVersion(null);
        setPublishWizardDependencyResult(null);
        setPublishWizardValidationResult(null);
        setPublishWizardValidationLoading(false);
        setPublishWizardDependencyRefreshing(false);
        setPublishWizardDryRunLoading(false);
        setPublishWizardDryRunPreview(null);
        setQuickRunnerVisible(false);
        setQuickRunnerVersion(null);
    }, [selectedDefinition?.id]);

    const runPublishValidationCheck = async (version: WorkflowVersionDto): Promise<WorkflowValidationResult | null> => {
        setPublishWizardValidationLoading(true);
        try {
            const result = await validateDslMutation.mutateAsync({ dslSnapshot: version.dslSnapshot, stage: 'PUBLISH' });
            setPublishWizardValidationResult(result);
            return result;
        } catch (error) {
            setPublishWizardValidationResult(null);
            message.error(getErrorMessage(error));
            return null;
        } finally {
            setPublishWizardValidationLoading(false);
        }
    };

    const publishVersion = async (version: WorkflowVersionDto): Promise<boolean> => {
        if (!selectedDefinition?.id) return false;
        try {
            setPublishingVersionId(version.id);
            await publishMutation.mutateAsync({
                workflowDefinitionId: selectedDefinition.id,
                payload: { versionId: version.id },
            });
            message.success(`版本 ${version.versionCode} 已发布`);
            return true;
        } catch (error) {
            message.error(getErrorMessage(error));
            return false;
        } finally {
            setPublishingVersionId(null);
        }
    };

    async function handleOpenPublishWizard(version: WorkflowVersionDto) {
        if (!selectedDefinition?.id) return;
        if (dependencyCatalogLoading) {
            message.warning('依赖资源加载中，请稍后再试');
            return;
        }
        const dependencyResult = checkPublishDependencies(version.dslSnapshot);
        setPublishWizardVersion(version);
        setPublishWizardDependencyResult(dependencyResult);
        setPublishWizardValidationResult(null);
        setPublishWizardDryRunPreview(null);
        await runPublishValidationCheck(version);
    }

    const handleRefreshPublishWizardDependencies = async () => {
        if (!publishWizardVersion) return;
        setPublishWizardDependencyRefreshing(true);
        try {
            const [rulePackResult, parameterSetResult, agentProfileResult] = await Promise.all([
                refetchRulePackCatalog(),
                refetchParameterSetCatalog(),
                refetchAgentProfileCatalog(),
            ]);
            const nextDependencyResult = checkPublishDependenciesByLookups(
                publishWizardVersion.dslSnapshot,
                {

                    rulePacks: new Map((rulePackResult.data?.data || []).map((item: any) => [item.rulePackCode, item])) as Map<string, DependencyLookupItem>,

                    parameterSets: new Map((parameterSetResult.data?.data || []).map((item: any) => [item.setCode, item])) as Map<string, DependencyLookupItem>,

                    agentProfiles: new Map((agentProfileResult.data?.data || []).map((item: any) => [item.agentCode, item])) as Map<string, DependencyLookupItem>,
                },
            );
            setPublishWizardDependencyResult(nextDependencyResult);
            setPublishWizardDryRunPreview(null);
            message.success('依赖目录已刷新');
        } catch (error) {
            message.error(getErrorMessage(error));
        } finally {
            setPublishWizardDependencyRefreshing(false);
        }
    };

    const handleConfirmPublishFromWizard = async () => {
        if (!publishWizardVersion) return;
        const latestDependencyResult = checkPublishDependencies(publishWizardVersion.dslSnapshot);
        setPublishWizardDependencyResult(latestDependencyResult);
        if (hasBlockingDependencyIssues(latestDependencyResult)) {
            message.warning('仍存在依赖阻塞，请先处理后再发布');
            return;
        }
        let latestValidationResult = publishWizardValidationResult;
        if (!latestValidationResult || !latestValidationResult.valid) {
            latestValidationResult = await runPublishValidationCheck(publishWizardVersion);
        }
        if (!latestValidationResult?.valid) {
            message.warning('发布校验未通过，请先按提示修复');
            return;
        }
        const published = await publishVersion(publishWizardVersion);
        if (published) {
            setPublishWizardVersion(null);
            setPublishWizardDependencyResult(null);
            setPublishWizardValidationResult(null);
            setPublishWizardValidationLoading(false);
            setPublishWizardDependencyRefreshing(false);
            setPublishWizardDryRunLoading(false);
            setPublishWizardDryRunPreview(null);
        }
    };

    const buildPublishBlockers = (
        dependencyResult: WorkflowDependencyCheckResult,
        validationResult: WorkflowValidationResult | null,
    ): string[] => {
        const blockers: string[] = [];
        const unpublishedCount = countDependencyIssues(dependencyResult.unpublished);
        const unavailableCount = countDependencyIssues(dependencyResult.unavailable);
        if (unpublishedCount > 0 || unavailableCount > 0) {
            blockers.push(`依赖未就绪：待发布 ${unpublishedCount} 项，不可用 ${unavailableCount} 项`);
        }
        if (!validationResult?.valid) {
            blockers.push(`发布校验未通过：${validationResult?.issues.length ?? 0} 项`);
        }
        return blockers;
    };

    const handleRunPublishDryRun = async () => {
        if (!publishWizardVersion) return;
        setPublishWizardDryRunLoading(true);
        try {
            const dependencyResult = checkPublishDependencies(publishWizardVersion.dslSnapshot);
            setPublishWizardDependencyResult(dependencyResult);
            const validationResult = await runPublishValidationCheck(publishWizardVersion);
            const blockers = buildPublishBlockers(dependencyResult, validationResult);
            setPublishWizardDryRunPreview({
                generatedAt: new Date(),
                dependencyResult,
                validationResult,
                blockers,
                readyToPublish: blockers.length === 0,
            });
            message.success(blockers.length === 0 ? '预演通过，可直接发布' : '预演完成，存在待修复项');
        } finally {
            setPublishWizardDryRunLoading(false);
        }
    };

    const handleOpenStudioForPublishWizardVersion = () => {
        if (!publishWizardVersion) return;
        const version = publishWizardVersion;
        setPublishWizardVersion(null);
        setPublishWizardDependencyResult(null);
        setPublishWizardValidationResult(null);
        setPublishWizardValidationLoading(false);
        setPublishWizardDependencyRefreshing(false);
        setPublishWizardDryRunLoading(false);
        setPublishWizardDryRunPreview(null);
        setStudioVersion(version);
        setStudioVisible(true);
    };

    const handleCreateDraftVersion = async () => {
        if (!selectedDefinition?.id) return;
        const latestVersion = versions?.[0];
        if (!latestVersion) {
            message.warning('暂无可复制版本');
            return;
        }
        try {
            await createVersionMutation.mutateAsync({
                workflowDefinitionId: selectedDefinition.id,
                payload: {
                    dslSnapshot: latestVersion.dslSnapshot,
                    changelog: `基于 ${latestVersion.versionCode} 创建草稿`,
                },
            });
            message.success('草稿版本创建成功');
        } catch (error) {
            message.error(getErrorMessage(error));
        }
    };

    const handleSaveStudioDsl = async (dsl: WorkflowDsl) => {
        if (!selectedDefinition?.id || !studioVersion) {
            throw new Error('当前未选择可编辑版本');
        }
        try {
            const mergedDsl = { ...studioVersion.dslSnapshot, ...dsl };
            const preflightResult = await preflightDslMutation.mutateAsync({
                dslSnapshot: mergedDsl,
                stage: 'SAVE',
                autoFixLevel: 'SAFE',
            });
            if (preflightResult.autoFixes.length > 0) {
                message.info(`系统已自动修复 ${preflightResult.autoFixes.length} 项配置`);
            }
            if (!preflightResult.validation.valid) {
                message.warning(`保存前校验未通过，仍有 ${preflightResult.validation.issues.length} 项问题`);
                throw new Error('保存前校验未通过');
            }
            await createVersionMutation.mutateAsync({
                workflowDefinitionId: selectedDefinition.id,
                payload: {
                    dslSnapshot: preflightResult.normalizedDsl,
                    changelog: `Studio 编辑保存（基于 ${studioVersion.versionCode}）`,
                },
            });
            if (preflightResult.autoFixes.length > 0) {
                message.success(`Studio 保存成功，已智能补全 ${preflightResult.autoFixes.length} 项并生成新草稿版本`);
            } else {
                message.success('Studio 保存成功，已生成新的草稿版本');
            }
            setStudioVisible(false);
            setStudioVersion(null);
        } catch (error) {
            message.error(getErrorMessage(error));
            throw error;
        }
    };

    const handleValidateLatestForPublish = async () => {
        const latestVersion = versions?.[0];
        if (!latestVersion) {
            message.warning('暂无可校验版本');
            return;
        }
        try {
            const result = await validateDslMutation.mutateAsync({
                dslSnapshot: latestVersion.dslSnapshot,
                stage: 'PUBLISH',
            });
            setValidationResult(result);
            if (result.valid) {
                message.success('发布校验通过');
            } else {
                message.warning(`发布校验未通过，发现 ${result.issues.length} 项问题`);
            }
        } catch (error) {
            message.error(getErrorMessage(error));
        }
    };

    async function handleTriggerExecution(version: WorkflowVersionDto) {
        if (!selectedDefinition?.id) return;
        try {
            setRunningVersionId(version.id);
            const execution = await triggerExecutionMutation.mutateAsync({
                workflowDefinitionId: selectedDefinition.id,
                workflowVersionId: version.id,
            });
            message.success(`运行完成，实例 ID: ${execution.id}`);
        } catch (error) {
            message.error(getErrorMessage(error));
        } finally {
            setRunningVersionId(null);
        }
    }

    const handleOpenQuickRunner = (version: WorkflowVersionDto) => {
        setQuickRunnerVersion(version);
        setQuickRunnerVisible(true);
    };

    const handleSubmitQuickRunner = async (paramSnapshot: Record<string, unknown>) => {
        if (!selectedDefinition?.id || !quickRunnerVersion) return;
        try {
            setRunningVersionId(quickRunnerVersion.id);
            const execution = await triggerExecutionMutation.mutateAsync({
                workflowDefinitionId: selectedDefinition.id,
                workflowVersionId: quickRunnerVersion.id,
                paramSnapshot, // 透传在前端填写的动态运行参数
            });
            message.success(`已发起带参运行，实例 ID: ${execution.id}`);
            setQuickRunnerVisible(false);
        } catch (error) {
            message.error(getErrorMessage(error));
        } finally {
            setRunningVersionId(null);
        }
    };

    const handleStudioRun = useCallback(async (dsl: WorkflowDsl) => {
        if (!selectedDefinition?.id || !studioVersion) return undefined;
        try {
            const mergedDsl = { ...studioVersion.dslSnapshot, ...dsl };
            const preflightResult = await preflightDslMutation.mutateAsync({
                dslSnapshot: mergedDsl,
                stage: 'SAVE',
                autoFixLevel: 'SAFE',
            });
            if (preflightResult.autoFixes.length > 0) {
                message.info(`系统已自动修复 ${preflightResult.autoFixes.length} 项配置`);
            }
            if (!preflightResult.validation.valid) {
                message.warning(`运行前校验未通过，仍有 ${preflightResult.validation.issues.length} 项问题`);
                return undefined;
            }
            const newVersion = await createVersionMutation.mutateAsync({
                workflowDefinitionId: selectedDefinition.id,
                payload: {
                    dslSnapshot: preflightResult.normalizedDsl,
                    changelog: `Studio 调试运行快照（基于 ${studioVersion.versionCode}）`,
                },
            });
            setStudioVersion(newVersion);
            const execution = await triggerExecutionMutation.mutateAsync({
                workflowDefinitionId: selectedDefinition.id,
                workflowVersionId: newVersion.id,
            });
            message.success(`已发起运行: ${execution.id}`);
            return execution.id;
        } catch (error) {
            message.error(getErrorMessage(error));
            return undefined;
        }
    }, [selectedDefinition?.id, studioVersion, createVersionMutation, preflightDslMutation, triggerExecutionMutation, message]);

    const handleStudioValidate = useCallback(async (dsl: WorkflowDsl) => {
        const preflightResult = await preflightDslMutation.mutateAsync({
            dslSnapshot: dsl,
            stage: 'SAVE',
            autoFixLevel: 'SAFE',
        });
        return preflightResult.validation;
    }, [preflightDslMutation]);

    const handleStrictModeChange = async (checked: boolean) => {
        try {
            await updateStrictModeMutation.mutateAsync(checked);
            message.success(
                checked
                    ? '已开启严格模式：鉴权失败将直接标记为 FAILED'
                    : '已关闭严格模式：鉴权失败将按降级策略继续',
            );
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '保存失败';
            message.error(errorMessage);
        }
    };

    return {
        state: {
            createVisible, setCreateVisible,
            versionVisible, setVersionVisible,
            studioVisible, setStudioVisible,
            diffVisible, setDiffVisible,
            studioVersion, setStudioVersion,
            selectedDefinition, setSelectedDefinition,
            validationResult, setValidationResult,
            keywordInput, setKeywordInput,
            keyword, setKeyword,
            selectedMode, setSelectedMode,
            selectedUsageMethod, setSelectedUsageMethod,
            selectedStatus, setSelectedStatus,
            includePublic, setIncludePublic,
            definitionPageNumber, setDefinitionPageNumber,
            definitionPageSize, setDefinitionPageSize,
            auditPage, setAuditPage,
            auditPageSize, setAuditPageSize,
            auditWorkflowVersionId, setAuditWorkflowVersionId,
            auditPublisherInput, setAuditPublisherInput,
            auditPublisher, setAuditPublisher,
            auditPublishedAtRange, setAuditPublishedAtRange,
            publishWizardVersion, setPublishWizardVersion,
            publishWizardDependencyResult, setPublishWizardDependencyResult,
            publishWizardValidationResult, setPublishWizardValidationResult,
            publishWizardValidationLoading, setPublishWizardValidationLoading,
            publishWizardDependencyRefreshing, setPublishWizardDependencyRefreshing,
            publishWizardDryRunLoading, setPublishWizardDryRunLoading,
            publishWizardDryRunPreview, setPublishWizardDryRunPreview,
            publishingVersionId, setPublishingVersionId,
            runningVersionId, setRunningVersionId,
            quickRunnerVisible, setQuickRunnerVisible,
            quickRunnerVersion, setQuickRunnerVersion,
        },
        queries: {
            definitionPage, isDefinitionLoading,
            versions, isVersionLoading,
            publishAuditPage, isPublishAuditLoading,
            rulePackCatalog, isRulePackLoading,
            parameterSetCatalog, isParameterSetLoading,
            agentProfileCatalog, isAgentProfileLoading,
            dataConnectorCatalog, isDataConnectorLoading,
            strictModeSetting, strictModeLoading,
            dependencyCatalogLoading,
        },
        options: {
            rulePackOptions, agentBindingOptions, parameterBindingOptions, dataConnectorBindingOptions
        },
        actions: {
            handleOpenPublishWizard,
            handleRefreshPublishWizardDependencies,
            handleConfirmPublishFromWizard,
            handleRunPublishDryRun,
            handleOpenStudioForPublishWizardVersion,
            handleCreateDraftVersion,
            handleSaveStudioDsl,
            handleValidateLatestForPublish,
            handleTriggerExecution,
            handleOpenQuickRunner,
            handleSubmitQuickRunner,
            handleStudioRun,
            handleStudioValidate,
            handleStrictModeChange,
            checkPublishDependencies,
            runPublishValidationCheck,
        },
        mutations: {
            publishMutation,
            triggerExecutionMutation,
            createVersionMutation,
            validateDslMutation,
            preflightDslMutation,
            updateStrictModeMutation,
        }
    };
};
