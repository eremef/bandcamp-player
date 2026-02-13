// Inject server-side generated icons
// Note: ICONS variable must be defined before this script runs (injected in index.html)

let ws;
let currentState = {};
let fullCollectionItems = [];
let isScrubbing = false;
let isExplicitlyDisconnected = false;

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
}

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0 min';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return hours + 'h ' + minutes + 'm';
    }
    return minutes + ' min';
}

function sanitizeUrl(url) {
    if (typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    // Prefer using URL API for robust parsing and protocol checking
    try {
        const parsed = new URL(trimmed, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.href;
        }
        return '';
    } catch (e) {
        // Fallback: strict regex allow-list for http/https absolute URLs
        if (/^https?:\/\/[^\s"'<>]+$/i.test(trimmed)) {
            return trimmed;
        }
        return '';
    }
}

function connect() {
    isExplicitlyDisconnected = false;
    const host = window.location.host;
    ws = new WebSocket('ws://' + host);

    ws.onopen = () => {
        document.getElementById('status-bar').innerText = 'Connected';
        document.getElementById('status-bar').style.color = 'var(--color-success)';
        // Initial load of collection
        sendCommand('get-collection');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onclose = () => {
        if (isExplicitlyDisconnected) {
            console.log('Disconnected by host, not retrying');
            return;
        }
        document.getElementById('status-bar').innerText = 'Disconnected. Retrying...';
        document.getElementById('status-bar').style.color = 'var(--color-error)';
        setTimeout(connect, 3000);
    };
}

function handleMessage(message) {
    const { type, payload } = message;

    if (type === 'state-changed') {
        updateUI(payload);
    } else if (type === 'collection-data') {
        renderCollection(payload);
    } else if (type === 'radio-data') {
        renderRadio(payload);
    } else if (type === 'playlists-data') {
        renderPlaylists(payload);
    } else if (type === 'time-update') {
        updateProgress(payload);
    } else if (type === 'album-details') {
        renderAlbumDetails(payload);
    } else if (type === 'disconnect') {
        isExplicitlyDisconnected = true;
        if (ws) ws.close();
        document.getElementById('status-bar').innerText = 'Disconnected by host';
        document.getElementById('status-bar').style.color = 'var(--text-tertiary)';
    }
}

function updateUI(state) {
    try {
        currentState = state;

        if (state.queue) {
            renderQueue(state.queue);
        }

        // Safe icon access
        const iconPlay = (typeof ICONS !== 'undefined' && ICONS.Play) ? ICONS.Play : '▶';
        const iconPause = (typeof ICONS !== 'undefined' && ICONS.Pause) ? ICONS.Pause : '⏸';
        const iconRepeat = (typeof ICONS !== 'undefined' && ICONS.Repeat) ? ICONS.Repeat : '🔁';
        const iconRepeat1 = (typeof ICONS !== 'undefined' && ICONS.Repeat1) ? ICONS.Repeat1 : '🔂';

        // Common updates (Volume)
        const miniVolSlider = document.getElementById('mini-volume-slider');
        if (miniVolSlider) {
            miniVolSlider.value = state.volume;
            updateRangeFill(miniVolSlider, 'var(--text-primary)', 'var(--bg-active)');
            updateMiniVolumeIcon(state.volume, state.isMuted);
        }
        const miniVolValue = document.getElementById('mini-volume-value');
        if (miniVolValue) {
            miniVolValue.innerText = Math.round(state.volume * 100) + '%';
        }

        const miniShuffle = document.getElementById('mini-btn-shuffle');
        if (miniShuffle) miniShuffle.classList.toggle('active', state.isShuffled);

        const miniRepeat = document.getElementById('mini-btn-repeat');
        if (miniRepeat) {
            miniRepeat.classList.toggle('active', state.repeatMode !== 'off');
            miniRepeat.innerHTML = state.repeatMode === 'one' ? iconRepeat1 : iconRepeat;
        }

        if (state.currentTrack) {
            // Update Mini Player
            const trackTitle = state.currentTrack.title || 'Unknown';
            const trackArtist = state.currentTrack.artist || 'Unknown';
            const trackArtwork = state.currentTrack.artworkUrl || '';

            document.getElementById('mini-player-title').innerText = trackTitle;
            document.getElementById('mini-player-artist').innerText = trackArtist;

            const artworkImg = document.getElementById('mini-player-artwork');
            if (artworkImg) {
                artworkImg.src = sanitizeUrl(trackArtwork);
                artworkImg.alt = trackTitle;
                artworkImg.style.display = 'block';
            }
            const placeholder = document.getElementById('mini-player-placeholder');
            if (placeholder) placeholder.style.display = 'none';

            const playBtn = document.getElementById('mini-play-pause');
            playBtn.innerHTML = state.isPlaying ? iconPause : iconPlay;
            playBtn.style.opacity = '1';
            playBtn.style.cursor = 'pointer';

            // Progress
            const miniSlider = document.getElementById('mini-progress-slider');
            if (miniSlider) miniSlider.max = state.duration;

            if (!isScrubbing && miniSlider) {
                miniSlider.value = state.currentTime;
                updateRangeFill(miniSlider, 'var(--accent-primary)', 'var(--bg-active)');
            }

            // Update mini time labels
            document.getElementById('mini-current-time').innerText = formatTime(state.currentTime);
            document.getElementById('mini-total-time').innerText = formatTime(state.duration);

            if (state.isPlaying) {
                if (!progressInterval) startProgressLoop();
            } else {
                stopProgressLoop();
            }
        } else {
            // No track playing
            document.getElementById('mini-player-title').innerText = 'Not Playing';
            document.getElementById('mini-player-artist').innerText = '';

            const artworkImg = document.getElementById('mini-player-artwork');
            if (artworkImg) {
                artworkImg.src = '';
                artworkImg.style.display = 'none';
            }

            let placeholder = document.getElementById('mini-player-placeholder');
            if (!placeholder) {
                placeholder = document.createElement('div');
                placeholder.id = 'mini-player-placeholder';
                placeholder.innerText = 'No track';
                placeholder.style.width = '64px';
                placeholder.style.height = '64px';
                placeholder.style.borderRadius = '6px';
                placeholder.style.background = 'var(--bg-tertiary)';
                placeholder.style.display = 'flex';
                placeholder.style.alignItems = 'center';
                placeholder.style.justifyContent = 'center';
                placeholder.style.fontSize = '0.7rem';
                placeholder.style.color = 'var(--text-secondary)';
                placeholder.style.flexShrink = '0';

                const row = document.getElementById('mini-player-row');
                const info = document.getElementById('mini-player-info');
                if (row && info) row.insertBefore(placeholder, info);
            } else {
                placeholder.style.display = 'flex';
            }

            document.getElementById('mini-play-pause').innerHTML = iconPlay;
            document.getElementById('mini-play-pause').style.opacity = '0.5';
            document.getElementById('mini-play-pause').style.cursor = 'not-allowed';

            document.getElementById('mini-current-time').innerText = '0:00';
            document.getElementById('mini-total-time').innerText = '0:00';

            const miniSlider = document.getElementById('mini-progress-slider');
            if (miniSlider) {
                miniSlider.value = 0;
                updateRangeFill(miniSlider, 'var(--accent-primary)', 'var(--bg-active)');
            }
        }

        stopProgressLoop();
    } catch (e) {
        console.error('[Client] Error in updateUI:', e);
    }
}

function updateVolumeIcon(volume, isMuted) {
    /* Unused in mini player logic directly, but kept if needed by common func? 
       Actually updateUI calls updateMiniVolumeIcon directly. 
       We can remove this or rename updateMiniVolumeIcon to updateVolumeIcon and use mini id inside.
    */
}

function updateMiniVolumeIcon(volume, isMuted) {
    const btn = document.getElementById('mini-volume-icon');
    if (!btn) return;

    const iconVolumeX = (typeof ICONS !== 'undefined' && ICONS.VolumeX) ? ICONS.VolumeX : '🔇';
    const iconVolume1 = (typeof ICONS !== 'undefined' && ICONS.Volume1) ? ICONS.Volume1 : '🔈';
    const iconVolume2 = (typeof ICONS !== 'undefined' && ICONS.Volume2) ? ICONS.Volume2 : '🔊';

    if (isMuted || volume === 0) {
        btn.innerHTML = iconVolumeX;
    } else if (volume < 0.5) {
        btn.innerHTML = iconVolume1;
    } else {
        btn.innerHTML = iconVolume2;
    }
}

let progressInterval;
let lastUpdateTime = 0;

function startProgressLoop() {
    if (progressInterval) cancelAnimationFrame(progressInterval);

    function loop() {
        if (currentState.isPlaying) {
            const now = Date.now();
            const elapsed = (now - lastUpdateTime) / 1000;
            currentState.currentTime += elapsed;
            lastUpdateTime = now;

            if (currentState.currentTime > currentState.duration) {
                currentState.currentTime = currentState.duration;
            }

            updateProgressUI(currentState.currentTime, currentState.duration);
        }
        progressInterval = requestAnimationFrame(loop);
    }
    lastUpdateTime = Date.now();
    loop();
}

function stopProgressLoop() {
    if (progressInterval) cancelAnimationFrame(progressInterval);
}

function updateProgress(data) {
    if (!isScrubbing) {
        const { currentTime, duration } = data;
        currentState.currentTime = currentTime;
        currentState.duration = duration;
        lastUpdateTime = Date.now();
        updateProgressUI(currentTime, duration);
    }
}

function updateProgressUI(currentTime, duration) {
    const miniSlider = document.getElementById('mini-progress-slider');

    if (!isScrubbing) {
        if (miniSlider) {
            miniSlider.max = duration || 1;
            miniSlider.value = currentTime;
            updateRangeFill(miniSlider, 'var(--accent-primary)', 'var(--bg-active)');
        }
    }

    const miniCurrentEl = document.getElementById('mini-current-time');
    const miniTotalEl = document.getElementById('mini-total-time');

    if (miniCurrentEl) miniCurrentEl.innerText = formatTime(currentTime);
    if (miniTotalEl) miniTotalEl.innerText = formatTime(duration);
}

function updateRangeFill(slider, activeColor, inactiveColor) {
    if (!slider) return;
    const val = parseFloat(slider.value);
    const min = parseFloat(slider.min || 0);
    const max = parseFloat(slider.max || 100);

    let percentage = 0;
    if (max > min) {
        percentage = ((val - min) / (max - min)) * 100;
    }

    slider.style.backgroundImage = `linear-gradient(to right, ${activeColor} 0%, ${activeColor} ${percentage}%, ${inactiveColor} ${percentage}%, ${inactiveColor} 100%)`;
}

function onSeekInput(val) {
    const time = parseFloat(val);
    const miniSlider = document.getElementById('mini-progress-slider');

    if (miniSlider) updateRangeFill(miniSlider, 'var(--accent-primary)', 'var(--bg-active)');

    currentState.currentTime = time;
    lastUpdateTime = Date.now();

    const miniCurrentEl = document.getElementById('mini-current-time');
    if (miniCurrentEl) miniCurrentEl.innerText = formatTime(time);
}

function onSeekChange(val) {
    const time = parseFloat(val);
    const miniSlider = document.getElementById('mini-progress-slider');

    if (miniSlider) {
        miniSlider.value = time;
        updateRangeFill(miniSlider, 'var(--accent-primary)', 'var(--bg-active)');
    }

    currentState.currentTime = time;
    lastUpdateTime = Date.now();

    const miniCurrentEl = document.getElementById('mini-current-time');
    if (miniCurrentEl) miniCurrentEl.innerText = formatTime(time);

    sendCommand('seek', time);
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    const btn = document.querySelector('.tab-btn[onclick*="' + tabId + '"]');
    if (btn) btn.classList.add('active');

    const tabContent = document.getElementById(tabId + '-tab');
    if (tabContent) tabContent.classList.add('active');

    if (tabId === 'collection') {
        sendCommand('get-collection');
    } else if (tabId === 'radio') {
        sendCommand('get-radio-stations');
    } else if (tabId === 'playlists') {
        sendCommand('get-playlists');
    }
}

function filterCollection(query) {
    const lowerQuery = query.toLowerCase();
    const filtered = fullCollectionItems.filter(item =>
        (item.title && item.title.toLowerCase().includes(lowerQuery)) ||
        (item.artist && item.artist.toLowerCase().includes(lowerQuery))
    );
    renderCollectionItems(filtered);
}

function renderCollection(collection) {
    fullCollectionItems = collection.items;
    renderCollectionItems(fullCollectionItems);
}

function renderCollectionItems(items) {
    const list = document.getElementById('collection-list');
    list.innerHTML = '';

    if (items.length === 0) {
        list.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">No items found</div>';
        return;
    }

    items.forEach((item, index) => {
        try {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.onclick = () => {
                if (item.type === 'album') {
                    if (item.trackCount !== 1 || item.hasTracks) {
                        showAlbum(item.albumUrl || item.item_url);
                    } else {
                        sendCommand('play-album', item.albumUrl || item.item_url);
                    }
                } else {
                    sendCommand('play-track', item);
                }
            };

            const artworkUrl = item.artworkUrl || '';
            const title = item.title || 'Unknown';
            const artist = item.artist || 'Unknown';

            const img = document.createElement('img');
            img.src = sanitizeUrl(artworkUrl);
            img.alt = title;
            div.appendChild(img);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'list-item-info';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'list-item-title';
            titleDiv.innerText = title;
            infoDiv.appendChild(titleDiv);

            const artistDiv = document.createElement('div');
            artistDiv.className = 'list-item-subtitle';
            artistDiv.innerText = artist;
            infoDiv.appendChild(artistDiv);

            div.appendChild(infoDiv);

            const btn = document.createElement('button');
            btn.className = 'item-options-btn';
            btn.innerHTML = (typeof ICONS !== 'undefined' && ICONS.MoreVertical) ? ICONS.MoreVertical : '...';
            btn.onclick = (e) => {
                e.stopPropagation();
                showCollectionOptions(item);
            };

            div.appendChild(btn);
            list.appendChild(div);
        } catch (e) {
            console.error('[Client] Error rendering collection item at index ' + index, e);
        }
    });
}

function showAlbum(url) {
    // Manually switch to album tab (not in nav bar)
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById('album-tab').classList.add('active');

    document.getElementById('album-view-title').innerText = 'Loading...';
    document.getElementById('album-view-artist').innerText = '';
    document.getElementById('album-view-tracks').innerHTML = '<div style="padding:2rem;text-align:center">Loading tracks...</div>';

    sendCommand('get-album', url);
}

function renderAlbumDetails(album) {
    const title = album.title || 'Unknown Album';
    const artist = album.artist || 'Unknown Artist';
    const artworkUrl = album.artworkUrl || '';

    document.getElementById('album-view-title').innerText = title;
    document.getElementById('album-view-artist').innerText = artist;
    document.getElementById('album-view-artwork').src = sanitizeUrl(artworkUrl);

    document.getElementById('album-view-play').onclick = () => sendCommand('play-album', album.bandcampUrl);
    document.getElementById('album-view-queue').onclick = () => sendCommand('add-album-to-queue', { albumUrl: album.bandcampUrl, playNext: false });

    const list = document.getElementById('album-view-tracks');
    list.innerHTML = '';

    if (!album.tracks || album.tracks.length === 0) {
        list.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-tertiary)">No tracks found</div>';
        return;
    }

    album.tracks.forEach((track, index) => {
        try {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.onclick = () => sendCommand('play-track', track);

            const trackTitle = track.title || 'Unknown';
            const trackDuration = track.duration || 0;

            const indexDiv = document.createElement('div');
            indexDiv.style.width = '24px';
            indexDiv.style.textAlign = 'center';
            indexDiv.style.color = 'var(--text-tertiary)';
            indexDiv.style.fontSize = '0.8rem';
            indexDiv.innerText = (index + 1).toString();
            div.appendChild(indexDiv);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'list-item-info';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'list-item-title';
            titleDiv.innerText = trackTitle;
            infoDiv.appendChild(titleDiv);

            const durationDiv = document.createElement('div');
            durationDiv.className = 'list-item-subtitle';
            durationDiv.innerText = formatDuration(trackDuration);
            infoDiv.appendChild(durationDiv);

            div.appendChild(infoDiv);

            const btn = document.createElement('button');
            btn.className = 'item-options-btn';
            btn.innerHTML = (typeof ICONS !== 'undefined' && ICONS.MoreVertical) ? ICONS.MoreVertical : '...';
            btn.onclick = (e) => {
                e.stopPropagation();
                showCollectionOptions({ ...track, type: 'track' });
            };
            div.appendChild(btn);

            list.appendChild(div);
        } catch (e) {
            console.error('[Client] Error rendering album track at index ' + index, e);
        }
    });
}


let currentCollectionItem = null;

function showCollectionOptions(item) {
    currentCollectionItem = item;
    const modal = document.getElementById('options-modal');
    const title = document.getElementById('modal-title');
    const list = document.getElementById('modal-options');

    title.innerText = item.title;
    list.innerHTML = '';

    const isAlbum = item.type === 'album';

    // Play Next
    const playNextBtn = document.createElement('div');
    playNextBtn.className = 'options-item';
    playNextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/><line x1="19" y1="5" x2="19" y2="19"/></svg> Play Next';
    playNextBtn.onclick = () => {
        if (isAlbum) sendCommand('add-album-to-queue', { albumUrl: item.albumUrl || item.item_url, playNext: true });
        else sendCommand('add-track-to-queue', { track: item, playNext: true });
        modal.classList.remove('active');
    };
    list.appendChild(playNextBtn);

    // Add to Queue
    const queueBtn = document.createElement('div');
    queueBtn.className = 'options-item';
    queueBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add to Queue';
    queueBtn.onclick = () => {
        if (isAlbum) sendCommand('add-album-to-queue', { albumUrl: item.albumUrl || item.item_url, playNext: false });
        else sendCommand('add-track-to-queue', { track: item, playNext: false });
        modal.classList.remove('active');
    };
    list.appendChild(queueBtn);

    // Add to Playlist
    const playlistBtn = document.createElement('div');
    playlistBtn.className = 'options-item';
    playlistBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> Add to Playlist';
    playlistBtn.onclick = () => {
        showCollectionPlaylistSelection(item);
    };
    list.appendChild(playlistBtn);

    modal.classList.add('active');
}

function showCollectionPlaylistSelection(item) {
    const modal = document.getElementById('options-modal');
    const title = document.getElementById('modal-title');
    const list = document.getElementById('modal-options');

    // We need to fetch playlists if not available?
    // Use global playlists variable if available?
    // Assuming playlists are cached in JS or we can access them.
    // We can trigger 'get-playlists' but that's async.
    // But 'renderPlaylists' populates the playlist tab. 
    // We can assume 'playlists' (global data) might not be available.
    // But existing playlist modal code (for radio) likely used 'currentPlaylists'.
    // I need to check renderPlaylists to see if it saves data.

    // Hack: Trigger get-playlists and wait? No.
    // Better: Assume playlists are loaded. Client usually loads them.
    // I'll send 'get-playlists' on connect.

    // I'll assume 'renderPlaylists' stores them or I can get them from DOM?
    // Let's implement dynamic playlist fetching later or now?
    // I'll just check if I can use a simpler approach.
    // I'll use sendCommand('get-playlists') and handle response to open modal?
    // That's complex.

    // Let's assume we have them. 
    // I'll implement showCollectionPlaylistSelection assuming we have a global 'allPlaylists' or similar.
    // If not, I'll need to update renderPlaylists to store them.

    // Wait, I'll verify renderPlaylists in next turn if needed.
    // For now I'll just put a placeholder or basic implementation.
    // Actually, Radio implementation had playlists?
    // I'll use the same logic as Radio if I can find it.
    // Radio used 'showRadioPlaylistSelection' (hypothetically).

    // I'll just implement it to Render message 'Loading...' and send 'get-playlists'.
    // Then 'playlists-data' handler can check if we are in 'selection mode'.
    // That's robust.

    title.innerText = 'Select Playlist';
    list.innerHTML = '<div style="padding: 1rem; color: #888;">Loading playlists...</div>';

    // Set a flag
    window.selectingPlaylistFor = { item: item, type: item.type === 'album' ? 'album' : 'track' };
    sendCommand('get-playlists');
}

function renderRadio(stations) {
    const list = document.getElementById('radio-list');
    list.innerHTML = '';

    stations.forEach((station, index) => {
        try {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.onclick = () => sendCommand('play-station', station);

            const content = document.createElement('div');
            content.style.display = 'flex';
            content.style.alignItems = 'center';
            content.style.flex = '1';
            content.style.gap = '1rem';
            content.style.overflow = 'hidden';

            const imageUrl = station.imageUrl || '';
            const name = station.name || 'Unknown';
            const description = station.description || '';
            const date = station.date || '';

            const img = document.createElement('img');
            img.src = sanitizeUrl(imageUrl);
            img.alt = '';
            content.appendChild(img);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'list-item-info';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'list-item-title';
            titleDiv.innerText = name;
            infoDiv.appendChild(titleDiv);

            if (date) {
                const dateDiv = document.createElement('div');
                dateDiv.className = 'list-item-subtitle';
                dateDiv.style.color = 'var(--text-primary)';
                dateDiv.style.marginBottom = '0.2rem';
                dateDiv.style.fontSize = '0.75rem';
                dateDiv.style.textTransform = 'uppercase';
                dateDiv.innerText = date;
                infoDiv.appendChild(dateDiv);
            }

            const descDiv = document.createElement('div');
            descDiv.className = 'list-item-subtitle';
            descDiv.innerText = description;
            infoDiv.appendChild(descDiv);

            content.appendChild(infoDiv);
            div.appendChild(content);

            const btn = document.createElement('button');
            btn.className = 'options-btn';
            btn.innerHTML = (typeof ICONS !== 'undefined' && ICONS.MoreVertical) ? ICONS.MoreVertical : '...';
            btn.onclick = (e) => {
                e.stopPropagation();
                showRadioOptions(station);
            };
            div.appendChild(btn);

            list.appendChild(div);
        } catch (e) {
            console.error('[Client] Error rendering station at index ' + index, e);
        }
    });
}

function renderPlaylists(playlists) {
    allPlaylists = playlists;
    const list = document.getElementById('playlists-list');
    list.innerHTML = '';

    // If modal is open for selection, update it
    if (document.getElementById('options-modal').classList.contains('active') &&
        document.getElementById('modal-title').innerText === 'Select Playlist') {
        renderPlaylistSelection();
    }

    if (playlists.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-tertiary)">No playlists found</div>';
        return;
    }

    playlists.forEach(playlist => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.onclick = () => sendCommand('play-playlist', playlist.id);
        // Use first track artwork or default
        const artwork = playlist.artworkUrl || 'https://bandcamp.com/img/0.gif';
        const img = document.createElement('img');
        img.src = sanitizeUrl(artwork);
        img.alt = '';
        img.style.background = 'var(--bg-tertiary)';
        div.appendChild(img);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'list-item-info';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'list-item-title';
        titleDiv.innerText = playlist.name;
        infoDiv.appendChild(titleDiv);

        const subtitleDiv = document.createElement('div');
        subtitleDiv.className = 'list-item-subtitle';
        // Safe to use template literal for numbers/ trusted data, but cleaner to use innerText
        subtitleDiv.innerText = `${playlist.trackCount} tracks • ${formatDuration(playlist.totalDuration)}`;
        infoDiv.appendChild(subtitleDiv);

        div.appendChild(infoDiv);

        const btn = document.createElement('button');
        btn.className = 'item-options-btn';
        btn.innerHTML = (typeof ICONS !== 'undefined' && ICONS.MoreVertical) ? ICONS.MoreVertical : '...';
        btn.onclick = (e) => {
            e.stopPropagation();
            showPlaylistOptions(playlist);
        };
        div.appendChild(btn);

        list.appendChild(div);
    });
}

