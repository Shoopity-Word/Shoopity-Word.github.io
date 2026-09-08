// -----------------------------------------------------------------------------
// D20 Auto Refresher - Background Service Worker
//
// This file contains the extension's actual automatic refresh logic.
//
// Behavior:
// 1. Wait until Chrome considers the device idle for IDLE_THRESHOLD_SECONDS.
// 2. Reload the active tab immediately.
// 3. Start a repeating alarm that refreshes every REPEAT_INTERVAL_MINUTES.
// 4. Stop that repeating alarm as soon as Chrome reports user activity again.
//
// This design avoids content scripts and broad host permissions such as
// <all_urls>.
// -----------------------------------------------------------------------------

// How long the device must have no user input before the first reload.
//
// TESTING:
//   15  = 15 seconds
//
// PRODUCTION:
//   600 = 10 minutes
const IDLE_THRESHOLD_SECONDS = 600;

// Name used to identify the repeating refresh alarm.
const REPEAT_ALARM_NAME = "d20-repeat-refresh";

// How often to reload while the device remains idle.
const REPEAT_INTERVAL_MINUTES = 10;


// -----------------------------------------------------------------------------
// Idle configuration
// -----------------------------------------------------------------------------

function configureIdleDetection() {
  // Tell Chrome how much inactivity is required before it reports "idle".
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
}


// -----------------------------------------------------------------------------
// Tab reload helper
// -----------------------------------------------------------------------------

async function reloadActiveTab(reason) {
  // Find the active tab in the last-focused Chrome window.
  //
  // Querying "active" and "lastFocusedWindow" does not require the "tabs"
  // permission because we are not requesting sensitive tab properties such
  // as the URL or page title.
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  const activeTab = tabs[0];

  if (activeTab?.id === undefined) {
    console.warn("D20 Auto Refresher: no active tab found.");
    return;
  }

  try {
    // This is the actual page refresh.
    await chrome.tabs.reload(activeTab.id);

    console.log(
      `D20 Auto Refresher: reloaded tab ${activeTab.id} (${reason}).`
    );
  } catch (error) {
    console.error("D20 Auto Refresher: reload failed:", error);
  }
}


// -----------------------------------------------------------------------------
// Repeating alarm helpers
// -----------------------------------------------------------------------------

async function startRepeatAlarm() {
  // Avoid creating duplicate alarms if one is already running.
  const existingAlarm = await chrome.alarms.get(REPEAT_ALARM_NAME);

  if (existingAlarm) {
    return;
  }

  await chrome.alarms.create(REPEAT_ALARM_NAME, {
    delayInMinutes: REPEAT_INTERVAL_MINUTES,
    periodInMinutes: REPEAT_INTERVAL_MINUTES
  });

  console.log("D20 Auto Refresher: repeat alarm started.");
}


async function stopRepeatAlarm() {
  // chrome.alarms.clear() returns true if an alarm was actually removed.
  const wasCleared = await chrome.alarms.clear(REPEAT_ALARM_NAME);

  if (wasCleared) {
    console.log("D20 Auto Refresher: repeat alarm stopped.");
  }
}


// -----------------------------------------------------------------------------
// State reconciliation
// -----------------------------------------------------------------------------

async function reconcileState() {
  // Re-apply the configured idle threshold whenever the service worker starts.
  configureIdleDetection();

  // Determine whether Chrome already considers the machine idle.
  //
  // This matters because Manifest V3 service workers may be stopped and
  // restarted by Chrome. On restart, we want the alarm state to match the
  // current device state.
  const currentState = await chrome.idle.queryState(IDLE_THRESHOLD_SECONDS);

  if (currentState === "idle") {
    await startRepeatAlarm();
  } else {
    await stopRepeatAlarm();
  }
}


// Configure idle detection immediately when this service worker loads.
configureIdleDetection();

// Reconcile alarm state in case Chrome restarted the service worker while the
// machine was already idle.
reconcileState();


// -----------------------------------------------------------------------------
// Extension lifecycle events
// -----------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  // Re-establish the expected state after install or extension update.
  reconcileState();
});


chrome.runtime.onStartup.addListener(() => {
  // Re-establish the expected state when Chrome starts.
  reconcileState();
});


// -----------------------------------------------------------------------------
// Messages from extension UI
// -----------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // The popup asks the service worker for configuration values so they are not
  // duplicated in popup.js.
  if (message?.type === "GET_CONFIGURATION") {
    sendResponse({
      idleThresholdSeconds: IDLE_THRESHOLD_SECONDS,
      repeatIntervalMinutes: REPEAT_INTERVAL_MINUTES,
      repeatAlarmName: REPEAT_ALARM_NAME
    });
  }
});


// -----------------------------------------------------------------------------
// Idle state changes
// -----------------------------------------------------------------------------

chrome.idle.onStateChanged.addListener(async (newState) => {
  console.log(
    `D20 Auto Refresher: idle state changed to "${newState}".`
  );

  if (newState === "idle") {
    // The device has just crossed the configured inactivity threshold.
    //
    // Reload once immediately, then start the repeating alarm so the page
    // continues refreshing while nobody interacts with the kiosk.
    await reloadActiveTab("idle threshold reached");
    await startRepeatAlarm();
    return;
  }

  if (newState === "active" || newState === "locked") {
    // Real user activity cancels the repeating refresh cycle.
    //
    // The next automatic reload will require the device to remain inactive
    // long enough to reach IDLE_THRESHOLD_SECONDS again.
    await stopRepeatAlarm();
  }
});


// -----------------------------------------------------------------------------
// Repeating alarm event
// -----------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Ignore unrelated alarms.
  if (alarm.name !== REPEAT_ALARM_NAME) {
    return;
  }

  // Confirm the device is still idle before refreshing.
  //
  // This is a safety check in case an activity-state event was missed or the
  // service worker was restarted.
  const currentState = await chrome.idle.queryState(IDLE_THRESHOLD_SECONDS);

  if (currentState !== "idle") {
    await stopRepeatAlarm();
    return;
  }

  await reloadActiveTab("repeat idle refresh");
});
