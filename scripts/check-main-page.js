const axios = require('axios');

async function probeApi() {
    try {
        const id = '903'; // From previous output
        console.log(`Probing /api/bcweekly/3/list_all...`);
        // There isn't a known public docs, so guessing based on typical patterns or scraping logic others use.
        // Actually, let's try a get on the specific show if possible.
        // But the list endpoint is what we use.

    } catch (error) {
    }
}
// Actually, let's just stick to what we know. The list does NOT have it.
// If the user wants it, we might have to scrape it.
// Is there a way to get it from the main page html?
// `https://bandcamp.com/?show=903`
// That's what `getStationStreamUrl` does.

// If I really want to show duration for ALL items in the list, I would have to:
// 1. Fetch `https://bandcamp.com/api/bcweekly/3/list`
// 2. For EACH item, fetch `https://bandcamp.com/?show=ID` (HTML) -> parse blob -> get duration.
// This is N requests. For 20 items, that's 20 requests. Not ideal.

// BUT, maybe the `appData` on the main `https://bandcamp.com` page contains *multiple* shows?
// `getStationStreamUrl` fetches `https://bandcamp.com/?show=ID`. 
// Does `https://bandcamp.com/` (without query) contain a list of recent shows with metadata?

const cheerio = require('cheerio');

async function checkMainPage() {
    try {
        console.log('Fetching main Bandcamp page...');
        const response = await axios.get('https://bandcamp.com/');
        const $ = cheerio.load(response.data);
        const dataBlob = $('#ArchiveApp').attr('data-blob');
        if (dataBlob) {
            const appData = JSON.parse(dataBlob);
            // check if appData.appData.shows contains a list
            if (appData.appData && appData.appData.shows) {
                console.log('Found shows in main page blob. Count:', appData.appData.shows.length);
                console.log('Sample show:', appData.appData.shows[0]);
            }
        }
    } catch (e) { console.error(e.message); }
}

checkMainPage();
