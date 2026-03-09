import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { execSync } from 'node:child_process';

const sourceFile = path.join(__dirname, 'seed-snapshot.ts');
const fileContent = fs.readFileSync(sourceFile, 'utf-8');

const source = ts.createSourceFile(
    sourceFile,
    fileContent,
    ts.ScriptTarget.Latest,
    true
);

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
        const json = execSync(`node ${tmpFile}`, { maxBuffer: 1024 * 1024 * 50 }).toString(); // 50MB buffer
        fs.writeFileSync(path.join(__dirname, outputFile), json);
        console.log(`✅ Extracted ${variableName} to ${outputFile}`);

        fs.unlinkSync(tmpFile);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`Snapshot extraction failed for ${variableName}. Falling back to manual AST parsing?`, message);
    }
}

extractByRegexAndSave('regions', 'regions-data.json');
extractByRegexAndSave('organizations', 'org-organizations.json');
extractByRegexAndSave('departments', 'org-departments.json');
extractByRegexAndSave('users', 'org-users.json');
extractByRegexAndSave('tagGroups', 'tags-groups.json');
extractByRegexAndSave('collectionPoints', 'cp-list.json');
extractByRegexAndSave('extractionRules', 'rules-list.json');
