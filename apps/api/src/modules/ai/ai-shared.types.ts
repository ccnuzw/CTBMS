export type TraceLog = {
    timestamp: number;
    stage: string;
    message: string;
    detail?: unknown;
    level: 'info' | 'warn' | 'error' | 'debug';
};

export class TraceLogger {
    public logs: TraceLog[] = [];

    log(stage: string, message: string, detail?: unknown, level: TraceLog['level'] = 'info') {
        this.logs.push({
            timestamp: Date.now(),
            stage,
            message,
            detail,
            level
        });
    }

    getLogs() {
        return this.logs;
    }
}
