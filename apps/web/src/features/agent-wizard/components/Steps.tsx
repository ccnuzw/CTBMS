
import React from 'react';

export const Step1_Persona = ({ onSelect }: { onSelect: (id: string) => void }) => (
    <div style={{ padding: 20 }}>
        <h2>Select a Persona</h2>
        <div style={{ display: 'flex', gap: 10 }}>
            {['Crypto Analyst', 'Legal Advisor', 'Copywriter'].map(p => (
                <button key={p} onClick={() => onSelect(p)} style={{ padding: '10px 20px', cursor: 'pointer' }}>
                    {p}
                </button>
            ))}
        </div>
    </div>
);

export const Step2_Credential = ({ onSubmit, onSkip, onBack }: { onSubmit: (k: string) => void, onSkip: () => void, onBack: () => void }) => {
    const [key, setKey] = React.useState('');
    return (
        <div style={{ padding: 20 }}>
            <h2>Connect Credentials</h2>
            <input
                type="text"
                placeholder="Enter API Key"
                value={key}
                onChange={e => setKey(e.target.value)}
                style={{ padding: 5, marginRight: 10 }}
            />
            <button onClick={() => onSubmit(key)}>Connect</button>
            <button onClick={onSkip} style={{ marginLeft: 10 }}>Skip</button>
            <button onClick={onBack} style={{ marginLeft: 10 }}>Back</button>
        </div>
    );
};

export const Step3_Knowledge = ({ onUpload, onBack }: { onUpload: (files: string[]) => void, onBack: () => void }) => (
    <div style={{ padding: 20 }}>
        <h2>Upload Knowledge</h2>
        <div style={{ border: '2px dashed #ccc', padding: 40, textAlign: 'center' }} onClick={() => onUpload(['report.pdf'])}>
            Click to simulate uploading "report.pdf"
        </div>
        <button onClick={onBack} style={{ marginTop: 20 }}>Back</button>
    </div>
);

export const Step4_Playground = ({ context, onReset }: { context: any, onReset: () => void }) => (
    <div style={{ padding: 20 }}>
        <h2>Sandbox Playground</h2>
        <pre>{JSON.stringify(context, null, 2)}</pre>
        <div style={{ marginTop: 20, padding: 20, background: '#f0f0f0' }}>
            Bot: Hello! I am your {context.selectedPersona}. How can I help?
        </div>
        <button onClick={onReset} style={{ marginTop: 20 }}>Start Over</button>
    </div>
);
