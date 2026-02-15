import assert from 'node:assert/strict';
import type { WorkflowNode } from '@packages/types';
import { RiskGateNodeExecutor } from '../modules/workflow-execution/engine/node-executors/risk-gate.executor';

type ExecuteOptions = {
    config?: Record<string, unknown>;
    input?: Record<string, unknown>;
    paramSnapshot?: Record<string, unknown>;
};

const baseNode: WorkflowNode = {
    id: 'n_risk_gate_contract',
    type: 'risk-gate',
    name: '风险闸门',
    enabled: true,
    config: {
        riskProfileCode: 'CORN_RISK_CONTRACT',
    },
};

const executeRiskGate = async (options: ExecuteOptions = {}) => {
    const executor = new RiskGateNodeExecutor();
    return executor.execute({
        executionId: 'exec_contract_smoke',
        triggerUserId: 'u_contract_smoke',
        node: {
            ...baseNode,
            config: {
                ...baseNode.config,
                ...(options.config || {}),
            },
        },
        input: options.input || {},
        paramSnapshot: options.paramSnapshot,
    });
};

async function main() {
    const configThresholdWins = await executeRiskGate({
        config: {
            blockWhenRiskGte: 'HIGH',
        },
        input: {
            riskLevel: 'HIGH',
        },
        paramSnapshot: {
            params: {
                SIGNAL_BLOCK_RISK_GTE: 'EXTREME',
            },
        },
    });
    assert.equal(configThresholdWins.output.threshold, 'HIGH');
    assert.equal(configThresholdWins.output.riskGateBlocked, true);

    const customThresholdParamWins = await executeRiskGate({
        config: {
            thresholdParamCode: 'CUSTOM_BLOCK_THRESHOLD',
        },
        input: {
            riskLevel: 'HIGH',
        },
        paramSnapshot: {
            params: {
                CUSTOM_BLOCK_THRESHOLD: 'EXTREME',
                SIGNAL_BLOCK_RISK_GTE: 'LOW',
            },
        },
    });
    assert.equal(customThresholdParamWins.output.threshold, 'EXTREME');
    assert.equal(customThresholdParamWins.output.riskGateBlocked, false);

    const chineseRiskAndThreshold = await executeRiskGate({
        config: {
            blockWhenRiskGte: '高',
        },
        input: {
            riskLevel: '高',
        },
    });
    assert.equal(chineseRiskAndThreshold.output.riskLevel, 'HIGH');
    assert.equal(chineseRiskAndThreshold.output.threshold, 'HIGH');
    assert.equal(chineseRiskAndThreshold.output.riskGateBlocked, true);

    const numericRiskAndThreshold = await executeRiskGate({
        config: {
            blockWhenRiskGte: 3,
        },
        input: {
            riskLevel: 2,
        },
    });
    assert.equal(numericRiskAndThreshold.output.riskLevel, 'MEDIUM');
    assert.equal(numericRiskAndThreshold.output.threshold, 'HIGH');
    assert.equal(numericRiskAndThreshold.output.riskGateBlocked, false);

    const softBlockWithDegradeAction = await executeRiskGate({
        config: {
            blockWhenRiskGte: 'HIGH',
            degradeAction: 'REDUCE',
            hardBlock: false,
        },
        input: {
            riskLevel: 'HIGH',
        },
    });
    assert.equal(softBlockWithDegradeAction.status, 'SUCCESS');
    assert.equal(softBlockWithDegradeAction.output.riskGateBlocked, true);
    assert.equal(softBlockWithDegradeAction.output.degradeAction, 'REDUCE');

    const hardBlockWithDegradeAction = await executeRiskGate({
        config: {
            blockWhenRiskGte: 'HIGH',
            degradeAction: 'REVIEW_ONLY',
            hardBlock: true,
        },
        input: {
            riskLevel: 'EXTREME',
        },
    });
    assert.equal(hardBlockWithDegradeAction.status, 'FAILED');
    assert.equal(hardBlockWithDegradeAction.output.riskGateBlocked, true);
    assert.equal(hardBlockWithDegradeAction.output.degradeAction, 'REVIEW_ONLY');

    const passShouldClearDegradeAction = await executeRiskGate({
        config: {
            blockWhenRiskGte: 'EXTREME',
            degradeAction: 'HOLD',
        },
        input: {
            riskLevel: 'MEDIUM',
        },
    });
    assert.equal(passShouldClearDegradeAction.status, 'SUCCESS');
    assert.equal(passShouldClearDegradeAction.output.riskGateBlocked, false);
    assert.equal(passShouldClearDegradeAction.output.degradeAction, null);

    const blockerRuleSemantics = await executeRiskGate({
        config: {
            blockWhenRiskGte: 'EXTREME',
            blockerRules: ['flags.allowBlock', 'flags.noneValue', 'flags.score'],
        },
        input: {
            riskLevel: 'LOW',
            flags: {
                allowBlock: true,
                noneValue: 'none',
                score: 1,
            },
        },
    });
    assert.equal(blockerRuleSemantics.output.riskGateBlocked, true);
    assert.deepEqual(blockerRuleSemantics.output.blockers, ['flags.allowBlock', 'flags.score']);
    assert.equal(blockerRuleSemantics.output.blockerCount, 2);

    const summarySchemaVersion = blockerRuleSemantics.output.summarySchemaVersion;
    assert.equal(summarySchemaVersion, '1.0');

    console.log('RiskGate contract smoke checks passed.');
}

main().catch((error) => {
    console.error('RiskGate contract smoke checks failed:', error);
    process.exitCode = 1;
});
