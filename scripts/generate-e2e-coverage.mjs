import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import v8ToIstanbul from 'ast-v8-to-istanbul';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import * as acorn from 'acorn';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateCoverage() {
    const coverageDir = path.resolve(__dirname, '../coverage-v8');
    const outputDir = path.resolve(__dirname, '../coverage-e2e');
    const map = libCoverage.createCoverageMap();

    // We don't delete coverage-v8 yet, we'll do it at the very end
    if (!fs.existsSync(coverageDir)) {
        console.error('No coverage data found in coverage-v8');
        return;
    }

    const files = fs.readdirSync(coverageDir).filter(f => f.endsWith('.json'));
    console.log(`Processing ${files.length} coverage files from ${coverageDir}...`);

    let processedScripts = new Set();
    let processedEntries = 0;
    let successfulConversions = 0;

    for (const file of files) {
        const filePath = path.join(coverageDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        for (const entry of data) {
            // Only process our own files, ignoring internal node stuff
            if (!entry.url || entry.url.startsWith('node:')) continue;

            // We want renderer files (bundled) or src files
            if (!entry.url.includes('dist/renderer') && !entry.url.includes('src/')) continue;

            // Note: We don't filter by unique scripts across files anymore,
            // because we want to merge hits from EVERY test.
            processedEntries++;

            // Convert file URL to absolute path if needed
            let filePathLocal = entry.url;
            if (filePathLocal.startsWith('file:///')) {
                try {
                    filePathLocal = fileURLToPath(entry.url);
                } catch (e) {
                    console.warn(`Could not convert URL to path: ${entry.url}`);
                    continue;
                }
            }

            if (!fs.existsSync(filePathLocal)) {
                continue;
            }

            try {
                const code = fs.readFileSync(filePathLocal, 'utf8');

                // Parse the code to get an AST that ast-v8-to-istanbul can walk
                let ast;
                try {
                    ast = acorn.parse(code, {
                        ecmaVersion: 'latest',
                        sourceType: 'module',
                        locations: true,
                    });
                } catch (parseErr) {
                    // Only log once per unique script if it fails to parse
                    const scriptKey = `${entry.url}_${entry.scriptId}`;
                    if (!processedScripts.has(scriptKey)) {
                        console.error(`Failed to parse ${entry.url}: ${parseErr.message}`);
                        processedScripts.add(scriptKey);
                    }
                    continue;
                }

                const istanbulData = await v8ToIstanbul({
                    code,
                    url: entry.url,
                    coverage: entry,
                    ast
                });

                if (istanbulData && Object.keys(istanbulData).length > 0) {
                    map.merge(istanbulData);
                    successfulConversions++;
                }
            } catch (err) {
                // Silently ignore individual conversion errors unless we want deeper debugging
            }
        }
    }

    console.log(`Summary: Processed ${processedEntries} coverage entries, ${successfulConversions} successful conversions.`);

    if (successfulConversions === 0) {
        console.warn('Warning: No coverage data was successfully matched to files.');
    }

    const context = libReport.createContext({
        dir: outputDir,
        defaultSummarizer: 'pkg',
        watermarks: libReport.getDefaultWatermarks(),
        coverageMap: map,
    });

    reports.create('html').execute(context);
    reports.create('text-summary').execute(context);
    reports.create('json-summary', { file: 'coverage-summary.json' }).execute(context);

    console.log(`Coverage report generated in ${outputDir}`);

    // Cleanup: Remove raw V8 data as requested
    try {
        if (fs.existsSync(coverageDir)) {
            console.log('Cleaning up raw coverage data...');
            fs.rmSync(coverageDir, { recursive: true, force: true });
            console.log('Cleanup complete.');
        }
    } catch (err) {
        console.error(`Failed to clean up coverage-v8: ${err.message}`);
    }
}

generateCoverage().catch(console.error);
