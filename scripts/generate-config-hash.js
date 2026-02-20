const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const selectorsPath = path.join(__dirname, '..', 'remote-config.json');
const hashPath = path.join(__dirname, '..', 'remote-config.json.hash');

try {
    const content = fs.readFileSync(selectorsPath, 'utf8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    fs.writeFileSync(hashPath, hash);
    console.log(`Generated hash for remote-config.json: ${hash}`);
    console.log(`Saved to: ${hashPath}`);
} catch (error) {
    console.error('Error generating hash:', error);
    process.exit(1);
}
