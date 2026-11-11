# Karle

A reminder app that also forces a few things on you, scores your day and wraps your week.

## Put it on your iPhone

All files sit in one folder, no sub-folders, so uploading is simple.

1. On github.com, open your `karle` repository. Delete the old files and folders (`css`, `js`, `icons`, old `index.html`, `sw.js`).
2. **Add file › Upload files.** Drag in these files: `index.html`, `app.css`, `app.js`, `engine.js`, `sw.js`, `manifest.webmanifest`, `icon-180.png`, `icon-192.png`, `icon-512.png`. Click **Commit changes**.
3. Settings › Pages should still be on `main` and `/ (root)`. Wait a minute.
4. Open `https://YOUR-USERNAME.github.io/karle/` in Safari, then Share › **Add to Home Screen**.

When you upload a newer version later, change `VERSION` at the top of `sw.js`.

## Pings

iPhone doesn't let web apps send their own notifications. In Settings, pick:
- **Reminders app**: each dated reminder is copied into Apple Reminders through a Shortcut (setup steps are in Karle's Settings). Use "Send a test reminder" to check it.
- **Calendar**: each dated reminder opens as a Calendar event with an alert.

`test/` holds the logic tests (`node --test test/engine.test.js`). You don't need to upload it.
