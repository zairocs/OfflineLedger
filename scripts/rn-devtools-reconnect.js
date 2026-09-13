// Auto-reopen used to spawn a second DevTools tab, which Hermes disconnects
// with "opening a second DevTools window for the same app". Leave a single
// debugger tab open after the app is running instead.
function setupDevToolsReconnect() {}

module.exports = setupDevToolsReconnect;
