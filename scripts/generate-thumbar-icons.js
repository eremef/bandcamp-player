const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { icons } = require('lucide');

function renderNode(node) {
    const [tag, attrs] = node;
    const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${attrStr} />`;
}

function renderSvg(iconNodes) {
    return iconNodes.map(renderNode).join('\n');
}

async function generate() {
    console.log('Launching browser to generate thumbar icons...');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 32, height: 32 });

    const outDir = path.join(__dirname, '../src/assets/icons/thumbar');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const iconsToGenerate = [
        { name: 'play', svg: renderSvg(icons.Play) },
        { name: 'pause', svg: renderSvg(icons.Pause) },
        { name: 'skip-back', svg: renderSvg(icons.SkipBack) },
        { name: 'skip-forward', svg: renderSvg(icons.SkipForward) }
    ];

    for (const icon of iconsToGenerate) {
        const html = `
            <!DOCTYPE html>
            <html>
            <body style="margin:0; padding:0; background:transparent; display:flex; justify-content:center; align-items:center; width:32px; height:32px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    ${icon.svg}
                </svg>
            </body>
            </html>
        `;
        await page.setContent(html);
        await page.screenshot({ path: path.join(outDir, `${icon.name}.png`), omitBackground: true });
        console.log(`Generated ${icon.name}.png`);
    }

    await browser.close();
    console.log('Done generating icons.');
}

generate().catch(console.error);
