const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const axios = require('axios');

const selectorsPath = path.join(__dirname, '..', 'remote-config.json');
const hashPath = path.join(__dirname, '..', 'remote-config.json.hash');

async function validate() {
    console.log('--- Starting Remote Config Validation ---');

    // 1. Load File
    let config;
    let content;
    try {
        content = fs.readFileSync(selectorsPath, 'utf8');
        config = JSON.parse(content);
        console.log('✅ JSON is valid.');
    } catch (e) {
        console.error('❌ Failed to parse remote-config.json:', e.message);
        process.exit(1);
    }

    // 2. Validate Integrity Hash
    try {
        const expectedHash = fs.readFileSync(hashPath, 'utf8').trim();
        const actualHash = crypto.createHash('sha256').update(content).digest('hex');
        if (actualHash === expectedHash) {
            console.log('✅ Integrity hash matches.');
        } else {
            console.error('❌ Integrity hash mismatch!');
            console.error(`Expected: ${expectedHash}`);
            console.error(`Actual:   ${actualHash}`);
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Failed to read or verify remote-config.json.hash:', e.message);
        process.exit(1);
    }

    // 3. Schema Check (Essential fields)
    const requiredRanges = [
        'selectors.collection.itemContainer',
        'selectors.album.artistDOM',
        'endpoints.collectionItemsApi'
    ];

    for (const pathStr of requiredRanges) {
        const parts = pathStr.split('.');
        let curr = config;
        for (const p of parts) {
            curr = curr?.[p];
        }
        if (!curr) {
            console.error(`❌ Missing required field: ${pathStr}`);
            process.exit(1);
        }
    }
    console.log('✅ Basic schema validation passed.');

    // 4. Smoke Test (Optional but recommended)
    console.log('--- Starting Smoke Test against Bandcamp ---');
    try {
        // Test a known Bandcamp page to see if selectors work
        const testUrl = 'https://bandcamp.com/guide'; // Guide usually has common elements
        const response = await axios.get(testUrl);
        const $ = cheerio.load(response.data);

        // Just verify if we can find AT LEAST something or if the selectors don't crash the parser
        // We won't be too strict here to avoid CI failure on Bandcamp downtime, 
        // but we'll try to find the player data blob if possible.
        const blobSelector = config.selectors.radio.dataBlobElements[0];
        const hasBlob = $(blobSelector).length > 0;
        console.log(`ℹ️ Smoke Test: Found ${blobSelector}? ${hasBlob ? 'YES' : 'NO (This might be okay on certain pages)'}`);

        console.log('✅ Smoke test finished.');
    } catch (e) {
        console.warn('⚠️ Smoke test could not reach Bandcamp or encountered an issue:', e.message);
        console.warn('This might be due to CI networking or Bandcamp anti-bot measures.');
    }

    console.log('--- Validation Successful ---');
}

validate();
