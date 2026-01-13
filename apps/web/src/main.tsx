import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Suppress legacy library warnings (Ant Design ProComponents)
const originalError = console.error;
console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('findDOMNode')) return;
    originalError(...args);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <App />,
)
