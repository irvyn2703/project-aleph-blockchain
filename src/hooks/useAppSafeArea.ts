import { Platform, StatusBar } from 'react-native';

/** 3-button nav overlays ~48dp when Android edge-to-edge is on. */
const ANDROID_NAV_INSET = 48;
const IOS_HOME_INDICATOR = 34;
const IOS_STATUS_INSET = 47;

export function useAppSafeArea() {
  return {
    top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : IOS_STATUS_INSET,
    bottom: Platform.OS === 'android' ? ANDROID_NAV_INSET : IOS_HOME_INDICATOR,
  };
}
