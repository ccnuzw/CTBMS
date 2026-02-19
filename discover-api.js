
const https = require('https');

async function checkPath(hostname, path, method, body, headers) {
    return new Promise((resolve) => {
        const req = https.request({
            hostname,
            port: 443,
            path,
            method,
            headers,
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, data: data.substring(0, 200) });
            });
        });

        req.on('error', (e) => resolve({ status: 'ERR', data: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', data: '' }); });

        if (body) req.write(body);
        req.end();
    });
}

async function discover() {
    const apiKey = 'sk-2f7003c24b91edaf0a8e389e143cc220a4db4f9184e4f3777a61e53c36e323b8';
    const hostname = 'sub2api.526566.xyz';

    // Paths to probe for Chat Completions
    const chatPaths = [
        '/v1/chat/completions',
        '/chat/completions',
        '/api/v1/chat/completions',
        '/api/chat/completions',
        '/openai/v1/chat/completions',
        '/openai/chat/completions',
        '/proxy/v1/chat/completions',
        '/v1/engines/gpt-5.3-codex/chat/completions', // Azure style
        '/backend-api/v2/conversation', // ChatGPT style
    ];

    // Paths to probe for Legacy Completions
    const completionPaths = [
        '/v1/completions',
        '/completions',
        '/api/v1/completions',
        '/openai/v1/completions',
        '/v1/engines/gpt-5.3-codex/completions',
    ];

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'PostmanRuntime/7.26.8' // Mimic standard tool
    };

    const payload = JSON.stringify({
        model: 'gpt-5.3-codex',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
    });

    const completionPayload = JSON.stringify({
        model: 'gpt-5.3-codex',
        prompt: 'hi',
        max_tokens: 5
    });

    console.log('--- Probing Chat Endpoints ---');
    for (const path of chatPaths) {
        process.stdout.write(`Trying POST https://${hostname}${path} ... `);
        const res = await checkPath(hostname, path, 'POST', payload, headers);
        console.log(`${res.status}`);
        if (res.status === 200 || res.status === 400 || res.status === 401) {
            console.log(`Possible Hit! Response: ${res.data}`);
        }
    }

    console.log('\n--- Probing Completion Endpoints ---');
    for (const path of completionPaths) {
        process.stdout.write(`Trying POST https://${hostname}${path} ... `);
        const res = await checkPath(hostname, path, 'POST', completionPayload, headers);
        console.log(`${res.status}`);
        if (res.status === 200 || res.status === 400 || res.status === 401) {
            console.log(`Possible Hit! Response: ${res.data}`);
        }
    }
}

discover();
