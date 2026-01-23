const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src/assets');
const destDir = path.join(__dirname, '../dist/assets');

function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            console.log(`Copying ${srcPath} to ${destPath}`);
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

if (fs.existsSync(srcDir)) {
    console.log('Copying assets...');
    copyDir(srcDir, destDir);
    console.log('Assets copied successfully.');
} else {
    console.log('No assets directory found in src.');
}
