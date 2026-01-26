import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const sourceFile = path.join(__dirname, 'seed-snapshot.ts');
const fileContent = fs.readFileSync(sourceFile, 'utf-8');

const source = ts.createSourceFile(
    sourceFile,
    fileContent,
    ts.ScriptTarget.Latest,
    true
);

function extractVariableToJson(variableName: string, outputFile: string) {
    let found = false;

    // Simple AST traversal to find the variable declaration
    ts.forEachChild(source, (node) => {
        if (ts.isVariableStatement(node)) {
            const declarationList = node.declarationList;
            for (const declaration of declarationList.declarations) {
                if (ts.isIdentifier(declaration.name) && declaration.name.text === variableName) {
                    if (declaration.initializer) {
                        try {
                            // Extract the text of the array
                            // Note: strict JSON.parse might fail if the TS file has non-JSON compatible syntax like comments or single quotes in keys
                            // But usually snapshot files are generated as valid JS objects.
                            // However, seed-snapshot.ts likely uses valid JS (object keys unquoted? single quotes?). 
                            // Let's safe-eval it or use a smarter extraction.

                            // Quick hack: Use `eval` on the substring? DANGEROUS but effective for known local trusted file.
                            // Or just slice the string and try to make it JSON.

                            // Let's try to just output the raw JS object string to a .js file and allow the consumer to require it?
                            // No, desire is JSON.

                            // Let's use `Function` constructor to safe-ish eval just that part.
                            const code = fileContent.slice(declaration.initializer.pos, declaration.initializer.end);
                            // We need new Date() to work if used.
                            // snapshot usually has `new Date(...)`. JSON doesn't support that.
                            // We need to replacer `new Date(...)` or specific strings.

                            // Actually, better approach: 
                            // Create a temporary script that imports seed-snapshot (if it exported data) OR
                            // Since it doesn't export, we are stuck parsing.

                            // Let's assume the user format is "standard" JS object literals.
                            // We will write a small script that copies the variable definition to a new file that exports it, then run that file to dump JSON.
                        } catch (e) {
                            console.error('Error during extraction:', e);
                        }
                    }
                    found = true;
                }
            }
        }
    });
}

// Strategy 2: Regex extraction + safe eval wrapper
function extractByRegexAndSave(variableName: string, outputFile: string) {
    console.log(`Extracting ${variableName}...`);
    // Find "const variableName = [" ... until "];"
    // This is fragile if nested arrays exist. 
    // Let's use the line numbers we found earlier via grep as a hint, or just valid JS parsing.

    // Simplest robust way: 
    // 1. Read file.
    // 2. Find range of the variable.
    // 3. Write a temporary .ts file that exports this data.
    // 4. Run temp file to JSON.stringify the data.

    // We already assume 'seed-snapshot.ts' is a valid TS file. 
    // It has `const regions = [...]`. It does NOT export them.

    // Let's append `export { regions, organizations };` to a copy of the file?
    // But the file imports PrismaClient which might fail if not configured.
    // The top of source has imports.

    // Let's just use string slicing based on the known structure if possible, or AST.
    // AST is best.

    let objectCode = '';

    ts.forEachChild(source, (node) => {
        if (ts.isVariableStatement(node)) {
            const declarationList = node.declarationList;
            for (const declaration of declarationList.declarations) {
                if (ts.isIdentifier(declaration.name) && declaration.name.text === variableName) {
                    if (declaration.initializer) {
                        objectCode = fileContent.substring(declaration.initializer.pos, declaration.initializer.end);
                    }
                }
            }
        }
    });

    // Regex fallback
    if (!objectCode) {
        console.log('AST extraction failed. Trying Regex...');
        const regex = new RegExp(`const\\s+${variableName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`);
        const match = fileContent.match(regex);
        if (match && match[1]) {
            objectCode = match[1];
        }
    }

    if (!objectCode) {
        console.error(`Variable ${variableName} not found.`);
        return;
    }

    // Now we have the code `[ ... ]`. It might contain `new Date()`.
    // We construct a wrapper script.
    const wrapper = `
    const data = ${objectCode};
    console.log(JSON.stringify(data, null, 2));
    `;

    // We need to handle `new Date`. 
    // If we run this as node script, `new Date` works. JSON.stringify will convert to ISO string.
    // But `objectCode` might rely on imported enums? 
    // If snapshot uses Enums (e.g. RegionLevel.PROVINCE), we need those defined.
    // Snapshot doesn't seem to use Enums based on previous view (it used string literals "PROVINCE").
    // Let's check imports in snapshot... it imports PrismaClient.

    const tmpFile = path.join(__dirname, `_extract_${variableName}.js`);
    fs.writeFileSync(tmpFile, wrapper);

    // Run it
    try {
        const { execSync } = require('child_process');
        // Node might complain if we use TS syntax in JS file. 
        // Snapshot data is usually valid JS (except maybe type assertions `as any`?).
        // If snapshot has `as any`, this will fail in JS.
        // Let's check if snapshot uses `as any` inside the array.
        // The view showed clean JSON-like structure with `new Date`.

        // Execute
        const json = execSync(`node ${tmpFile}`, { maxBuffer: 1024 * 1024 * 50 }).toString(); // 50MB buffer
        fs.writeFileSync(path.join(__dirname, outputFile), json);
        console.log(`✅ Extracted ${variableName} to ${outputFile}`);

        fs.unlinkSync(tmpFile);
    } catch (e: any) {
        console.error(`Snapshot extraction failed for ${variableName}. Falling back to manual AST parsing?`, e.message);
    }
}

extractByRegexAndSave('regions', 'regions-data.json');
extractByRegexAndSave('organizations', 'org-organizations.json');
extractByRegexAndSave('departments', 'org-departments.json');
extractByRegexAndSave('users', 'org-users.json');
extractByRegexAndSave('tagGroups', 'tags-groups.json');
extractByRegexAndSave('collectionPoints', 'cp-list.json');
extractByRegexAndSave('extractionRules', 'rules-list.json');
