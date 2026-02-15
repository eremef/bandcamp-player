const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { program } = require('commander'); // Not available, using raw args or simple parsing
// Actually, let's use simple args parsing to avoid adding dependencies if possible, 
// but axios is available.

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node scripts/add-scraper-test.js <fixture_name> <type: album|collection> [url]');
    process.exit(1);
}

const fixtureName = args[0];
const type = args[1];
const url = args[2];

const fixturesDir = path.join(__dirname, '../src/main/services/__fixtures__');
const testFile = path.join(__dirname, '../src/main/services/scraper.snapshot.test.ts');

if (!['album', 'collection'].includes(type)) {
    console.error('Type must be "album" or "collection"');
    process.exit(1);
}

async function main() {
    // 1. Create/Fetch Fixture
    const fixtureFilename = `${fixtureName}.html`;
    const fixturePath = path.join(fixturesDir, fixtureFilename);

    if (url) {
        console.log(`Fetching ${url}...`);
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            fs.writeFileSync(fixturePath, response.data);
            console.log(`Saved fixture to ${fixturePath}`);
        } catch (e) {
            console.error(`Failed to fetch URL: ${e.message}`);
            process.exit(1);
        }
    } else {
        if (!fs.existsSync(fixturePath)) {
            fs.writeFileSync(fixturePath, '<!-- PASTE HTML HERE -->');
            console.log(`Created empty fixture at ${fixturePath}. Please paste HTML content there.`);
        } else {
            console.log(`Fixture ${fixturePath} already exists.`);
        }
    }

    // 2. Generate Test Snippet
    let testSnippet = '';

    if (type === 'collection') {
        testSnippet = `
    describe('fetchCollection (Snapshot: ${fixtureName})', () => {
        it('should parse ${fixtureFilename} correctly', async () => {
            mockAuthService.getUser.mockReturnValue({
                isAuthenticated: true,
                user: { profileUrl: 'https://bandcamp.com/testuser', id: '12345' }
            });
            mockAuthService.getSessionCookies.mockResolvedValue('session=123');

            const htmlContent = loadFixture('${fixtureFilename}');
            mockAxios.get.mockResolvedValue({ data: htmlContent });
            mockAxios.post.mockResolvedValue({ data: { items: [] } });

            const collection = await scraper.fetchCollection(true);

            expect(collection.items.length).toBeGreaterThan(0);
            // TODO: Add specific assertions matching the fixture data
            // const firstItem = collection.items[0];
            // expect(firstItem.type).toBe('album');
        });
    });
`;
    } else if (type === 'album') {
        testSnippet = `
    describe('getAlbumDetails (Snapshot: ${fixtureName})', () => {
        it('should parse ${fixtureFilename} correctly', async () => {
            mockAuthService.getSessionCookies.mockResolvedValue('session=123');

            const htmlContent = loadFixture('${fixtureFilename}');
            mockAxios.get.mockResolvedValue({ data: htmlContent });

            // TODO: Update URL to match fixture context if needed
            const album = await scraper.getAlbumDetails('${url || 'https://artist.bandcamp.com/album/test'}');

            expect(album).not.toBeNull();
            // TODO: Add specific assertions matching the fixture data
            // expect(album?.title).toBe('Album Title');
            // expect(album?.tracks.length).toBeGreaterThan(0);
        });
    });
`;
    }

    // 3. Append to Test File
    let testFileContent = fs.readFileSync(testFile, 'utf-8');

    // Insert before the last closing braces
    // We expect the file to end with:
    // });
    // (newline)

    // Find the last occurrence of "});"
    const lastClosingIndex = testFileContent.lastIndexOf('});');

    if (lastClosingIndex !== -1) {
        const newContent = testFileContent.slice(0, lastClosingIndex) + testSnippet + testFileContent.slice(lastClosingIndex);
        fs.writeFileSync(testFile, newContent);
        console.log(`Added test case to ${testFile}`);
    } else {
        console.error('Could not find insertion point in test file (looking for last "});")');
        // Fallback: append
        fs.appendFileSync(testFile, testSnippet);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
