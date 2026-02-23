import React from 'react';
import { useStore } from '../store';
import BandcampLoginScreen from '../app/bandcamp_login';

export function SilentRefreshHandler() {
    const isSilentRefreshing = useStore(state => state.isSilentRefreshing);

    if (!isSilentRefreshing) {
        return null;
    }

    return <BandcampLoginScreen silentProp={true} />;
}
