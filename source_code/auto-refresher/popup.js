// -----------------------------------------------------------------------------
// D20 Auto Refresher - Popup
//
// This popup is intended mainly for testing and Chrome Web Store review.
//
// Important:
// Configuration values are NOT hard-coded here. The popup asks background.js
// for the actual values in use so there is only one source of truth.
// -----------------------------------------------------------------------------

const idleThresholdElement = document.getElementById("idleThreshold");
const repeatIntervalElement = document.getElementById("repeatInterval");
const idleStateElement = document.getElementById("idleState");
const alarmStateElement = document.getElementById("alarmState");
const statusElement = document.getElementById("status");
const reloadButton = document.getElementById("reloadNow");


// Configuration values supplied by background.js.
let idleThresholdSeconds = null;
let repeatIntervalMinutes = null;
let repeatAlarmName = null;


// -----------------------------------------------------------------------------
// Formatting helpers
// -----------------------------------------------------------------------------

function formatDurationFromSeconds(seconds) {
  // Use a friendlier label for common values.
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  return `${seconds} seconds`;
}


function formatDurationFromMinutes(minutes) {
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}


// -----------------------------------------------------------------------------
// Load configuration from background.js
// -----------------------------------------------------------------------------

async function loadConfiguration() {
  const response = await chrome.runtime.sendMessage({
    type: "GET_CONFIGURATION"
  });

  idleThresholdSeconds = response.idleThresholdSeconds;
  repeatIntervalMinutes = response.repeatIntervalMinutes;
  repeatAlarmName = response.repeatAlarmName;

  idleThresholdElement.textContent =
    formatDurationFromSeconds(idleThresholdSeconds);

  repeatIntervalElement.textContent =
    formatDurationFromMinutes(repeatIntervalMinutes);
}


// -----------------------------------------------------------------------------
// Refresh popup status
// -----------------------------------------------------------------------------

async function refreshStatus() {
  // Do not query until we have received the actual configuration values.
  if (
    idleThresholdSeconds === null ||
    repeatIntervalMinutes === null ||
    repeatAlarmName === null
  ) {
    return;
  }

  try {
    // Ask Chrome whether the machine has been inactive for at least the same
    // threshold used by background.js.
    idleStateElement.textContent =
      await chrome.idle.queryState(idleThresholdSeconds);
  } catch (error) {
    idleStateElement.textContent = "unavailable";
  }

  try {
    const alarm = await chrome.alarms.get(repeatAlarmName);

    if (!alarm) {
      alarmStateElement.textContent = "not running";
      return;
    }

    // Show the countdown to the next repeat refresh.
    const remainingSeconds = Math.max(
      0,
      Math.ceil((alarm.scheduledTime - Date.now()) / 1000)
    );

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    alarmStateElement.textContent =
      `running (${minutes}:${String(seconds).padStart(2, "0")} remaining)`;
  } catch (error) {
    alarmStateElement.textContent = "unavailable";
  }
}


// -----------------------------------------------------------------------------
// Manual reload button
// -----------------------------------------------------------------------------

reloadButton.addEventListener("click", async () => {
  statusElement.textContent = "Reloading...";

  try {
    // Find the active tab in the popup's current Chrome window.
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    const activeTab = tabs[0];

    if (activeTab?.id === undefined) {
      statusElement.textContent = "No active tab found.";
      return;
    }

    // Reload the active tab immediately.
    await chrome.tabs.reload(activeTab.id);

    statusElement.textContent = "Reload requested successfully.";
  } catch (error) {
    statusElement.textContent = `Reload failed: ${error.message}`;
  }
});


// -----------------------------------------------------------------------------
// Startup
// -----------------------------------------------------------------------------

async function initializePopup() {
  try {
    await loadConfiguration();
    await refreshStatus();

    // Keep the displayed idle/alarm state current while the popup is open.
    setInterval(refreshStatus, 1000);
  } catch (error) {
    statusElement.textContent = `Unable to load extension status: ${error.message}`;
  }
}

initializePopup();
