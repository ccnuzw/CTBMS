import React from 'react';
import { CronTriggerForm } from './CronTriggerForm';
import { ManualTriggerForm } from './ManualTriggerForm';
import { ApiTriggerForm } from './ApiTriggerForm';
import { MarketDataFetchForm } from './MarketDataFetchForm';
import { RulePackEvalForm } from './RulePackEvalForm';
import { SingleAgentForm } from './SingleAgentForm';
import { DebateRoundForm } from './DebateRoundForm';
import { DecisionMergeForm } from './DecisionMergeForm';
import { JoinForm } from './JoinForm';
import { SubflowCallForm } from './SubflowCallForm';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const NODE_FORM_REGISTRY: Record<string, React.FC<FormProps>> = {
    'cron-trigger': CronTriggerForm,
    'manual-trigger': ManualTriggerForm,
    'api-trigger': ApiTriggerForm,
    'data-fetch': MarketDataFetchForm,
    'market-data-fetch': MarketDataFetchForm,
    'rule-pack-eval': RulePackEvalForm,
    'agent-call': SingleAgentForm,
    'single-agent': SingleAgentForm,
    'debate-round': DebateRoundForm,
    'decision-merge': DecisionMergeForm,
    'join': JoinForm,
    'control-join': JoinForm,
    'subflow-call': SubflowCallForm,
};
