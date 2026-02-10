import assert from 'node:assert/strict';
import type { WorkflowNode } from '@packages/types';
import { RiskGateNodeExecutor } from '../modules/workflow-execution/engine/node-executors/risk-gate.executor';

type ExecuteOptions = {
    config?: Record<string, unknown>;
    input?: Record<string, unknown>;
    paramSnapshot?: Record<string, unknown>;
};

const baseNode: WorkflowNode = {
    id: 'n_risk_gate',
    type: 'risk-gate',
    name: '风险闸门',
    enabled: true,
    config: {
        riskProfileCode: 'CORN_RISK_BASE',
    },
};

async function executeRiskGate(options: ExecuteOptions = {}) {
    const executor = new RiskGateNodeExecutor();
    return executor.execute({
        executionId: 'exec_smoke',
        triggerUserId: 'u_smoke',
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
}

async function main() {
    const basicBlocked = await executeRiskGate({
        config: { blockWhenRiskGte: 'HIGH' },
        input: { riskLevel: 'HIGH' },
    });
    assert.equal(basicBlocked.status, 'SUCCESS');
    assert.equal(basicBlocked.output.summarySchemaVersion, '1.0');
    assert.equal(basicBlocked.output.riskGateBlocked, true);
    assert.equal(basicBlocked.output.riskGatePassed, false);
    assert.equal(basicBlocked.output.threshold, 'HIGH');
    assert.equal(basicBlocked.output.blockedByRiskLevel, true);

    const snapshotThresholdPass = await executeRiskGate({
        input: { riskLevel: 'HIGH' },
        paramSnapshot: {
            resolvedParams: {
                SIGNAL_BLOCK_RISK_GTE: {
                    value: 'EXTREME',
                },
            },
        },
    });
    assert.equal(snapshotThresholdPass.output.riskGateBlocked, false);
    assert.equal(snapshotThresholdPass.output.riskGatePassed, true);
    assert.equal(snapshotThresholdPass.output.threshold, 'EXTREME');

    const blockerRuleBlocked = await executeRiskGate({
        config: { blockerRules: ['flags.forceBlock'] },
        input: {
            riskLevel: 'LOW',
            flags: { forceBlock: true },
        },
    });
    assert.equal(blockerRuleBlocked.output.riskGateBlocked, true);
    assert.deepEqual(blockerRuleBlocked.output.blockers, ['flags.forceBlock']);
    assert.equal(blockerRuleBlocked.output.blockerCount, 1);

    const hardBlockFailed = await executeRiskGate({
        config: { blockWhenRiskGte: 'HIGH', hardBlock: true },
        input: { riskLevel: 'EXTREME' },
    });
    assert.equal(hardBlockFailed.status, 'FAILED');
    assert.equal(hardBlockFailed.output.riskGateBlocked, true);
    assert.equal(hardBlockFailed.output.hardBlock, true);

    const chineseThresholdBlocked = await executeRiskGate({
        input: { riskLevel: 'HIGH' },
        paramSnapshot: {
            params: {
                SIGNAL_BLOCK_RISK_GTE: '高',
            },
        },
    });
    assert.equal(chineseThresholdBlocked.output.riskGateBlocked, true);

    console.log('RiskGate smoke checks passed.');
}

main().catch((error) => {
    console.error('RiskGate smoke checks failed:', error);
    process.exitCode = 1;
});
