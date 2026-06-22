const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/renderer/components/Layout/PlayerBar.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add settings to useStore destructuring
content = content.replace(
    'const {\n        player,',
    'const {\n        player,\n        queue,\n        settings,'
);

// 2. Replace single audioRef with dual
content = content.replace(
    'const audioRef = useRef<HTMLAudioElement>(null);',
    `const audio1Ref = useRef<HTMLAudioElement>(null);
    const audio2Ref = useRef<HTMLAudioElement>(null);
    const activeAudioRef = useRef<1 | 2>(1);
    const hasRequestedNextRef = useRef<boolean>(false);
    const fadeOutIntervalRef = useRef<NodeJS.Timeout>();
    const fadeInIntervalRef = useRef<NodeJS.Timeout>();`
);

// 3. Extract variables for crossfade
content = content.replace(
    'const { isPlaying, currentTrack, currentTime, duration, volume, isMuted, isShuffled, repeatMode } = player;',
    `const { isPlaying, currentTrack, currentTime, duration, volume, isMuted, isShuffled, repeatMode } = player;
    
    const crossfadeEnabled = settings?.crossfadeEnabled || false;
    const crossfadeDuration = settings?.crossfadeDuration || 0;`
);

// 4. We will replace the main useEffect blocks.
const syncAudioEffectStart = '    // Sync audio element with player state\n    useEffect(() => {';
const timeUpdateEffectEnd = '    }, [next, player.isCasting]);';

const blockToReplace = content.substring(
    content.indexOf(syncAudioEffectStart),
    content.indexOf(timeUpdateEffectEnd) + timeUpdateEffectEnd.length
);

