
import { setup, assign, fromPromise } from 'xstate';
import axios from 'axios';

export interface WizardContext {
    selectedPersona: any | null; // Full Persona Object
    sessionId: string | null;
    apiKeys: Record<string, string>;
    files: string[];
}

export type WizardEvent =
    | { type: 'SELECT_PERSONA'; personaId: string }
    | { type: 'SUBMIT_KEY'; keys: Record<string, string> }
    | { type: 'SKIP_KEY' }
    | { type: 'UPLOAD_FILES'; files: string[] }
    | { type: 'NEXT' }
    | { type: 'BACK' }
    | { type: 'RESET' };

export const wizardMachine = setup({
    types: {
        context: {} as WizardContext,
        events: {} as WizardEvent,
    },
    actors: {
        createSession: fromPromise(async ({ input }: { input: { personaId: string } }) => {
            // For MVP without full Auth context, we mock or try real call if server runs
            const res = await axios.post('/api/wizard/session', {
                userId: 'USER-1',
                personaCode: input.personaId
            });
            return res.data;
        }),
        createAgent: fromPromise(async ({ input }: { input: { sessionId: string } }) => {
            const res = await axios.post(`/api/wizard/session/${input.sessionId}/finalize`);
            return res.data;
        }),
    },
    actions: {
        assignPersona: assign({
            selectedPersona: ({ event }) => {
                if (event.type !== 'SELECT_PERSONA') return null;
                return event.personaId;
            }
        }),
        assignSession: assign({
            sessionId: ({ event }) => (event as any).output?.id
        }),
        assignKeys: assign({
            apiKeys: ({ event }) => {
                if (event.type !== 'SUBMIT_KEY') return {};
                return event.keys;
            }
        }),
        assignFiles: assign({
            files: ({ event }) => {
                if (event.type !== 'UPLOAD_FILES') return [];
                return event.files;
            }
        }),
        resetContext: assign({
            selectedPersona: ({ event }) => null,
            sessionId: ({ event }) => null,
            apiKeys: ({ event }) => ({}),
            files: ({ event }) => [],
        })
    }
}).createMachine({
    id: 'agentWizard',
    initial: 'personaSelection',
    context: {
        selectedPersona: null,
        sessionId: null,
        apiKeys: {},
        files: [],
    },
    states: {
        personaSelection: {
            on: {
                SELECT_PERSONA: {
                    target: 'creatingSession',
                    actions: 'assignPersona',
                },
            },
        },
        creatingSession: {
            invoke: {
                id: 'createSession',
                src: 'createSession',
                input: ({ context }) => ({ personaId: context.selectedPersona }),
                onDone: {
                    target: 'credentialBinding',
                    actions: 'assignSession',
                },
                onError: {
                    target: 'personaSelection',
                    // actions: log error
                }
            }
        },
        credentialBinding: {
            on: {
                SUBMIT_KEY: {
                    target: 'knowledgeUpload',
                    actions: 'assignKeys',
                },
                SKIP_KEY: 'knowledgeUpload',
                BACK: 'personaSelection',
            },
        },
        knowledgeUpload: {
            on: {
                UPLOAD_FILES: {
                    target: 'creatingAgent',
                    actions: 'assignFiles',
                },
                NEXT: 'creatingAgent', // Keep for skipped uploads if needed
                BACK: 'credentialBinding',
            },
        },
        creatingAgent: {
            invoke: {
                id: 'createAgent',
                src: 'createAgent',
                input: ({ context }) => ({ sessionId: context.sessionId! }),
                onDone: {
                    target: 'playground',
                    // We could store agentId if needed, but Playground handles fetching or we just let it be
                },
                onError: {
                    target: 'knowledgeUpload',
                }
            }
        },
        playground: {
            on: {
                RESET: {
                    target: 'personaSelection',
                    actions: 'resetContext',
                },
            },
        },
    },
});
