let detectionInterval = null;
let overlayCanvas = null;
let resultsMap = new Map();
let pendingRequests = new Map();
let videoScaleMap = new Map();

let imageAssets = {
  stress: new Image(),
  neutral: new Image(),
  focus: new Image(),
  non_stress: new Image()
};

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
  imageAssets.stress.src = chrome.runtime.getURL('public/stress.png');
  imageAssets.neutral.src = chrome.runtime.getURL('public/neutral.png');
  imageAssets.focus.src = chrome.runtime.getURL('public/focus.png');
  imageAssets.non_stress.src = chrome.runtime.getURL('public/non_stress.png');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "START_MEET_DETECTION") {
    startDetection();
    sendResponse({ status: "started" });
  } else if (request.type === "STOP_MEET_DETECTION") {
    stopDetection();
    sendResponse({ status: "stopped" });
  } else if (request.type === "UPDATE_RESULTS") {
    pendingRequests.delete(request.videoId);
    const scale = videoScaleMap.get(request.videoId) || 1;
    const scaledDetections = request.detections.map(det => {
      let [x, y, w, h] = det.box;
      return {
        ...det,
        box: [x / scale, y / scale, w / scale, h / scale]
      };
    });
    resultsMap.set(request.videoId, scaledDetections);
    drawAllBoxes();
  } else if (request.type === "RELEASE_PENDING") {
    pendingRequests.delete(request.videoId);
  } else if (request.type === "SHOW_GROUP_STRESS_ALERT") {
    showStressAlert(request.ratio);
  }
  return true;
});

function showStressAlert(ratio) {
  if (document.getElementById('stress-alert-ui')) return;
  const alertDiv = document.createElement('div');
  alertDiv.id = 'stress-alert-ui';
  alertDiv.style.cssText = `position: fixed; top: 20px; right: 20px; background: #673ab7; color: white; padding: 20px; border-radius: 8px; z-index: 2147483647; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-family: Arial, sans-serif; max-width: 300px; animation: slideIn 0.5s ease;`;
  alertDiv.innerHTML = `<h3 style="margin:0 0 10px 0; font-size:18px;">⚠️ Cosmic Alert!</h3><p style="margin:0; font-size:14px; line-height:1.4;">Sebanyak <b>${ratio}%</b> peserta terdeteksi stres selama 10 menit terakhir.</p><button id="close-stress-alert" style="margin-top:15px; border:none; background:rgba(255,255,255,0.2); color:white; padding:5px 10px; border-radius:4px; cursor:pointer;">Tutup</button>`;
  const style = document.createElement('style');
  style.innerHTML = `@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`;
  document.head.appendChild(style);
  document.body.appendChild(alertDiv);
  document.getElementById('close-stress-alert').onclick = () => alertDiv.remove();
  setTimeout(() => { if (alertDiv) alertDiv.remove(); }, 10000);
}

function startDetection() {
  if (detectionInterval) return;
  if (!overlayCanvas) {
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.position = 'fixed';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.left = '0';
    overlayCanvas.style.width = '100vw';
    overlayCanvas.style.height = '100vh';
    overlayCanvas.style.pointerEvents = 'none';
    overlayCanvas.style.zIndex = '2147483647';
    document.body.appendChild(overlayCanvas);
  }
  detectionInterval = setInterval(() => { processAllVideos(); }, 250);
  requestAnimationFrame(function loop() { if (detectionInterval) { drawAllBoxes(); requestAnimationFrame(loop); } });
}

function stopDetection() {
  if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
  resultsMap.clear();
  if (overlayCanvas) { const ctx = overlayCanvas.getContext('2d'); ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); }
}

function processAllVideos() {
  const videos = document.querySelectorAll('video');
  videos.forEach((video, index) => {
    if (video.readyState === 4 && video.videoWidth > 0 && video.offsetParent !== null) {
      const videoId = `video_${index}`;
      captureAndSend(video, videoId);
    }
  });
}

