const axios = require('axios');
const cheerio = require('cheerio');

async function checkRadio() {
    try {
        // 1. Get a show ID (Bandcamp Weekly is usually a safe bet, or parse one)
        console.log('Fetching Bandcamp Weekly list...');
        const listResp = await axios.get('https://bandcamp.com/api/bcweekly/3/list');
        const show = listResp.data.results[0]; // Latest show
        const showId = String(show.id);
        console.log(`Checking Show ID: ${showId}`);

        // 2. Get Page
        const pageUrl = `https://bandcamp.com/?show=${showId}`;
        const pageResp = await axios.get(pageUrl);
        const $ = cheerio.load(pageResp.data);
        const dataBlob = $('#ArchiveApp').attr('data-blob');
        const appData = JSON.parse(dataBlob);

        const showData = appData.appData.shows.find(s => String(s.showId) === showId);
        console.log('Show Data Keys:', Object.keys(showData));
        if (showData.duration) console.log('Show Data Duration:', showData.duration);
        const audioTrackId = showData.audioTrackId;
        console.log(`Audio Track ID: ${audioTrackId}`);

        // 3. Get Mobile API Data
        const apiUrl = `https://bandcamp.com/api/mobile/24/tralbum_details?band_id=1&tralbum_type=t&tralbum_id=${audioTrackId}`;
        const apiResp = await axios.get(apiUrl);

        if (apiResp.data.tracks && apiResp.data.tracks.length > 0) {
            const track = apiResp.data.tracks[0];
            console.log('Track Data Keys:', Object.keys(track));
            console.log('Duration:', track.duration);
            console.log('Streaming URL:', track.streaming_url ? 'Present' : 'Missing');
        } else {
            console.log('No tracks found in API response');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkRadio();
