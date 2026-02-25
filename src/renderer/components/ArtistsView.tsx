import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store/store';
import type { Artist, CollectionItem, Track } from '../../shared/types';
import { ItemsGrid } from './Collection/ItemsGrid';
import { ArrowLeft, ExternalLink, Search, Play, SkipForward, List, Music, MoreHorizontal, Download } from 'lucide-react';
import styles from './ArtistsView.module.css';

export const ArtistsView: React.FC = () => {
    const {
        artists, fetchArtists, isLoadingArtists, collection, selectedArtistId, selectArtist,
        getAlbumDetails, clearQueue, addTracksToQueue, playQueueIndex,
        addTracksToPlaylist, playlists, downloadTrack,
    } = useStore();
    const [filter, setFilter] = useState('');
    const [isActionsLoading, setIsActionsLoading] = useState(false);
    const [showDetailMenu, setShowDetailMenu] = useState(false);
    const [cardMenuArtistId, setCardMenuArtistId] = useState<string | null>(null);

    useEffect(() => {
        fetchArtists();
    }, [fetchArtists]);

    const filteredArtists = artists.filter(artist =>
        artist.name.toLowerCase().includes(filter.toLowerCase())
    );

    // Pre-calculate item counts for each artist to avoid O(N*M) complexity in render
    const artistItemCounts = React.useMemo(() => {
        const counts: Record<string, number> = {};
        collection?.items.forEach(item => {
            const data = item.type === 'album' ? item.album : item.track;
            if (!data) return;

            // Use aristId if available, fallback to a name-based ID if missing
            // This matches the logic used in the scraper service
            const artistId = data.artistId || `name-${data.artist.toLowerCase().trim().replace(/[^a-z0-9]/g, '-')}`;

            if (artistId) {
                counts[artistId] = (counts[artistId] || 0) + 1;
            }
        });
        return counts;
    }, [collection]);

    // Group artists by first letter
    const groupedArtists = React.useMemo(() => {
        try {
            const groups: { [key: string]: Artist[] } = {};

            filteredArtists.forEach(artist => {
                if (!artist || !artist.name) return;
                // Trim logic to ensure clean first letter
                const cleanName = artist.name.trim();
                if (!cleanName) return;

                const firstLetter = cleanName.charAt(0).toUpperCase();
                const key = /[A-Z]/.test(firstLetter) ? firstLetter : '#';
                if (!groups[key]) {
                    groups[key] = [];
                }
                groups[key].push(artist);
            });

            const sortedGroups = Object.keys(groups).sort((a, b) => {
                if (a === '#') return 1;
                if (b === '#') return -1;
                return a.localeCompare(b);
            }).map(key => ({
                letter: key,
                artists: groups[key]
            }));

            return sortedGroups;
        } catch (e) {
            console.error('Error grouping artists:', e);
            return [];
        }
    }, [filteredArtists]);

    const getArtistTracks = useCallback(async (items: CollectionItem[]) => {
        const allTracks: Track[] = [];
        for (const item of items) {
            if (item.type === 'album' && item.album) {
                const hasValidTracks = item.album.tracks.length > 0 && item.album.tracks.every(t => !!t.streamUrl || !!t.isCached);
                if (hasValidTracks) {
                    allTracks.push(...item.album.tracks);
                } else if (item.album.bandcampUrl) {
                    const details = await getAlbumDetails(item.album.bandcampUrl);
                    if (details) allTracks.push(...details.tracks);
                }
            } else if (item.type === 'track' && item.track) {
                if (item.track.streamUrl || item.track.isCached) {
                    allTracks.push(item.track);
                } else if (item.track.bandcampUrl) {
                    const details = await getAlbumDetails(item.track.bandcampUrl);
                    if (details) allTracks.push(...details.tracks);
                }
            }
        }
        return allTracks;
    }, [getAlbumDetails]);

    const getItemsForArtist = useCallback((artistId: string) => {
        const artist = artists.find(a => a.id === artistId);
        return collection?.items.filter(item => {
            const data = item.type === 'album' ? item.album : item.track;
            if (!data) return false;
            const itemArtistId = data.artistId || `name-${data.artist.toLowerCase().trim().replace(/[^a-z0-9]/g, '-')}`;
            const matchesId = itemArtistId === artistId;
            const matchesName = artist && data.artist.toLowerCase().trim() === artist.name.toLowerCase().trim();
            return matchesId || matchesName;
        }) || [];
    }, [artists, collection]);

    const handleCardAction = useCallback(async (artistId: string, action: 'play' | 'playNext' | 'addToQueue' | 'addToPlaylist' | 'download', playlistId?: string) => {
        setCardMenuArtistId(null);
        setIsActionsLoading(true);
        try {
            const items = getItemsForArtist(artistId);
            const tracks = await getArtistTracks(items);
            if (tracks.length === 0) return;
            switch (action) {
                case 'play':
                    await clearQueue(false);
                    await addTracksToQueue(tracks);
                    await playQueueIndex(0);
                    break;
                case 'playNext':
                    await addTracksToQueue(tracks, true);
                    break;
                case 'addToQueue':
                    await addTracksToQueue(tracks);
                    break;
                case 'addToPlaylist':
                    if (playlistId) await addTracksToPlaylist(playlistId, tracks);
                    break;
                case 'download':
                    for (const track of tracks) await downloadTrack(track);
                    break;
            }
        } finally {
            setIsActionsLoading(false);
        }
    }, [getItemsForArtist, getArtistTracks, clearQueue, addTracksToQueue, playQueueIndex, addTracksToPlaylist, downloadTrack]);

    const handleArtistClick = (artist: Artist) => {
        selectArtist(artist.id);
    };

    const handleBackClick = () => {
        selectArtist(null);
    };

    if (isLoadingArtists && artists.length === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.emptyState}>Loading artists...</div>
            </div>
        );
    }

    // Detail View
    if (selectedArtistId) {
        const artist = artists.find(a => a.id === selectedArtistId);

        // Filter items for this artist
        // Match by artistId first, then name-based ID, then raw name (case-insensitive)
        const artistItems = collection?.items.filter(item => {
            const data = item.type === 'album' ? item.album : item.track;
            if (!data) return false;

            const artistId = data.artistId || `name-${data.artist.toLowerCase().trim().replace(/[^a-z0-9]/g, '-')}`;
            const matchesId = artistId === selectedArtistId;
            const matchesName = artist && data.artist.toLowerCase().trim() === artist.name.toLowerCase().trim();

            return matchesId || matchesName;
        }) || [];

        if (!artist) {
            return (
                <div className={styles.notFound}>
                    <button onClick={handleBackClick} className={styles.backButton}>
                        <ArrowLeft size={20} className="mr-2" /> Back to Artists
                    </button>
                    <div className={styles.emptyState}>Artist not found</div>
                </div>
            );
        }

        return (
            <div className={styles.container}>
                <div className={styles.detailHeader}>
                    <button
                        onClick={handleBackClick}
                        className={styles.backButton}
                        title="Back to Artists"
                    >
                        <ArrowLeft size={24} />
                    </button>

                    <div className={styles.detailImageContainer}>
                        {artist.imageUrl ? (
                            <img src={artist.imageUrl} alt={artist.name} className={styles.artistImage} />
                        ) : (
                            <div className={styles.placeholder} style={{ fontSize: '2rem' }}>
                                {artist.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>

                    <div className={styles.detailInfo}>
                        <h1>{artist.name}</h1>
                        <div className={styles.meta}>
                            <span>
                                {artistItems.length} {artistItems.length === 1 ? 'item' : 'items'} in collection
                            </span>
                            <span className={styles.dot}>•</span>
                            <a
                                href={artist.bandcampUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.link}
                            >
                                View on Bandcamp <ExternalLink size={12} className="ml-1" />
                            </a>
                        </div>
                    </div>

                    {artistItems.length > 0 && (
                        <div className={styles.detailActions}>
                            <button
                                className={styles.playAllButton}
                                disabled={isActionsLoading}
                                onClick={async () => {
                                    setIsActionsLoading(true);
                                    try {
                                        const tracks = await getArtistTracks(artistItems);
                                        if (tracks.length > 0) {
                                            await clearQueue(false);
                                            await addTracksToQueue(tracks);
                                            await playQueueIndex(0);
                                        }
                                    } finally {
                                        setIsActionsLoading(false);
                                    }
                                }}
                            >
                                <Play size={16} /> Play All
                            </button>
                            <div className={styles.moreButtonContainer} onMouseLeave={() => setShowDetailMenu(false)}>
                                <button
                                    className={styles.moreButton}
                                    onClick={() => setShowDetailMenu(!showDetailMenu)}
                                    title="More options"
                                >
                                    <MoreHorizontal size={20} />
                                </button>
                                {showDetailMenu && (
                                    <div className={styles.detailMenu} onClick={(e) => e.stopPropagation()}>
                                        <button onClick={async () => {
                                            setShowDetailMenu(false);
                                            setIsActionsLoading(true);
                                            try {
                                                const tracks = await getArtistTracks(artistItems);
                                                if (tracks.length > 0) await addTracksToQueue(tracks, true);
                                            } finally {
                                                setIsActionsLoading(false);
                                            }
                                        }}><SkipForward size={16} /> Play Next</button>
                                        <button onClick={async () => {
                                            setShowDetailMenu(false);
                                            setIsActionsLoading(true);
                                            try {
                                                const tracks = await getArtistTracks(artistItems);
                                                if (tracks.length > 0) await addTracksToQueue(tracks);
                                            } finally {
                                                setIsActionsLoading(false);
                                            }
                                        }}><List size={16} /> Add to Queue</button>
                                        {playlists.length > 0 && (
                                            <>
                                                <div className={styles.menuDivider} />
                                                <span className={styles.menuLabel}>Add to Playlist</span>
                                                {playlists.map((playlist) => (
                                                    <button key={playlist.id} onClick={async () => {
                                                        setShowDetailMenu(false);
                                                        setIsActionsLoading(true);
                                                        try {
                                                            const tracks = await getArtistTracks(artistItems);
                                                            if (tracks.length > 0) await addTracksToPlaylist(playlist.id, tracks);
                                                        } finally {
                                                            setIsActionsLoading(false);
                                                        }
                                                    }}>
                                                        <Music size={14} /> {playlist.name}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                        <div className={styles.menuDivider} />
                                        <button onClick={async () => {
                                            setShowDetailMenu(false);
                                            setIsActionsLoading(true);
                                            try {
                                                const tracks = await getArtistTracks(artistItems);
                                                for (const track of tracks) await downloadTrack(track);
                                            } finally {
                                                setIsActionsLoading(false);
                                            }
                                        }}><Download size={16} /> Download for Offline</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className={`${styles.scrollContainer} custom-scrollbar`}>
                    <ItemsGrid
                        items={artistItems}
                        emptyMessage="No items found for this artist in your collection."
                    />
                </div>
            </div>
        );
    }

    // List View
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Artists</h1>
                <div className={styles.searchContainer}>
                    <Search className={styles.searchIcon} size={18} />
                    <input
                        type="text"
                        placeholder="Search artists.."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className={styles.input}
                    />
                </div>
            </div>

            <div className={`${styles.scrollContainer} custom-scrollbar`}>
                {groupedArtists.map(group => (
                    <div key={group.letter} className={styles.group}>
                        <h2 className={styles.groupHeader}>
                            {group.letter}
                        </h2>
                        <div className={styles.grid}>
                            {group.artists.map(artist => (
                                <div
                                    key={artist.id}
                                    className={styles.artistCard}
                                    onClick={() => handleArtistClick(artist)}
                                    onMouseLeave={() => { if (cardMenuArtistId === artist.id) setCardMenuArtistId(null); }}
                                    onContextMenu={(e) => { e.preventDefault(); setCardMenuArtistId(artist.id); }}
                                >
                                    <div className={styles.imageContainer}>
                                        {artist.imageUrl ? (
                                            <img
                                                src={artist.imageUrl}
                                                alt={artist.name}
                                                className={styles.artistImage}
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className={styles.placeholder}>
                                                {artist.name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div className={styles.cardOverlay}>
                                            <button
                                                className={styles.cardPlayButton}
                                                disabled={isActionsLoading}
                                                onClick={(e) => { e.stopPropagation(); handleCardAction(artist.id, 'play'); }}
                                                title="Play"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M8 5v14l11-7z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        className={styles.cardMenuButton}
                                        onClick={(e) => { e.stopPropagation(); setCardMenuArtistId(cardMenuArtistId === artist.id ? null : artist.id); }}
                                        title="More options"
                                    >
                                        <MoreHorizontal size={16} />
                                    </button>
                                    <div className={styles.artistName} title={artist.name}>
                                        {artist.name}
                                    </div>
                                    <div className={styles.itemCount}>
                                        {artistItemCounts[artist.id] || 0} {artistItemCounts[artist.id] === 1 ? 'item' : 'items'}
                                    </div>
                                    {cardMenuArtistId === artist.id && (
                                        <div className={styles.cardMenu} onClick={(e) => e.stopPropagation()}>
                                            <button onClick={() => handleCardAction(artist.id, 'play')}><Play size={16} /> Play Now</button>
                                            <button onClick={() => handleCardAction(artist.id, 'playNext')}><SkipForward size={16} /> Play Next</button>
                                            <button onClick={() => handleCardAction(artist.id, 'addToQueue')}><List size={16} /> Add to Queue</button>
                                            {playlists.length > 0 && (
                                                <>
                                                    <div className={styles.menuDivider} />
                                                    <span className={styles.menuLabel}>Add to Playlist</span>
                                                    {playlists.map((playlist) => (
                                                        <button key={playlist.id} onClick={() => handleCardAction(artist.id, 'addToPlaylist', playlist.id)}>
                                                            <Music size={14} /> {playlist.name}
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                            <div className={styles.menuDivider} />
                                            <button onClick={() => handleCardAction(artist.id, 'download')}><Download size={16} /> Download for Offline</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {filteredArtists.length === 0 && (
                    <div className={styles.emptyState}>
                        <p className="text-lg">No artists found</p>
                        {filter && <p className="text-sm">Try a different search term</p>}
                    </div>
                )}
            </div>
        </div>
    );
};
