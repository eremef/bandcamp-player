import axios from 'axios';
import fs from 'fs';

async function run() {
    const configStr = fs.readFileSync('remote-config.json', 'utf8');
    const config = JSON.parse(configStr);
    
    const fanId = 5116744; // Example fan id
    const endpoint = config.endpoints.bandcampPlaylistsApi;
    
    console.log(`Endpoint: ${endpoint}`);
    try {
        const res = await axios.post(endpoint, { 
            page_fan_id: fanId,
            page_size: 20
        });
        console.log("Success with page_size!");
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e: any) {
        console.error("Failed:", e.message);
    }
}

run();
