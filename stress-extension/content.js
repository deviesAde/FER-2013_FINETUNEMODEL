let detectionInterval = null;
let overlayCanvas = null;
let resultsMap = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "START_MEET_DETECTION") {
    startDetection();
    sendResponse({ status: "started" });
  } else if (request.type === "STOP_MEET_DETECTION") {
    stopDetection();
    sendResponse({ status: "stopped" });
  } else if (request.type === "UPDATE_RESULTS") {
    resultsMap.set(request.videoId, request.detections);
    drawAllBoxes();
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
  detectionInterval = setInterval(() => { processAllVideos(); }, 2000);
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
  const capCanvas = document.createElement('canvas');
  capCanvas.width = video.videoWidth;
  capCanvas.height = video.videoHeight;
  const ctx = capCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, capCanvas.width, capCanvas.height);
  const imageData = capCanvas.toDataURL('image/jpeg', 0.6);
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
        let color = '#00ff00';
        if (det.label === 'stress') color = '#ff0000';
        if (det.label === 'focus') color = '#ffff00';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        const drawX = rect.left + (x * ratioX);
        const drawY = rect.top + (y * ratioY);
        const drawW = w * ratioX;
        const drawH = h * ratioY;
        ctx.strokeRect(drawX, drawY, drawW, drawH);

        ctx.fillStyle = color;
        ctx.font = 'bold 12px Arial';
        const confPercent = Math.round(det.score * 100);
        ctx.fillText(`${det.label.toUpperCase()} ${confPercent}%`, drawX, drawY - 5);
      });
    }
  });
}
