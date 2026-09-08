D20 Auto Refresher - Hybrid Idle + Alarms Build
Version 2.3.1


OVERVIEW
--------

This build combines chrome.idle and chrome.alarms.

The goal is to reproduce the intended kiosk behavior without requesting
<all_urls>, host permissions, or content-script access.


BEHAVIOR
--------

1. Chrome watches for device inactivity using chrome.idle.

2. When the device first reaches the configured idle threshold:
   - the active tab reloads immediately
   - a repeating chrome.alarm starts

3. While the device remains idle:
   - the active tab reloads every configured repeat interval

4. When Chrome reports activity again:
   - the repeating alarm is cancelled

5. The next automatic refresh requires the device to become idle again.


CONFIGURATION
-------------

The configuration lives only in background.js.

For testing:

    const IDLE_THRESHOLD_SECONDS = 15;
    const REPEAT_INTERVAL_MINUTES = 10;

For production:

    const IDLE_THRESHOLD_SECONDS = 600;
    const REPEAT_INTERVAL_MINUTES = 10;

popup.js requests these values from background.js, so the popup cannot become
out of sync with the actual background configuration.


PERMISSIONS
-----------

The extension requests only:

- idle
- alarms

The extension does NOT request:

- <all_urls>
- host_permissions
- content_scripts
- tabs
- activeTab
- storage
- scripting


POPUP
-----

The popup is extension-owned UI and does not run inside the webpage.

It displays:

- the actual idle threshold from background.js
- the actual repeat interval from background.js
- Chrome's current idle state using that same threshold
- whether the repeating alarm is running
- the countdown until the next repeat alarm
- a manual reload button

The manual reload button is useful for local testing and Chrome Web Store
review. It proves that the extension can reload the active tab immediately.


COMMENTS
--------

manifest.json contains no comments because standard JSON does not permit
comments. Adding JavaScript-style comments to manifest.json would make the
extension manifest invalid.

background.js, popup.js, and popup.html are commented throughout.
