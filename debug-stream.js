
// using native fetch
async function test() {
    const url = 'https://sub2api.526566.xyz/v1/chat/completions';
    const key = 'sk-2f7003c24b91edaf0a8e389e143cc220a4db4f9184e4f3777a61e53c36e323b8';

    console.log('Testing with stream=true...');
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: 'gpt-5.3-codex',
                messages: [{ role: 'user', content: 'hi' }],
                stream: true
            })
        });
        console.log(`Status: ${res.status}`);
        const txt = await res.text();
        console.log(`Body: ${txt.substring(0, 200)}`);
    } catch (e) {
        console.error(e.message);
    }
}

test();
