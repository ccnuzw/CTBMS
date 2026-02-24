const fs = require('fs');
const path = require('path');

function walk(dir, done) {
    let results = [];
    fs.readdir(dir, function (err, list) {
        if (err) return done(err);
        let pending = list.length;
        if (!pending) return done(null, results);
        list.forEach(function (file) {
            file = path.resolve(dir, file);
            fs.stat(file, function (err, stat) {
                if (stat && stat.isDirectory()) {
                    if (file.includes('node_modules') || file.includes('dist') || file.includes('.next') || file.includes('.git')) {
                        if (!--pending) done(null, results);
                        return;
                    }
                    walk(file, function (err, res) {
                        results = results.concat(res);
                        if (!--pending) done(null, results);
                    });
                } else {
                    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
                        results.push(file);
                    }
                    if (!--pending) done(null, results);
                }
            });
        });
    });
}

function processFile(filePath) {
    // Skipping already updated files or engine internal files
    if (filePath.includes('PropertyPanel.tsx') ||
        filePath.includes('dag-scheduler.ts') ||
        filePath.includes('workflow-execution-runner.service.ts') ||
        filePath.includes('workflow-dsl-validator.ts') ||
        filePath.includes('workflow-execution-dag.service.ts') ||
        filePath.includes('schema.prisma') ||
        filePath.includes('packages/types/')) {
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Handle string inputs like label="超时控制 (ms)" -> label="超时控制 (秒)"
    content = content.replace(/\(ms\)/g, '(秒)');

    // 1. Handle timeoutMs: 30000 -> timeoutSeconds: 30
    content = content.replace(/timeoutMs\s*:\s*(\d+)/g, (match, val) => {
        const ms = parseInt(val, 10);
        const s = ms >= 1000 ? Math.floor(ms / 1000) : ms === 0 ? 0 : 1;
        return `timeoutSeconds: ${s}`;
    });
    // For variables: timeoutMs: agent.timeoutMs -> timeoutSeconds: agent.timeoutSeconds
    content = content.replace(/timeoutMs/g, 'timeoutSeconds');

    // 2. Handle retryBackoffMs: 2000 -> retryIntervalSeconds: 2
    content = content.replace(/retryBackoffMs\s*:\s*(\d+)/g, (match, val) => {
        const ms = parseInt(val, 10);
        const s = ms >= 1000 ? Math.floor(ms / 1000) : ms === 0 ? 0 : 1;
        return `retryIntervalSeconds: ${s}`;
    });
    // For Variables
    content = content.replace(/retryBackoffMs/g, 'retryIntervalSeconds');

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Rewrote ${filePath}`);
    }
}

walk('/Users/mac/Progame/CTBMS/apps', function (err, results) {
    if (err) throw err;
    for (const file of results) {
        processFile(file);
    }
});
