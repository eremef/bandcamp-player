const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const axios = require('axios');

const configPath = path.join(__dirname, '../remote-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Accept show ID as a command line argument, default to 908
const args = process.argv.slice(2);
const defaultShowId = args[0] || '908';

async function testRadio(showId) {
    console.log(`\n--- Testing Radio Show Parsing [Show ID: ${showId}] ---`);
    try {
        const url = config.endpoints.radioShowWeb.replace('{showId}', showId);
        console.log(`Fetching from: ${url}`);
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        const blob = $('#ArchiveApp').attr('data-blob');

        if (!blob) {
            console.error("❌ No data-blob found on the page.");
            return;
        }

        const appData = JSON.parse(blob);
        const shows = appData.appData?.shows || appData.shows || [];

        let show = shows.find(s => {
            const id = String(config.radioData.showIdKeys.reduce((acc, key) => acc || s[key], null) || '');
            return id === showId;
        });

        if (show) {
            console.log("✅ Found show data in blob.");
        } else {
            console.error("❌ Show not found in blob data.");
            return;
        }

        let audioTrackId = config.radioData.trackIdKeys.reduce((acc, key) => acc || show?.[key] || appData[key], null);
        console.log(`✅ Extracted Track ID: ${audioTrackId}`);

        console.log("\n--- Debug Info ---");
        console.log("Available keys on show:", Object.keys(show).filter(k => k.toLowerCase().includes('track') || k.toLowerCase().includes('id')));
        console.log("Values resolved from config:", config.radioData.trackIdKeys.map(k => `${k}=${show[k]}`).join(', '));
        console.log("------------------\n");
    } catch (e) {
        console.error(`❌ Error parsing radio show: ${e.message}`);
    }
}

testRadio(defaultShowId);
