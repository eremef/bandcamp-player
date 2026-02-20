// Jest Mock for remote config
export const remoteConfigService = {
    get: jest.fn(() => ({
        version: "1.0.0",
        selectors: {
            collection: {
                itemContainer: ".collection-item-container",
                artist: ".collection-item-artist",
                title: ".collection-item-title",
                link: "a.item-link",
                artwork: "img.collection-item-art",
                fallbackArtist: "Unknown Artist",
                fallbackTitle: "Untitled"
            },
            album: {
                artistDOM: [
                    "span[itemprop='byArtist']",
                    "#name-section h3",
                    "h3.album-artist",
                    "header h2",
                    ".albumArtist"
                ]
            },
            radio: {
                dataBlobElements: [
                    "#ArchiveApp",
                    "#p-show-player",
                    ".bcweekly-player"
                ],
                scriptRegexes: [
                    "data-blob=\"([^\"]+)\"",
                    "PlayerData\\s*=\\s*({.+?});"
                ]
            }
        },
        scriptKeys: {
            collection: ["collection_data", "CollectionData"],
            album: ["TralbumData", "tralbum_data", "BandData", "EmbedData"]
        },
        endpoints: {
            collectionItemsApi: "https://bandcamp.com/api/fancollection/1/collection_items",
            mobileTralbumDetailsApi: "https://bandcamp.com/api/mobile/24/tralbum_details?band_id={band_id}&tralbum_type=t&tralbum_id={track_id}",
            radioListApi: "https://bandcamp.com/api/bcweekly/3/list",
            radioShowWeb: "https://bandcamp.com/?show={showId}",
            radioWeeklyWeb: "https://bandcamp.com/weekly?show={showId}",
            radioFallbackStream: "https://bandcamp.com/bcweekly",
            artworkFormat: "https://f4.bcbits.com/img/a{art_id}_10.jpg",
            radioImageFormat: "https://f4.bcbits.com/img/{image_id}_16.jpg"
        }
    })),
    fetchLatestConfig: jest.fn().mockResolvedValue(true)
};