function createPlaylist() {
    const name = prompt("Enter playlist name:");
    if (name) {
        sendCommand('create-playlist', { name: name });
    }
}

function showPlaylistOptions(playlist) {
    document.getElementById('modal-title').innerText = playlist.name;
    const options = document.getElementById('modal-options');
    options.innerHTML = '';

    const playBtn = document.createElement('div');
    playBtn.className = 'modal-option';
    playBtn.onclick = () => {
        closeModal();
        sendCommand('play-playlist', playlist.id);
    };
    playBtn.innerHTML = `${(typeof ICONS !== 'undefined' && ICONS.Play) ? ICONS.Play : '▶'} <span style="margin-left:8px">Play Now</span>`;
    options.appendChild(playBtn);

    const renameBtn = document.createElement('div');
    renameBtn.className = 'modal-option';
    renameBtn.onclick = () => {
        closeModal();
        renamePlaylist(playlist.id, playlist.name);
    };
    renameBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        <span style="margin-left:8px">Rename</span>
    `;
    options.appendChild(renameBtn);

    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'modal-option';
    deleteBtn.onclick = () => {
        closeModal();
        deletePlaylist(playlist.id);
    };
    deleteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        <span style="margin-left:8px">Delete</span>
    `;
    options.appendChild(deleteBtn);

    document.getElementById('options-modal').classList.add('active');
}