function captureAndSend(video, videoId) {
  const now = Date.now();
  if (pendingRequests.has(videoId)) {
    if (now - pendingRequests.get(videoId) < 5000) return;
  }

  const MAX_WIDTH = 480;
  const originalWidth = video.videoWidth;
  const originalHeight = video.videoHeight;

  let scale = 1;
  if (originalWidth > MAX_WIDTH) {
    scale = MAX_WIDTH / originalWidth;
  }

  const capWidth = Math.floor(originalWidth * scale);
  const capHeight = Math.floor(originalHeight * scale);

  const capCanvas = document.createElement('canvas');
  capCanvas.width = capWidth;
  capCanvas.height = capHeight;
  const ctx = capCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, capWidth, capHeight);

  const imageData = capCanvas.toDataURL('image/jpeg', 0.5);

  pendingRequests.set(videoId, now);
  videoScaleMap.set(videoId, scale);

  chrome.runtime.sendMessage({ type: "STRESS_ANALYZE_IMAGE", image: imageData, videoId: videoId });
}

function drawAllBoxes() {
  if (!overlayCanvas) return;
  const ctx = overlayCanvas.getContext('2d');
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  const videos = document.querySelectorAll('video');
  videos.forEach((video, index) => {
    const videoId = `video_${index}`;
    const detections = resultsMap.get(videoId);
    if (detections && video.offsetParent !== null) {
      const rect = video.getBoundingClientRect();
      const ratioX = rect.width / video.videoWidth;
      const ratioY = rect.height / video.videoHeight;

      detections.forEach(det => {
        const [x, y, w, h] = det.box;

        const drawX = rect.left + (x * ratioX);
        const drawY = rect.top + (y * ratioY);
        const drawW = w * ratioX;
        const drawH = h * ratioY;

        let boxColor = '#ffff00';
        let bgColor = '#ffff00';
        let textColor = '#000000';
        let cortisolLabel = "LOW CORTISOL";

        if (det.label === 'stress') {
          boxColor = '#ff0000';
          bgColor = '#ff0000';
          textColor = '#ffffff';
          cortisolLabel = "HIGH CORTISOL";
        } else if (det.label === 'neutral') {
          boxColor = '#ffff00';
          bgColor = '#ffff00';
          textColor = '#000000';
          cortisolLabel = "LOW CORTISOL";
        } else if (det.label === 'focus') {
          boxColor = '#ffaa00';
          bgColor = '#ffaa00';
          textColor = '#000000';
          cortisolLabel = "LOW CORTISOL";
        } else if (det.label === 'non_stress') {
          boxColor = '#00ff00';
          bgColor = '#00ff00';
          textColor = '#000000';
          cortisolLabel = "LOW CORTISOL";
        }

        ctx.save();

        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 4;
        ctx.setLineDash([]);
        ctx.strokeRect(drawX, drawY, drawW, drawH);

        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.strokeRect(drawX, drawY, drawW, drawH);

        ctx.restore();

        ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
        const cortisolWidth = ctx.measureText(cortisolLabel).width;

        ctx.shadowColor = boxColor;
        ctx.shadowBlur = 10;
        ctx.fillStyle = bgColor;
        ctx.fillRect(drawX - 5, drawY - 50, cortisolWidth + 15, 30);

        ctx.shadowBlur = 0;

        ctx.fillStyle = textColor;
        ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
        ctx.fillText(cortisolLabel, drawX, drawY - 30);

        const confidenceText = `${det.label.toUpperCase()} ${Math.round(det.score * 100)}%`;
        ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
        const confWidth = ctx.measureText(confidenceText).width;

        ctx.fillStyle = bgColor;
        ctx.fillRect(drawX - 3, drawY - 25, confWidth + 10, 22);

        ctx.fillStyle = textColor;
        ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
        ctx.fillText(confidenceText, drawX, drawY - 10);

        const img = imageAssets[det.label];
        if (img && img.complete && img.naturalHeight > 0) {
            const imgSize = 100;
            const imgX = drawX + (drawW / 2) - (imgSize / 2);
            const imgY = drawY - 50 - imgSize - 10;
            ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
        }

        ctx.beginPath();
        ctx.fillStyle = boxColor;
        ctx.arc(drawX + drawW - 5, drawY + drawH - 5, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(drawX + drawW - 5, drawY + drawH - 5, 5, 0, 2 * Math.PI);
        ctx.stroke();
      });
    }
  });
}