const newAudioLogic = `
    const clearFades = useCallback(() => {
        if (fadeOutIntervalRef.current) clearInterval(fadeOutIntervalRef.current);
        if (fadeInIntervalRef.current) clearInterval(fadeInIntervalRef.current);
    }, []);

    const fadeAudio = useCallback((audio: HTMLAudioElement, startVol: number, endVol: number, durationSec: number, onComplete?: () => void) => {
        if (durationSec <= 0) {
            audio.volume = endVol;
            if (onComplete) onComplete();
            return;
        }

        const steps = 20;
        const stepTime = (durationSec * 1000) / steps;
        const volStep = (endVol - startVol) / steps;
        let currentStep = 0;
        audio.volume = startVol;

        const interval = setInterval(() => {
            currentStep++;
            let newVol = startVol + (volStep * currentStep);
            newVol = Math.max(0, Math.min(1, newVol));
            audio.volume = newVol;

            if (currentStep >= steps) {
                clearInterval(interval);
                if (onComplete) onComplete();
            }
        }, stepTime);

        return interval;
    }, []);

    // Sync audio element with player state (Handling track change & crossfade)
    useEffect(() => {
        const nextAudioNode = activeAudioRef.current === 1 ? audio2Ref.current : audio1Ref.current;
        const currentAudioNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
        
        if (!nextAudioNode || !currentAudioNode) return;

        if (currentTrack) {
            // Check if it's actually a new track
            if (nextAudioNode.src !== currentTrack.streamUrl && currentAudioNode.src !== currentTrack.streamUrl) {
                
                // Swap active audio
                activeAudioRef.current = activeAudioRef.current === 1 ? 2 : 1;
                hasRequestedNextRef.current = false;
                
                // Prepare next audio
                nextAudioNode.src = currentTrack.streamUrl;

                clearFades();

                const targetVolume = isMuted ? 0 : Math.pow(volume, 3);
                
                // If we have crossfade and the previous audio was playing, we fade it out
                if (crossfadeEnabled && crossfadeDuration > 0 && isPlaying && currentAudioNode.src && !currentAudioNode.paused) {
                    // start fade in for nextAudioNode
                    fadeInIntervalRef.current = fadeAudio(nextAudioNode, 0, targetVolume, crossfadeDuration);
                    
                    // start fade out for currentAudioNode
                    fadeOutIntervalRef.current = fadeAudio(currentAudioNode, currentAudioNode.volume, 0, crossfadeDuration, () => {
                        currentAudioNode.pause();
                        currentAudioNode.src = ''; // clean up memory
                    });
                } else {
                    nextAudioNode.volume = targetVolume;
                    currentAudioNode.pause();
                    currentAudioNode.src = '';
                }

                if (isPlaying && !player.isCasting) {
                    console.log('Attempting to play URL (Crossfade/New Track):', currentTrack.streamUrl);
                    nextAudioNode.play().catch(error => {
                        if (error.name !== 'AbortError') console.error('Playback error:', error);
                    });
                } else {
                    nextAudioNode.pause();
                }
            }
        } else {
            // No track playing
            audio1Ref.current.pause();
            audio2Ref.current.pause();
            audio1Ref.current.src = '';
            audio2Ref.current.src = '';
            clearFades();
        }
    }, [currentTrack]);

    // Handle isPlaying changes (pause/resume)
    useEffect(() => {
        const activeNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
        if (!activeNode) return;

        if (isPlaying && !player.isCasting) {
            if (activeNode.src) {
                activeNode.play().catch(e => {
                    if (e.name !== 'AbortError') console.error('Play error:', e);
                });
            }
        } else {
            activeNode.pause();
            // Pause the other node too just in case it was fading out
            const otherNode = activeAudioRef.current === 1 ? audio2Ref.current : audio1Ref.current;
            if (otherNode) otherNode.pause();
            clearFades();
        }
    }, [isPlaying, player.isCasting]);

    // Handle volume changes
    useEffect(() => {
        const activeNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
        if (activeNode) {
            activeNode.volume = isMuted ? 0 : Math.pow(volume, 3);
        }
    }, [volume, isMuted]);

    // Handle audio time updates
    useEffect(() => {
        const audio1 = audio1Ref.current;
        const audio2 = audio2Ref.current;
        if (!audio1 || !audio2) return;

        const attachListeners = (nodeNum: 1 | 2, audioNode: HTMLAudioElement) => {
            const handleTimeUpdate = () => {
                if (activeAudioRef.current !== nodeNum || player.isCasting) return;
                
                window.electron.player.updateTime(audioNode.currentTime, audioNode.duration);

                // Crossfade Logic
                const remaining = audioNode.duration - audioNode.currentTime;
                if (crossfadeEnabled && crossfadeDuration > 0 && remaining > 0) {
                    const hasNextTrack = player.repeatMode !== 'off' || queue.currentIndex < queue.items.length - 1;
                    
                    if (hasNextTrack && remaining <= crossfadeDuration && !hasRequestedNextRef.current) {
                        console.log('Crossfade threshold reached. Requesting next track early.');
                        hasRequestedNextRef.current = true;
                        window.electron.player.trackEnded();
                    }
                }
            };

            const handleLoadedMetadata = () => {
                if (activeAudioRef.current !== nodeNum) return;
                window.electron.player.updateTime(audioNode.currentTime, audioNode.duration);
            };

            const handleEnded = () => {
                if (activeAudioRef.current !== nodeNum) return;
                // Fallback if crossfade was skipped or it's the last track
                if (!hasRequestedNextRef.current) {
                    hasRequestedNextRef.current = true;
                    window.electron.player.trackEnded();
                }
            };

            const handleError = (e: Event) => {
                const target = e.target as HTMLAudioElement;
                const srcAttr = target.getAttribute('src');
                if (target.error?.code === 4 && (srcAttr === '' || srcAttr === null)) return;
                if (target.error?.message?.includes('Empty src')) return;
                console.error('Audio error event:', e);
            };

            audioNode.addEventListener('timeupdate', handleTimeUpdate);
            audioNode.addEventListener('loadedmetadata', handleLoadedMetadata);
            audioNode.addEventListener('ended', handleEnded);
            audioNode.addEventListener('error', handleError);

            return () => {
                audioNode.removeEventListener('timeupdate', handleTimeUpdate);
                audioNode.removeEventListener('loadedmetadata', handleLoadedMetadata);
                audioNode.removeEventListener('ended', handleEnded);
                audioNode.removeEventListener('error', handleError);
            };
        };

        const cleanup1 = attachListeners(1, audio1);
        const cleanup2 = attachListeners(2, audio2);

        return () => {
            cleanup1();
            cleanup2();
        };
    }, [crossfadeEnabled, crossfadeDuration, queue.currentIndex, queue.items.length, player.repeatMode, player.isCasting]);`;

content = content.replace(blockToReplace, newAudioLogic);

// 5. Replace audioRef in seek logic
content = content.replace(
    'if (audioRef.current && Math.abs(audioRef.current.currentTime - time) > 0.5) {',
    `const activeNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
            if (activeNode && Math.abs(activeNode.currentTime - time) > 0.5) {`
);
content = content.replace(
    'audioRef.current.currentTime = time;',
    'activeNode.currentTime = time;'
);

// 6. Replace audioRef in Media Session seek logic
content = content.replace(
    'if (details.seekTime !== undefined && audioRef.current) {',
    `const activeNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
            if (details.seekTime !== undefined && activeNode) {`
);
content = content.replace(
    'audioRef.current.currentTime = details.seekTime;',
    'activeNode.currentTime = details.seekTime;'
);

// 7. Replace audioRef in handleProgressClick
content = content.replace(
    'if (!progressRef.current || !duration || !audioRef.current) return;',
    `const activeNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
        if (!progressRef.current || !duration || !activeNode) return;`
);
content = content.replace(
    'audioRef.current.currentTime = seekTime;',
    'activeNode.currentTime = seekTime;'
);

// 8. Replace audioRef in Chromecast sync logic
content = content.replace(
    'const audio = audioRef.current;',
    'const audio = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;'
);

// 9. Update the JSX rendering audio
content = content.replace(
    '<audio ref={audioRef} />',
    `<audio ref={audio1Ref} />
            <audio ref={audio2Ref} />`
);

fs.writeFileSync(filePath, content);
console.log('PlayerBar.tsx patched successfully');
