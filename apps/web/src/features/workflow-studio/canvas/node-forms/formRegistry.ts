import React from 'react';
import { CronTriggerForm } from './CronTriggerForm';
import { ManualTriggerForm } from './ManualTriggerForm';
import { ApiTriggerForm } from './ApiTriggerForm';
import { EventTriggerForm } from './EventTriggerForm'; // New
import { MarketDataFetchForm } from './MarketDataFetchForm';
import { KnowledgeFetchForm } from './KnowledgeFetchForm';
import { ReportFetchForm } from './ReportFetchForm';
import { RulePackEvalForm } from './RulePackEvalForm';
import { RuleEvalForm } from './RuleEvalForm'; // New
import { SingleAgentForm } from './SingleAgentForm';
import { DebateRoundForm } from './DebateRoundForm';
import { DecisionMergeForm } from './DecisionMergeForm';
import { JoinForm } from './JoinForm';
import { SubflowCallForm } from './SubflowCallForm';
import { RiskGateForm } from './RiskGateForm'; // New
import { ApprovalForm } from './ApprovalForm'; // New
import { NotifyForm } from './NotifyForm'; // New
import { FormulaCalcForm } from './FormulaCalcForm'; // New
import { FeatureCalcForm } from './FeatureCalcForm'; // New
import { QuantileCalcForm } from './QuantileCalcForm'; // New
import { ContextBuilderForm } from './ContextBuilderForm'; // New
import { JudgeAgentForm } from './JudgeAgentForm'; // New
import { AlertCheckForm } from './AlertCheckForm'; // New
import { ReportGenerateForm } from './ReportGenerateForm';
import { DashboardPublishForm } from './DashboardPublishForm';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
    currentNodeId?: string;
}

export const NODE_FORM_REGISTRY: Record<string, React.FC<FormProps>> = {
    'cron-trigger': CronTriggerForm,
    'manual-trigger': ManualTriggerForm,
    'api-trigger': ApiTriggerForm,
    'event-trigger': EventTriggerForm, // New
    'data-fetch': MarketDataFetchForm,
    'market-data-fetch': MarketDataFetchForm,
    'knowledge-fetch': KnowledgeFetchForm,
    'report-fetch': ReportFetchForm,
    'rule-pack-eval': RulePackEvalForm,
    'rule-eval': RuleEvalForm,
    'agent-call': SingleAgentForm,
    'single-agent': SingleAgentForm,
    'debate-round': DebateRoundForm,
    'decision-merge': DecisionMergeForm,
    'join': JoinForm,
    'control-join': JoinForm,
    'subflow-call': SubflowCallForm,

    // Phase 8C New Forms
    'risk-gate': RiskGateForm,
    'approval': ApprovalForm,
    'notify': NotifyForm,
    'formula-calc': FormulaCalcForm,
    'feature-calc': FeatureCalcForm,
    'quantile-calc': QuantileCalcForm,
    'alert-check': AlertCheckForm,
    'context-builder': ContextBuilderForm,
    'judge-agent': JudgeAgentForm,
    'report-generate': ReportGenerateForm,
    'dashboard-publish': DashboardPublishForm,
};