function renamePlaylist(id, oldName) {
    const name = prompt("Rename playlist:", oldName);
    if (name && name !== oldName) {
        sendCommand('update-playlist', { id: id, name: name });
    }
}

function deletePlaylist(id) {
    if (confirm("Are you sure you want to delete this playlist?")) {
        sendCommand('delete-playlist', id);
    }
}

function renderQueue(queue) {
    const list = document.getElementById('queue-list');
    const headerCount = document.getElementById('queue-count');

    if (headerCount) headerCount.innerText = queue.items.length + ' tracks';

    list.innerHTML = '';

    if (queue.items.length === 0) {
        list.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">Queue is empty</div>';
        return;
    }

    queue.items.forEach((item, index) => {
        try {
            const div = document.createElement('div');
            div.className = 'list-item';
            if (index === queue.currentIndex) div.style.background = 'var(--bg-active)';

            div.onclick = () => sendCommand('play-queue-index', index);

            const isPlaying = index === queue.currentIndex && currentState.isPlaying;

            // Safe access to track properties
            const track = item.track || {};
            const artworkUrl = track.artworkUrl || '';
            const title = track.title || 'Unknown';
            const artist = track.artist || 'Unknown';
            const playIcon = (typeof ICONS !== 'undefined' && ICONS.Play) ? ICONS.Play : '▶';

            const img = document.createElement('img');
            img.src = sanitizeUrl(artworkUrl);
            img.alt = '';
            div.appendChild(img);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'list-item-info';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'list-item-title';
            if (index === queue.currentIndex) {
                titleDiv.style.color = 'var(--accent-primary)';
            }
            titleDiv.innerText = title;
            infoDiv.appendChild(titleDiv);

            const artistDiv = document.createElement('div');
            artistDiv.className = 'list-item-subtitle';
            artistDiv.innerText = artist;
            infoDiv.appendChild(artistDiv);

            div.appendChild(infoDiv);

            if (isPlaying) {
                const playIconDiv = document.createElement('div');
                playIconDiv.style.color = 'var(--accent-primary)';
                playIconDiv.style.marginRight = '8px';
                playIconDiv.innerHTML = playIcon; // ICONS are trusted
                div.appendChild(playIconDiv);
            }

            const btn = document.createElement('button');
            btn.className = 'item-options-btn';
            btn.innerHTML = (typeof ICONS !== 'undefined' && ICONS.MoreVertical) ? ICONS.MoreVertical : '...';
            btn.onclick = (e) => {
                e.stopPropagation();
                showQueueOptions(item, index);
            };

            div.appendChild(btn);
            list.appendChild(div);
        } catch (e) {
            console.error('[Client] Error rendering queue item at index ' + index, e);
        }
    });
}

