
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useMachine } from '@xstate/react';
import { theme } from 'antd';
import { wizardMachine } from './wizard.machine';
import { Step3_Knowledge } from './components/Step3_Knowledge';
import { Step4_Playground } from './components/Step4_Playground';
import { Step1_PersonaSelection } from './components/Step1_PersonaSelection';
import { Step2_CredentialBinding } from './components/Step2_CredentialBinding';

export const WizardLayout = () => {
    const { token } = theme.useToken();
    const [state, send] = useMachine(wizardMachine);
    const stateSnapshot = state as any;
    const { data: personas } = useQuery(['agent-personas'], async () => {
        const res = await axios.get<any[]>('/api/agent-personas');
        return res.data;
    });

    return (
        <div style={{ maxWidth: 800, margin: '40px auto', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: token.colorBgLayout, padding: '10px 20px', borderBottom: '1px solid #ddd' }}>
                <strong>Wizard State:</strong> {JSON.stringify(state.value)}
            </div>

            <div style={{ minHeight: 400 }}>
                {(stateSnapshot.matches('personaSelection') || stateSnapshot.matches('creatingSession')) && (
                    <Step1_PersonaSelection
                        selectedId={stateSnapshot.context.selectedPersona}
                        onSelect={(id) => send({ type: 'SELECT_PERSONA', personaId: id })}
                        isLoading={stateSnapshot.matches('creatingSession')}
                    />
                )}

                {stateSnapshot.matches('credentialBinding') && (
                    <Step2_CredentialBinding
                        selectedPersona={personas?.find(p => p.personaCode === stateSnapshot.context.selectedPersona)}
                        currentKeys={stateSnapshot.context.apiKeys || {}}
                        onBack={() => send({ type: 'BACK' })}
                        onSubmit={(keys) => send({ type: 'SUBMIT_KEY', keys })} // Will update machine to accept object
                    />
                )}

                {stateSnapshot.matches('knowledgeUpload') && (
                    <Step3_Knowledge
                        files={stateSnapshot.context.files}
                        onBack={() => send({ type: 'BACK' })}
                        onSubmit={(files) => send({ type: 'UPLOAD_FILES', files })}
                    />
                )}

                {(stateSnapshot.matches('creatingAgent') || stateSnapshot.matches('playground')) && (
                    <Step4_Playground
                        sessionId={stateSnapshot.context.sessionId!}
                        onReset={() => send({ type: 'RESET' })}
                    />
                )}
            </div>
        </div>
    );
};
