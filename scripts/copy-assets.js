const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src/assets');
const destDir = path.join(__dirname, '../dist/assets');


const licenseSrc = path.join(__dirname, '../LICENSE.txt');
const licenseDest = path.join(__dirname, '../mobile/assets/license.txt');

const configSrc = path.join(__dirname, '../remote-config.json');
const configDest = path.join(__dirname, '../mobile/assets/remote-config.json');
const hashSrc = path.join(__dirname, '../remote-config.json.hash');
const hashDest = path.join(__dirname, '../mobile/assets/remote-config.json.hash');

console.log('Copying assets...');

if (fs.existsSync(licenseSrc)) {
    const licenseDestDir = path.dirname(licenseDest);
    if (!fs.existsSync(licenseDestDir)) {
        fs.mkdirSync(licenseDestDir, { recursive: true });
    }
    console.log(`Copying ${licenseSrc} to ${licenseDest}`);
    fs.copyFileSync(licenseSrc, licenseDest);
}

if (fs.existsSync(configSrc)) {
    console.log(`Copying ${configSrc} to ${configDest}`);
    fs.copyFileSync(configSrc, configDest);
}

if (fs.existsSync(hashSrc)) {
    console.log(`Copying ${hashSrc} to ${hashDest}`);
    fs.copyFileSync(hashSrc, hashDest);
}

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
            // Ignore temporary lock files and dot files
            if (entry.name.startsWith('.') || entry.name.includes('~lock~')) {
                continue;
            }
            console.log(`Copying ${srcPath} to ${destPath}`);
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

if (fs.existsSync(srcDir)) {
    copyDir(srcDir, destDir);
    console.log('Assets copied successfully.');
} else {
    console.log('No assets directory found in src.');
}
