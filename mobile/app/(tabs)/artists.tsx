import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Image, TextInput, Dimensions } from 'react-native';
import { useStore } from '../../store';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Artist } from '@shared/types';

const COLUMN_COUNT = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_WIDTH = (SCREEN_WIDTH - 40) / COLUMN_COUNT; // 20 padding on each side

export default function ArtistsScreen() {
    const { artists, refreshArtists, connectionStatus } = useStore();
    const [searchQuery, setSearchQuery] = useState('');
    const router = useRouter();

    useEffect(() => {
        if (connectionStatus === 'connected') {
            refreshArtists();
        }
    }, [connectionStatus]);

    const filteredArtists = useMemo(() =>
        artists.filter(artist =>
            artist.name.toLowerCase().includes(searchQuery.toLowerCase())
        ), [artists, searchQuery]
    );

    const sections = useMemo(() => {
        const groups: { [key: string]: Artist[] } = {};

        filteredArtists.forEach(artist => {
            if (!artist.name) return;
            const cleanName = artist.name.trim();
            if (!cleanName) return;

            const firstLetter = cleanName.charAt(0).toUpperCase();
            const key = /[A-Z]/.test(firstLetter) ? firstLetter : '#';

            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(artist);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === '#') return 1;
            if (b === '#') return -1;
            return a.localeCompare(b);
        });

        return sortedKeys.map(key => {
            // Chunk the artists into rows for the grid layout
            const artistRows = [];
            for (let i = 0; i < groups[key].length; i += COLUMN_COUNT) {
                artistRows.push(groups[key].slice(i, i + COLUMN_COUNT));
            }

            return {
                title: key,
                data: artistRows
            };
        });
    }, [filteredArtists]);

    const renderArtistItem = (item: Artist) => (
        <TouchableOpacity
            key={item.id}
            style={styles.artistItem}
            onPress={() => router.push({ pathname: '/artist/artist_detail', params: { id: item.id } })}
        >
            <View style={styles.avatarContainer}>
                {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.avatar} />
                ) : (
                    <View style={styles.placeholderAvatar}>
                        <Text style={styles.placeholderText}>
                            {item.name.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                )}
            </View>
            <Text style={styles.artistName} numberOfLines={1}>
                {item.name}
            </Text>
        </TouchableOpacity>
    );

    const renderRow = ({ item: row }: { item: Artist[] }) => (
        <View style={styles.row}>
            {row.map(artist => renderArtistItem(artist))}
            {/* Fill empty spots to maintain alignment */}
            {Array.from({ length: COLUMN_COUNT - row.length }).map((_, i) => (
                <View key={`empty-${i}`} style={styles.artistItem} /> // Invisible spacer
            ))}
        </View>
    );

    const renderSectionHeader = ({ section: { title } }: { section: { title: string } }) => (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{title}</Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Artists</Text>
            </View>

            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Filter artists..."
                    placeholderTextColor="#666"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Ionicons name="close-circle" size={20} color="#666" />
                    </TouchableOpacity>
                )}
            </View>

            <SectionList
                sections={sections}
                renderItem={renderRow}
                renderSectionHeader={renderSectionHeader}
                keyExtractor={(item, index) => `row-${index}-${item[0].id}`}
                contentContainerStyle={styles.listContent}
                stickySectionHeadersEnabled={false}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No artists found</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a1a',
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    title: {
        fontSize: 34,
        fontWeight: 'bold',
        color: '#fff',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#333',
        marginHorizontal: 20,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 15,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
    },
    listContent: {
        paddingBottom: 20,
    },
    sectionHeader: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: '#1a1a1a', // Match background to obscure content scrolling under
    },
    sectionHeaderText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#888',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        paddingHorizontal: 15, // 20 (screen) - 5 (item margin)
        marginBottom: 20,
    },
    artistItem: {
        width: ITEM_WIDTH,
        alignItems: 'center',
        paddingHorizontal: 5,
    },
    avatarContainer: {
        width: 90, // Slightly smaller to fit 3 columns comfortably
        height: 90,
        borderRadius: 45,
        marginBottom: 8,
        overflow: 'hidden',
        backgroundColor: '#333',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    placeholderAvatar: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#444',
    },
    placeholderText: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#888',
    },
    artistName: {
        color: '#fff',
        fontSize: 13,
        textAlign: 'center',
        fontWeight: '500',
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 50,
    },
    emptyText: {
        color: '#666',
        fontSize: 16,
    },
});
