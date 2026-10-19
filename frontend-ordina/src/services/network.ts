/**
 * Internet connection status (NetInfo). Offline means: no network, or a network that is known
 * not to reach the internet. "Unknown" counts as online, so a slow check never blocks the user.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export function isOnlineState(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/** Checks the connection right now (before sending a request). */
export async function isOnline() {
  try {
    return isOnlineState(await NetInfo.fetch());
  } catch {
    return true;
  }
}

/** Live connection status; updates by itself when the connection drops or returns. */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => setOnline(isOnlineState(state)));
    void isOnline().then(setOnline);
    return unsubscribe;
  }, []);
  return online;
}

/** Calls `listener` each time the phone comes back online. */
export function onBackOnline(listener: () => void) {
  let wasOnline = true;
  return NetInfo.addEventListener((state) => {
    const online = isOnlineState(state);
    if (online && !wasOnline) listener();
    wasOnline = online;
  });
}