function sendCommand(type, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload }));
    }
}

function toggleMute() {
    sendCommand('toggle-mute');
}

function togglePlay() {
    if (currentState.isPlaying) {
        sendCommand('pause');
    } else {
        // If there's no track and we are not playing, check if we should even allow 'play'
        // But usually 'play' command handles resuming or starting queue.
        // User requirement: "play button shouldn't let play the finished queue"
        // Finished queue state means currentTrack is null but queue might not be empty (just at end).
        // If currentTrack is null, we can assume we are either stopped or finished.
        // To be safe, if we have no currentTrack, we prevent play IF the intention is to not restart.
        // However, play() on backend logic restarts if queue exists. 
        // We will block it here if currentTrack is null.
        if (currentState.currentTrack) {
            sendCommand('play');
        } else {
            // Visual feedback or just ignore?
            console.log("Cannot play: no active track");
        }
    }
}

function setVolume(val) {
    const miniVol = document.getElementById('mini-volume-slider');
    if (miniVol) updateRangeFill(miniVol, 'var(--text-primary)', 'var(--bg-active)');

    updateMiniVolumeIcon(val, currentState.isMuted);

    const miniVolValue = document.getElementById('mini-volume-value');
    if (miniVolValue) {
        miniVolValue.innerText = Math.round(val * 100) + '%';
    }

    sendCommand('set-volume', parseFloat(val));
}

