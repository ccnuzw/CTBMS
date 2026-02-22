
// @ts-nocheck
import { createActor } from 'xstate';
import { wizardMachine } from './wizard.machine';

async function main() {
    console.log('--- Starting Wizard State Machine Test ---');

    const actor = createActor(wizardMachine);
    actor.start();

    // Helper to log state
    const logState = () => console.log(`[Current State]: ${JSON.stringify(actor.getSnapshot().value)} | Context: ${JSON.stringify(actor.getSnapshot().context)}`);

    logState();

    // 1. Select Persona
    console.log('\n> Sending SELECT_PERSONA event...');
    actor.send({ type: 'SELECT_PERSONA', personaId: 'Crypto Analyst' });
    logState();

    if (actor.getSnapshot().matches('credentialBinding') && actor.getSnapshot().context.selectedPersona === 'Crypto Analyst') {
        console.log('✅ PASS: Transitioned to credentialBinding');
    } else {
        console.error('❌ FAIL: Did not transition to credentialBinding');
    }

    // 2. Submit API Key
    console.log('\n> Sending SUBMIT_KEY event...');
    actor.send({ type: 'SUBMIT_KEY', keys: { 'openai': 'sk-12345' } });
    logState();

    if (actor.getSnapshot().matches('knowledgeUpload') && actor.getSnapshot().context.apiKeys['openai'] === 'sk-12345') {
        console.log('✅ PASS: Transitioned to knowledgeUpload');
    } else {
        console.error('❌ FAIL: Did not transition to knowledgeUpload');
    }

    // 3. Upload Files
    console.log('\n> Sending UPLOAD_FILES event...');
    actor.send({ type: 'UPLOAD_FILES', files: ['data.pdf'] });
    logState();

    // 4. Next -> Playground
    console.log('\n> Sending NEXT event...');
    actor.send({ type: 'NEXT' });
    logState();

    if (actor.getSnapshot().matches('playground')) {
        console.log('✅ PASS: Transitioned to playground');
    } else {
        console.error('❌ FAIL: Did not transition to playground');
    }

    console.log('\n--- Test Complete ---');
}

main();
