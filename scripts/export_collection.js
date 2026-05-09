const fs = require('fs');
const readline = require('readline');

function escapeCsv(val) {
    if (val === undefined || val === null) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function exportToCsv(items) {
    const headers = [
        'ID',
        'Type',
        'Source',
        'Artist',
        'Title',
        'Album',
        'Purchase Date',
        'Bandcamp URL',
        'Artwork URL',
        'Track Count',
        'Duration (s)',
        'Artist ID',
        'Token'
    ];

    const rows = [headers.join(',')];
    
    // Deduplicate globally by ID and Type
    const uniqueItemsMap = new Map();
    items.forEach(item => {
        const key = `${item.id}-${item.type}`;
        if (!uniqueItemsMap.has(key)) {
            uniqueItemsMap.set(key, item);
        } else {
            // Keep the one with a real date if possible
            const existing = uniqueItemsMap.get(key);
            if (!existing.purchaseDate && item.purchaseDate) {
                uniqueItemsMap.set(key, item);
            }
        }
    });

    const uniqueItems = Array.from(uniqueItemsMap.values());

    // Sort items by index (if available) or purchase date
    uniqueItems.sort((a, b) => {
        if (a.index !== undefined && b.index !== undefined && a.index !== b.index) {
            return a.index - b.index;
        }
        return new Date(b.purchaseDate || 0) - new Date(a.purchaseDate || 0);
    });

    uniqueItems.forEach(item => {
        const tralbum = item.album || item.track;
        if (!tralbum) return;

        const row = [
            item.id,
            item.type,
            item.source || (item.isWishlist ? 'wishlist' : 'collection'),
            tralbum.artist,
            tralbum.title,
            item.type === 'track' ? tralbum.album : '',
            item.purchaseDate,
            tralbum.bandcampUrl,
            tralbum.artworkUrl,
            tralbum.trackCount || 0,
            tralbum.duration || 0,
            tralbum.artistId,
            item.token
        ];
        rows.push(row.map(escapeCsv).join(','));
    });

    return rows.join('\n');
}

const allItems = [];
const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
});

rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
        const data = JSON.parse(line);
        if (data.items) {
            allItems.push(...data.items);
        }
    } catch (e) {
        // Silently ignore if a line isn't valid JSON (might be sqlite header/etc)
    }
});

rl.on('close', () => {
    const csv = exportToCsv(allItems);
    const uniqueCount = (csv.split('\n').length - 1);
    fs.writeFileSync('scratch/bandcamp_collection.csv', csv);
    console.log(`Successfully exported ${allItems.length} raw items (${uniqueCount} unique) to scratch/bandcamp_collection.csv`);
});
