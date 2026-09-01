import 'expo-router/entry';
import TrackPlayer from '@rntp/player';
import { PlaybackService } from './services/TrackPlayerService';
import { mobileLoggerService } from './services/MobileLoggerService';

mobileLoggerService.init();
TrackPlayer.registerBackgroundEventHandler(() => PlaybackService);