function cycleRepeat() {
    const modes = ['off', 'all', 'one'];
    const currentMode = currentState.repeatMode || 'off';
    const nextIndex = (modes.indexOf(currentMode) + 1) % modes.length;
    sendCommand('set-repeat', modes[nextIndex]);
}

// --- Options Modal Logic ---
let selectedContext = null;
let allPlaylists = [];

/* showCollectionOptions is defined earlier */

function showRadioOptions(station) {
    selectedContext = { type: 'station', data: station };
    document.getElementById('modal-title').innerText = station.name;
    const options = document.getElementById('modal-options');
    options.innerHTML = '';
    const playBtn = document.createElement('div');
    playBtn.className = 'modal-option';
    playBtn.onclick = () => {
        closeModal();
        sendCommand('play-station', selectedContext.data);
    };
    playBtn.innerHTML = `${ICONS.Play} <span style="margin-left:8px">Play Now</span>`;
    options.appendChild(playBtn);

    const playNextBtn = document.createElement('div');
    playNextBtn.className = 'modal-option';
    playNextBtn.onclick = () => {
        closeModal();
        sendCommand('add-station-to-queue', { station: selectedContext.data, playNext: true });
    };
    playNextBtn.innerHTML = '<div style="width:24px"></div> Play Next';
    options.appendChild(playNextBtn);

    const queueBtn = document.createElement('div');
    queueBtn.className = 'modal-option';
    queueBtn.onclick = () => {
        closeModal();
        sendCommand('add-station-to-queue', { station: selectedContext.data, playNext: false });
    };
    queueBtn.innerHTML = '<div style="width:24px"></div> Add to Queue';
    options.appendChild(queueBtn);

    const playlistBtn = document.createElement('div');
    playlistBtn.className = 'modal-option';
    playlistBtn.onclick = () => {
        showPlaylistSelection();
    };
    playlistBtn.innerHTML = '<div style="width:24px"></div> Add to Playlist';
    options.appendChild(playlistBtn);
    document.getElementById('options-modal').classList.add('active');
}

