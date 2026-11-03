const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '../src');
const linkPath = path.resolve(__dirname, '../mobile/src');

function createSharedLink() {
    try {
        fs.symlinkSync(target, linkPath, 'junction');
        console.log(`Created junction: ${linkPath} -> ${target}`);
        return;
    } catch (error) {
        if (process.env.CI === 'true') {
            console.log('CI environment detected. Copying src to mobile/src');
            try {
                fs.cpSync(target, linkPath, { recursive: true });
                console.log('Directory copied successfully.');
            } catch (copyError) {
                console.error('Failed to copy directory:', copyError.message);
            }
        } else {
            console.error('Failed to create shared-source junction:', error.message);
        }
    }
}

if (!fs.existsSync(linkPath)) {
    createSharedLink();
} else {
    const stats = fs.lstatSync(linkPath);
    if (!stats.isSymbolicLink()) {
        console.log('mobile/src already exists as a directory; leaving it in place.');
    } else {
        const currentTarget = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
        if (path.normalize(currentTarget).toLowerCase() === path.normalize(target).toLowerCase()) {
            console.log(`Shared-source junction is current: ${linkPath} -> ${target}`);
        } else {
            console.log(`Refreshing stale junction: ${linkPath} -> ${target}`);
            fs.unlinkSync(linkPath);
            createSharedLink();
        }
    }
}
