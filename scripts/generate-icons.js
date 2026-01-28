const { Jimp } = require('jimp');
const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const SOURCE_ICON = path.join(__dirname, '../src/assets/icons/source_icon.png');
const ELECTRON_ICON_DIR = path.join(__dirname, '../src/assets/icons');
const MOBILE_ICON_DIR = path.join(__dirname, '../mobile/assets');

async function processIcon() {
    console.log('--- Starting Icon Generation ---');

    // 1. Check Source
    if (!fs.existsSync(SOURCE_ICON)) {
        console.error('Source icon missing.');
        process.exit(1);
    }

    // 2. Read Image
    console.log('Reading image...');
    let baseImage;
    try {
        baseImage = await Jimp.read(SOURCE_ICON);
        console.log(`Image read. Width: ${baseImage.bitmap.width}, Height: ${baseImage.bitmap.height}`);
    } catch (e) {
        console.error('Failed to read image:', e);
        process.exit(1);
    }

    const saveResized = async (name, width, height, destDir) => {
        console.log(`\nProcessing ${name} (${width}x${height})...`);
        try {
            const workImg = baseImage.clone();

            // Jimp v1 resize({ w, h })
            workImg.resize({ w: width, h: height });

            const destPath = path.join(destDir, name);

            // Try await getBuffer
            const buffer = await workImg.getBuffer("image/png");
            fs.writeFileSync(destPath, buffer);
            console.log(`Saved ${destPath}`);
            return destPath;
        } catch (e) {
            console.log(`FAILED processing ${name}: ${e.message}`);
            if (e.issues) console.log(JSON.stringify(e.issues, null, 2));
        }
    };

    // Electron
    await saveResized('icon.png', 512, 512, ELECTRON_ICON_DIR);
    await saveResized('512x512.png', 512, 512, ELECTRON_ICON_DIR);

    // .ico
    // Generate a 256x256 temp for ICO to avoid issues with large source
    console.log('\nGenerating icon.ico...');
    try {
        const tempIcoPng = path.join(ELECTRON_ICON_DIR, 'temp_ico.png');
        await saveResized('temp_ico.png', 256, 256, ELECTRON_ICON_DIR);

        const converter = pngToIco.default || pngToIco;

        // Use the temp 256 file
        const buf = await converter([tempIcoPng]);
        fs.writeFileSync(path.join(ELECTRON_ICON_DIR, 'icon.ico'), buf);
        console.log('Saved icon.ico');

        // Cleanup temp
        fs.unlinkSync(tempIcoPng);
    } catch (e) {
        console.log('Failed to generate .ico:', e.message);
    }

    // Mobile
    await saveResized('icon.png', 1024, 1024, MOBILE_ICON_DIR);
    await saveResized('splash-icon.png', 512, 512, MOBILE_ICON_DIR);
    await saveResized('favicon.png', 48, 48, MOBILE_ICON_DIR);

    // Adaptive
    console.log('\nGeneration adaptive-icon.png...');
    try {
        const adaptiveBg = new Jimp({ width: 1024, height: 1024, color: 0x00000000 });

        const workImg = baseImage.clone();
        workImg.resize({ w: 720, h: 720 });

        adaptiveBg.composite(workImg, 152, 152);

        const buffer = await adaptiveBg.getBuffer("image/png");
        fs.writeFileSync(path.join(MOBILE_ICON_DIR, 'adaptive-icon.png'), buffer);
        console.log('Saved adaptive-icon.png');
    } catch (e) {
        console.log('Failed adaptive:', e.message);
    }

    console.log('\n--- Done ---');
}

processIcon();
