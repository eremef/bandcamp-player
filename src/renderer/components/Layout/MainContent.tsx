import { useStore } from '../../store/store';
import { CollectionView } from '../Collection/CollectionView';
import { PlaylistsView } from '../Playlist/PlaylistsView';
import { PlaylistDetailView } from '../Playlist/PlaylistDetailView';
import { RadioView } from '../Radio/RadioView';
import styles from './MainContent.module.css';

export function MainContent() {
    const { currentView } = useStore();

    const renderContent = () => {
        switch (currentView) {
            case 'collection':
                return <CollectionView />;
            case 'playlists':
                return <PlaylistsView />;
            case 'playlist-detail':
                return <PlaylistDetailView />;
            case 'radio':
                return <RadioView />;
            default:
                return <CollectionView />;
        }
    };

    return <main className={styles.main}>{renderContent()}</main>;
}