function showQueueOptions(item, index) {
    document.getElementById('modal-title').innerText = item.track.title;
    const options = document.getElementById('modal-options');
    options.innerHTML = '';

    const playBtn = document.createElement('div');
    playBtn.className = 'modal-option';
    playBtn.onclick = () => {
        closeModal();
        sendCommand('play-queue-index', index);
    };
    playBtn.innerHTML = `${ICONS.Play} <span style="margin-left:8px">Play Now</span>`;
    options.appendChild(playBtn);

    const removeBtn = document.createElement('div');
    removeBtn.className = 'modal-option';
    removeBtn.onclick = () => {
        closeModal();
        sendCommand('remove-from-queue', item.id);
    };
    removeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span style="margin-left:8px">Remove</span>
    `;
    options.appendChild(removeBtn);

    document.getElementById('options-modal').classList.add('active');
}

function showPlaylistSelection() {
    document.getElementById('modal-title').innerText = 'Select Playlist';
    const options = document.getElementById('modal-options');
    options.innerHTML = '<div style="padding:20px;text-align:center">Loading playlists...</div>';

    if (allPlaylists.length === 0) {
        sendCommand('get-playlists');
    } else {
        renderPlaylistSelection();
    }
}

function renderPlaylistSelection() {
    const options = document.getElementById('modal-options');
    options.innerHTML = '';

    if (allPlaylists.length === 0) {
        options.innerHTML = '<div style="padding:20px;text-align:center">No playlists found</div>';
        return;
    }

    allPlaylists.forEach(pl => {
        const div = document.createElement('div');
        div.className = 'modal-option';
        div.innerText = pl.name;
        div.onclick = () => {
            closeModal();
            if (selectedContext.type === 'station') {
                sendCommand('add-station-to-playlist', { playlistId: pl.id, station: selectedContext.data });
            } else if (selectedContext.type === 'album') {
                const item = selectedContext.data;
                sendCommand('add-album-to-playlist', { playlistId: pl.id, albumUrl: item.albumUrl || item.item_url });
            } else {
                // type === 'track'
                const item = selectedContext.data;
                sendCommand('add-track-to-playlist', { playlistId: pl.id, track: item });
            }
        };
        options.appendChild(div);
    });
}

function closeModal(e) {
    if (e && e.target !== e.currentTarget && e.target.className !== 'modal-close') return;
    document.getElementById('options-modal').classList.remove('active');
}

connect();
