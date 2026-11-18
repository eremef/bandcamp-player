import 'expo-router/entry';
import { nativePlayerAdapter } from './services/NitroPlayerAdapter';
import { PlaybackService } from './services/TrackPlayerService';
import { mobileLoggerService } from './services/MobileLoggerService';

mobileLoggerService.init();
nativePlayerAdapter.registerPlaybackService(PlaybackService);
