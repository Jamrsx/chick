import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

export type ScanPhase = 'scanning' | 'checking' | 'mismatch';

type Props = {
  phase: ScanPhase;
  confidence?: number | null;
  threshold?: number | null;
  topInset?: number;
  bottomInset?: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function FaceScanOverlay({
  phase,
  confidence,
  threshold,
  topInset = 140,
  bottomInset = 210,
}: Props) {
  const { width, height } = useWindowDimensions();
  const scanY = useRef(new Animated.Value(0)).current;

  const availableHeight = Math.max(220, height - topInset - bottomInset);
  const frameMaxW = Math.min(width * 0.74, 360);
  const frameHFromW = frameMaxW * 1.24;
  const frameH = Math.max(220, Math.min(frameHFromW, availableHeight * 0.82));
  const frameW = Math.max(180, frameH / 1.24);

  const scanActive = useMemo(() => {
    return phase === 'checking' || phase === 'mismatch' || typeof confidence === 'number';
  }, [phase, confidence]);

  useEffect(() => {
    if (!scanActive) {
      scanY.stopAnimation();
      scanY.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scanY, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanActive, scanY]);

  const label =
    phase === 'mismatch'
      ? 'Face does not match'
      : phase === 'checking'
        ? 'Checking identity...'
        : 'Scanning face - hold steady';

  const sub =
    phase === 'mismatch'
      ? 'Use the same lighting as enrollment'
      : phase === 'checking'
        ? 'Please wait'
        : 'Look at the camera';

  const borderColor = phase === 'mismatch' ? '#f87171' : '#34d399';
  const glowColor = phase === 'mismatch' ? 'rgba(248,113,113,0.25)' : 'rgba(52,211,153,0.22)';

  const confPct =
    typeof confidence === 'number' ? Math.round(clamp01(confidence) * 100) : null;
  const threshPct =
    typeof threshold === 'number' ? Math.round(clamp01(threshold) * 100) : null;

  console.log('[FACE-UI] overlay phase', phase);
  console.log('[FACE-UI] overlay sizing', { topInset, bottomInset, frameW, frameH, availableHeight });

  return (
    <View
      style={[styles.root, { paddingTop: topInset, paddingBottom: bottomInset }]}
      pointerEvents="none"
    >
      <View style={styles.scanStack}>
        {phase === 'checking' || phase === 'mismatch' ? (
          <View
            style={[
              styles.banner,
              phase === 'mismatch' ? styles.bannerErr : styles.bannerOk,
            ]}
          >
            <Text style={styles.title}>{label}</Text>
            <Text style={styles.sub}>{sub}</Text>
            {confPct !== null ? (
              <Text style={styles.conf}>
                {confPct}%{threshPct !== null ? ` (need >= ${threshPct}%)` : ''}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View
          style={[
            styles.frameWrap,
            {
              width: frameW,
              height: frameH,
            },
          ]}
        >
          <View style={styles.frameClip}>
            <View style={[styles.glow, { backgroundColor: glowColor }]} />

            {scanActive ? (
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    backgroundColor: borderColor,
                    transform: [
                      {
                        translateY: scanY.interpolate({
                          inputRange: [0, 1],
                          outputRange: [10, frameH - 16],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ) : null}
          </View>

          <View style={[styles.frame, { borderColor }]} />
          <View style={[styles.corner, styles.tl, { borderColor }]} />
          <View style={[styles.corner, styles.tr, { borderColor }]} />
          <View style={[styles.corner, styles.bl, { borderColor }]} />
          <View style={[styles.corner, styles.br, { borderColor }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    overflow: 'hidden',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    opacity: 0.9,
  },
  frame: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderWidth: 3,
  },
  tl: {
    top: -1,
    left: -1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 22,
  },
  tr: {
    top: -1,
    right: -1,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 22,
  },
  bl: {
    bottom: -1,
    left: -1,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 22,
  },
  br: {
    bottom: -1,
    right: -1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 22,
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    borderRadius: 2,
    opacity: 0.9,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  banner: {
    marginBottom: 14,
    minWidth: 220,
    maxWidth: 320,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  bannerOk: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.5)',
  },
  bannerErr: {
    backgroundColor: 'rgba(60,15,15,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.8)',
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  sub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  conf: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
});
