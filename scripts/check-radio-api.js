const axios = require('axios');

async function checkRadioList() {
    try {
        console.log('Fetching Bandcamp Weekly list...');
        const listResp = await axios.get('https://bandcamp.com/api/bcweekly/3/list');
        const show = listResp.data.results[0]; // Latest show

        console.log('Sample Show Keys:', Object.keys(show));
        if (show.audio_duration) console.log('audio_duration:', show.audio_duration);
        if (show.duration) console.log('duration:', show.duration);
        console.log('Full object:', JSON.stringify(show, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkRadioList();
