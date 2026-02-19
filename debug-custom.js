
// using native fetch

async function test() {
    const url = 'https://sub2api.526566.xyz';
    const key = 'sk-2f7003c24b91edaf0a8e389e143cc220a4db4f9184e4f3777a61e53c36e323b8';

    const headers = {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
    };

    console.log('--- Testing /v1/messages (Claude Style) ---');
    try {
        const res = await fetch(`${url}/v1/messages`, {
            method: 'POST',
            headers: { ...headers, 'x-api-key': key }, // try both auth header styles
            body: JSON.stringify({
                model: 'gpt-5.3-codex',
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 10
            })
        });
        console.log(`/v1/messages status: ${res.status}`);
        const txt = await res.text();
        console.log(`Body: ${txt.substring(0, 200)}`);
    } catch (e) {
        console.error(e.message);
    }

    console.log('\n--- Testing /v1/chat/completions with "gpt-5" ---');
    try {
        const res = await fetch(`${url}/v1/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: 'gpt-5',
                messages: [{ role: 'user', content: 'hi' }]
            })
        });
        console.log(`/v1/chat/completions ("gpt-5") status: ${res.status}`);
        const txt = await res.text();
        console.log(`Body: ${txt.substring(0, 200)}`);
    } catch (e) {
        console.error(e.message);
    }
}

test();
