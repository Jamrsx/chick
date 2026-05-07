/**
 * expo-face-detector pulls in requireNativeModule('ExpoFaceDetector') as soon as it is required.
 * That throws in Expo Go. We must NEVER require the JS package unless the native binding exists.
 */

import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

type ExpoFaceDetectorModule = typeof import('expo-face-detector');

let cached: ExpoFaceDetectorModule | null | undefined;

function isRunningInExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

function hasNativeExpoFaceDetectorBinding(): boolean {
  try {
    const nm = NativeModules as Record<string, unknown> | undefined;
    return nm != null && nm.ExpoFaceDetector != null;
  } catch {
    return false;
  }
}

/**
 * Safe to attempt require('expo-face-detector') — still may fail on odd builds; catch in load().
 */
export function canLoadNativeExpoFaceDetector(): boolean {
  if (isRunningInExpoGo()) {
    console.log('[FACE] Expo Go: skip native expo-face-detector');
    return false;
  }
  if (!hasNativeExpoFaceDetectorBinding()) {
    console.log('[FACE] Native ExpoFaceDetector not linked');
    return false;
  }
  return true;
}

export function loadExpoFaceDetector(): ExpoFaceDetectorModule | null {
  if (!canLoadNativeExpoFaceDetector()) {
    return null;
  }
  if (cached !== undefined) {
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-face-detector') as ExpoFaceDetectorModule;
    console.log('[FACE] expo-face-detector JS loaded');
    return cached;
  } catch (e) {
    console.log('[FACE] expo-face-detector require failed', e);
    cached = null;
    return null;
  }
}

/** UI hint: eligible for native detector (never calls require()). */
export function isFaceDetectorNativeAvailable(): boolean {
  return canLoadNativeExpoFaceDetector();
}
