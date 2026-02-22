
export class RecursiveCharacterTextSplitter {
    private chunkSize: number;
    private chunkOverlap: number;
    private separators: string[];

    constructor(chunkSize: number = 1000, chunkOverlap: number = 200) {
        this.chunkSize = chunkSize;
        this.chunkOverlap = chunkOverlap;
        this.separators = ["\n\n", "\n", " ", ""];
    }

    splitText(text: string): string[] {
        const finalChunks: string[] = [];
        let separator = this.separators[0];

        for (const s of this.separators) {
            if (text.includes(s)) {
                separator = s;
                break;
            }
        }

        const splits = separator ? text.split(separator) : [text];
        let goodSplits: string[] = [];

        for (const s of splits) {
            if (s.length < this.chunkSize) {
                goodSplits.push(s);
            } else {
                if (goodSplits.length > 0) {
                    this.mergeSplits(goodSplits, separator).forEach(c => finalChunks.push(c));
                    goodSplits = [];
                }
                if (!separator) {
                    finalChunks.push(s);
                } else {
                    // Recursive call (simplified for POC)
                    finalChunks.push(s.substring(0, this.chunkSize));
                }
            }
        }

        if (goodSplits.length > 0) {
            this.mergeSplits(goodSplits, separator).forEach(c => finalChunks.push(c));
        }

        return finalChunks;
    }

    private mergeSplits(splits: string[], separator: string): string[] {
        const docs: string[] = [];
        let currentDoc: string[] = [];
        let total = 0;

        for (const d of splits) {
            const len = d.length;
            if (total + len + (currentDoc.length > 0 ? separator.length : 0) > this.chunkSize) {
                if (currentDoc.length > 0) {
                    docs.push(currentDoc.join(separator));
                    // Overlap logic would go here
                    currentDoc = [];
                    total = 0;
                }
            }
            currentDoc.push(d);
            total += len + (currentDoc.length > 1 ? separator.length : 0);
        }

        if (currentDoc.length > 0) {
            docs.push(currentDoc.join(separator));
        }
        return docs;
    }
}

export function reciprocalRankFusion(resultsLists: Array<Array<{ id: string, score: number }>>, k: number = 60): Array<{ id: string, score: number }> {
    const rrfMap = new Map<string, number>();

    for (const list of resultsLists) {
        list.forEach((item, rank) => {
            const currentScore = rrfMap.get(item.id) || 0;
            rrfMap.set(item.id, currentScore + (1 / (k + rank)));
        });
    }

    return Array.from(rrfMap.entries())
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score);
}
