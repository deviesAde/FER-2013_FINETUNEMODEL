const meetBtn = document.getElementById('meet-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

let isDetecting = false;

chrome.storage.local.get(['isDetecting'], (result) => {
    isDetecting = result.isDetecting || false;
    updateBtnUI();
});

meetBtn.addEventListener('click', () => {
    isDetecting = !isDetecting;
    chrome.storage.local.set({ isDetecting });

    const type = isDetecting ? "START_MEET_DETECTION" : "STOP_MEET_DETECTION";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type }, (response) => {
                if (chrome.runtime.lastError) {
                    isDetecting = false;
                    chrome.storage.local.set({ isDetecting: false });
                    updateBtnUI();
                    alert("Please refresh Google Meet page!");
                }
            });
        }
    });

    updateBtnUI();
});

function updateBtnUI() {
    if (isDetecting) {
        meetBtn.textContent = "Stop Detection";
        meetBtn.classList.add('stop');
        statusDot.classList.add('status-active');
        statusText.textContent = "Detecting...";
    } else {
        meetBtn.textContent = "Start Detection";
        meetBtn.classList.remove('stop');
        statusDot.classList.remove('status-active');
        statusText.textContent = "Inactive";
    }
}
