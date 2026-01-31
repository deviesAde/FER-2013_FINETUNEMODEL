const API_BASE = "http://localhost:8000";
let stressHistory = {};
const ALERT_THRESHOLD = 0.7;
const STRESS_DURATION_THRESHOLD = 10 * 60 * 1000;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "STRESS_ANALYZE_IMAGE") {
        analyzeMultiFace(request, sender.tab.id);
    }
    return true;
});

async function analyzeMultiFace(data, tabId) {
    try {
        const response = await fetch(`${API_BASE}/analyze-frame`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: data.image, videoId: data.videoId })
        });
        if (!response.ok) return;
        const result = await response.json();
        const now = Date.now();
        chrome.tabs.sendMessage(tabId, { type: "UPDATE_RESULTS", videoId: result.videoId, detections: result.detections }).catch(() => { });
        updateStressHistory(result.videoId, result.detections, now);
        checkGroupStress(tabId);
        if (result.detections.length > 0) {
            chrome.runtime.sendMessage({ type: "STRESS_RESULT", data: result.detections[0] }).catch(() => { });
        }
    } catch (error) { }
}

function updateStressHistory(videoId, detections, now) {
    if (detections.length === 0) return;
    const isStressed = detections.some(d => d.label === 'stress');
    if (!stressHistory[videoId]) {
        stressHistory[videoId] = { firstStressTime: isStressed ? now : null, lastSeen: now };
    } else {
        stressHistory[videoId].lastSeen = now;
        if (isStressed) { if (!stressHistory[videoId].firstStressTime) stressHistory[videoId].firstStressTime = now; }
        else { stressHistory[videoId].firstStressTime = null; }
    }
}

function checkGroupStress(tabId) {
    const now = Date.now();
    const activeParticipants = Object.keys(stressHistory).filter(id => (now - stressHistory[id].lastSeen) < 10000);
    if (activeParticipants.length < 2) return;
    const stressedParticipants = activeParticipants.filter(id => {
        const h = stressHistory[id];
        return h.firstStressTime && (now - h.firstStressTime) >= STRESS_DURATION_THRESHOLD;
    });
    const stressRatio = stressedParticipants.length / activeParticipants.length;
    if (stressRatio >= ALERT_THRESHOLD) {
        chrome.tabs.sendMessage(tabId, { type: "SHOW_GROUP_STRESS_ALERT", ratio: Math.round(stressRatio * 100) }).catch(() => { });
    }
}
