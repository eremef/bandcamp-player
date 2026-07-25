const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '../src');
const linkPath = path.resolve(__dirname, '../mobile/src');

if (!fs.existsSync(linkPath)) {
    if (process.env.CI === 'true') {
        console.log('CI environment detected. Copying src to mobile/src');
        try {
            fs.cpSync(target, linkPath, { recursive: true });
            console.log('Directory copied successfully.');
        } catch (e) {
            console.error('Failed to copy directory:', e.message);
        }
    } else {
        console.log('Creating symlink: mobile/src -> src');
        try {
            fs.symlinkSync(target, linkPath, 'junction');
            console.log('Symlink created successfully.');
        } catch (e) {
            console.error('Failed to create symlink:', e.message);
        }
    }
} else {
    console.log('Symlink mobile/src already exists.');
}
