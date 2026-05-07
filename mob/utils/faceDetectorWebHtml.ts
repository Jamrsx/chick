/**
 * Inline HTML for WebView: loads face-api.js from CDN + models from GitHub Pages.
 * First run needs internet; works inside Expo Go (no native ExpoFaceDetector).
 */

export const FACE_DETECTOR_WEB_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;background:#000;">
<script>
(function(){
  var MODEL = 'https://justadudewhohacks.github.io/face-api.js/models';

  function post(obj) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    } catch (e) {}
  }

  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
  s.onload = function() {
    Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL)
    ]).then(function() {
      post({ type: 'READY' });
    }).catch(function(e) {
      post({ type: 'INIT_ERR', error: String(e && e.message ? e.message : e) });
    });
  };
  s.onerror = function() {
    post({ type: 'INIT_ERR', error: 'Failed to load face-api.js script (network?)' });
  };
  document.head.appendChild(s);

  window.evaluateFace = async function(payloadJson) {
    var id = '';
    try {
      var p = JSON.parse(payloadJson);
      id = p.id;
      var b64 = p.b64;
      if (!b64 || !window.faceapi) {
        post({ type: 'RESULT', id: id, ok: false, code: 'NO_ENGINE' });
        return;
      }

      var img = new Image();
      await new Promise(function(resolve, reject) {
        img.onload = resolve;
        img.onerror = function() { reject(new Error('bad image')); };
        img.src = 'data:image/jpeg;base64,' + b64;
      });

      var opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.42 });
      var faces = await faceapi.detectAllFaces(img, opts).withFaceLandmarks().withFaceDescriptors();

      if (!faces || faces.length === 0) {
        post({ type: 'RESULT', id: id, ok: false, code: 'NO_FACE' });
        return;
      }
      if (faces.length > 1) {
        post({ type: 'RESULT', id: id, ok: false, code: 'MULTI_FACE' });
        return;
      }

      var face = faces[0];
      var box = face.detection.box;
      var pts = face.landmarks.positions.map(function(pt) {
        return { x: pt.x, y: pt.y };
      });

      post({
        type: 'RESULT',
        id: id,
        ok: true,
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        landmarks: pts,
        descriptor: Array.prototype.slice.call(face.descriptor || [])
      });
    } catch (e) {
      post({ type: 'RESULT', id: id, ok: false, code: 'ERROR', error: String(e && e.message ? e.message : e) });
    }
  };
})();
</script>
</body></html>`;
