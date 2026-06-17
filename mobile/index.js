import 'expo-router/entry';
import TrackPlayer from '@rntp/player';
import { PlaybackService } from './services/TrackPlayerService';

TrackPlayer.registerBackgroundEventHandler(() => PlaybackService);
