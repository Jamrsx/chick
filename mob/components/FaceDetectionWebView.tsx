import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';
import { WebView } from 'react-native-webview';
import { FACE_DETECTOR_WEB_HTML } from '../utils/faceDetectorWebHtml';

export type FaceWebDetectResult =
  | {
      ok: true;
      box: { x: number; y: number; width: number; height: number };
      landmarks: { x: number; y: number }[];
      descriptor?: number[];
    }
  | { ok: false; code: string; error?: string };

export type FaceDetectionWebViewHandle = {
  detectFromBase64: (base64: string) => Promise<FaceWebDetectResult>;
  ready: boolean;
};

const PENDING_TIMEOUT_MS = 90000;

type Pending = {
  resolve: (r: FaceWebDetectResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const FaceDetectionWebView = forwardRef<FaceDetectionWebViewHandle>(function FaceDetectionWebView(
  _props,
  ref
) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const pendingMap = useRef<Map<string, Pending>>(new Map());
  const idRef = useRef(0);

  const clearPending = useCallback((id: string, result: FaceWebDetectResult) => {
    const p = pendingMap.current.get(id);
    if (p) {
      clearTimeout(p.timer);
      pendingMap.current.delete(id);
      p.resolve(result);
    }
  }, []);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const raw = e.nativeEvent.data;
      console.log('[FACE-WEB] message len', raw?.length ?? 0);
      try {
        const msg = JSON.parse(raw) as Record<string, unknown>;
        if (msg.type === 'READY') {
          setReady(true);
          console.log('[FACE-WEB] models ready');
          return;
        }
        if (msg.type === 'INIT_ERR') {
          console.log('[FACE-WEB] init error', msg.error);
          setReady(false);
          return;
        }
        if (msg.type === 'RESULT' && typeof msg.id === 'string') {
          const id = msg.id;
          if (msg.ok === true && msg.box && Array.isArray(msg.landmarks)) {
            clearPending(id, {
              ok: true,
              box: msg.box as { x: number; y: number; width: number; height: number },
              landmarks: msg.landmarks as { x: number; y: number }[],
              descriptor: Array.isArray(msg.descriptor)
                ? (msg.descriptor as unknown[]).map((v) => Number(v)).filter((v) => Number.isFinite(v))
                : undefined,
            });
          } else {
            clearPending(id, {
              ok: false,
              code: String(msg.code ?? 'UNKNOWN'),
              error: typeof msg.error === 'string' ? msg.error : undefined,
            });
          }
        }
      } catch (err) {
        console.log('[FACE-WEB] onMessage parse error', err);
      }
    },
    [clearPending]
  );

  const detectFromBase64 = useCallback(
    (base64: string): Promise<FaceWebDetectResult> => {
      return new Promise((resolve, reject) => {
        if (!ready || !webRef.current) {
          resolve({ ok: false, code: 'NOT_READY' });
          return;
        }
        const id = `f${++idRef.current}`;
        const timer = setTimeout(() => {
          pendingMap.current.delete(id);
          resolve({ ok: false, code: 'TIMEOUT' });
        }, PENDING_TIMEOUT_MS);
        pendingMap.current.set(id, { resolve, reject, timer });

        const payload = JSON.stringify({ id, b64: base64 });
        const injected = `(function(){if(window.evaluateFace)window.evaluateFace(${JSON.stringify(
          payload
        )});})();true;`;
        webRef.current.injectJavaScript(injected);
      });
    },
    [ready]
  );

  useImperativeHandle(
    ref,
    () => ({
      detectFromBase64,
      get ready() {
        return ready;
      },
    }),
    [detectFromBase64, ready]
  );

  return (
    <View style={styles.host} pointerEvents="none" collapsable={false}>
      <WebView
        ref={webRef}
        style={styles.web}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        source={{ html: FACE_DETECTOR_WEB_HTML }}
        onMessage={onMessage}
        onError={(ev) => console.log('[FACE-WEB] WebView error', ev.nativeEvent)}
        onHttpError={(ev) => console.log('[FACE-WEB] HTTP error', ev.nativeEvent.statusCode)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
    left: -2000,
    top: -2000,
    backgroundColor: 'transparent',
  },
  web: {
    width: 1,
    height: 1,
    backgroundColor: 'transparent',
  },
});

export default FaceDetectionWebView;
