// OfflineLedger — Windows DevTools workaround
// RN 0.85/0.86's Electron debugger-shell often opens a blank white window on Windows.
// Force Metro to open DevTools in Chrome/Edge instead, and allow GET /open-debugger.
const fs = require('fs');
const path = require('path');

function patchFile(relPath, transform) {
  const file = path.join(__dirname, '..', 'node_modules', ...relPath.split('/'));
  if (!fs.existsSync(file)) {
    console.warn(`[patch-rn-devtools] skip, not found: ${relPath}`);
    return;
  }

  const original = fs.readFileSync(file, 'utf8');
  const next = transform(original, file);
  if (next == null) {
    console.log(`[patch-rn-devtools] already applied: ${relPath}`);
    return;
  }
  if (next === original) {
    console.warn(`[patch-rn-devtools] skip, unexpected contents: ${relPath}`);
    return;
  }

  fs.writeFileSync(file, next);
  console.log(`[patch-rn-devtools] patched ${relPath}`);
}

patchFile('@react-native/dev-middleware/dist/createDevMiddleware.js', src => {
  let next = src;
  let changed = false;

  if (
    !next.includes(
      'enableStandaloneFuseboxShell: config.enableStandaloneFuseboxShell ?? process.platform !== "win32"',
    )
  ) {
    const withExperiments = next
      .replace(
        'enableOpenDebuggerRedirect: config.enableOpenDebuggerRedirect ?? false,',
        'enableOpenDebuggerRedirect: config.enableOpenDebuggerRedirect ?? true,',
      )
      .replace(
        'enableStandaloneFuseboxShell: config.enableStandaloneFuseboxShell ?? true,',
        'enableStandaloneFuseboxShell: config.enableStandaloneFuseboxShell ?? process.platform !== "win32",',
      );
    if (withExperiments !== next) {
      next = withExperiments;
      changed = true;
    }
  }

  if (!next.includes('rn-devtools-reconnect.js')) {
    const needle = `  const inspectorProxy = new _InspectorProxy.default(
    normalizedServerBaseUrl,
    eventReporter,
    experiments,
    logger,
    unstable_customInspectorMessageHandler,
    unstable_trackInspectorProxyEventLoopPerf,
  );
  const middleware = (0, _connect.default)()`;
    const insert = `  const inspectorProxy = new _InspectorProxy.default(
    normalizedServerBaseUrl,
    eventReporter,
    experiments,
    logger,
    unstable_customInspectorMessageHandler,
    unstable_trackInspectorProxyEventLoopPerf,
  );
  try {
    require(_path.default.join(process.cwd(), "scripts/rn-devtools-reconnect.js"))({
      inspectorProxy,
      experiments,
      toolLauncher: unstable_toolLauncher,
      logger,
      serverBaseUrl: normalizedServerBaseUrl,
    });
  } catch (_e) {}
  const middleware = (0, _connect.default)()`;
    if (next.includes(needle)) {
      next = next.replace(needle, insert);
      changed = true;
    }
  }

  if (!changed) return null;
  return next;
});

patchFile('@react-native/dev-middleware/dist/utils/DefaultToolLauncher.js', src => {
  if (src.includes('await open(url, { wait: false })')) {
    return null;
  }

  const fromSpawned = `  launchDebuggerAppWindow: async (url) => {
    if (process.env.NODE_ENV === "test") {
      assertMockedInTests();
    }
    let chromePath;
    try {
      chromePath = ChromeLauncher.getChromePath();
    } catch (e) {
      chromePath = EdgeLauncher.getFirstInstallation();
    }
    if (chromePath == null) {
      await open(url);
      return;
    }
    const chromeFlags = [\`--app=\${url}\`, "--window-size=1200,600"];
    const childProcess = spawn(chromePath, chromeFlags, {
      detached: true,
      stdio: "ignore",
    });
    childProcess.unref();
    return;
  },`;

  const fromOriginal = `  launchDebuggerAppWindow: async (url) => {
    if (process.env.NODE_ENV === "test") {
      assertMockedInTests();
    }
    let chromePath;
    try {
      chromePath = ChromeLauncher.getChromePath();
    } catch (e) {
      chromePath = EdgeLauncher.getFirstInstallation();
    }
    if (chromePath == null) {
      await open(url);
      return;
    }
    const chromeFlags = [\`--app=\${url}\`, "--window-size=1200,600"];
    return new Promise((resolve, reject) => {
      const childProcess = spawn(chromePath, chromeFlags, {
        detached: true,
        stdio: "ignore",
      });
      childProcess.on("data", () => {
        resolve();
      });
      childProcess.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(
              \`Failed to launch debugger app window: \${chromePath} exited with code \${code}\`,
            ),
          );
        }
      });
    });
  },`;

  const to = `  launchDebuggerAppWindow: async (url) => {
    if (process.env.NODE_ENV === "test") {
      assertMockedInTests();
    }
    await open(url, { wait: false });
  },`;

  if (src.includes(fromSpawned)) return src.replace(fromSpawned, to);
  if (src.includes(fromOriginal)) return src.replace(fromOriginal, to);
  return src;
});

patchFile(
  '@react-native-community/cli-server-api/build/securityHeadersMiddleware.js',
  src => {
    if (src.includes('127\\\\.0\\\\.0\\\\.1') || src.includes('127\\.0\\.0\\.1')) {
      return null;
    }

    const from = `    const host = options.host ? options.host : 'localhost';
    // Block any cross origin request.
    if (typeof req.headers.origin === 'string' && !req.headers.origin.match(new RegExp('^https?://' + host + ':')) && !req.headers.origin.startsWith('devtools://devtools')) {
      next(new Error('Unauthorized request from ' + req.headers.origin + '. This may happen because of a conflicting browser extension. Please try to disable it and try again.'));
      return;
    }`;

    const to = `    const host = options.host ? options.host : 'localhost';
    const origin = req.headers.origin;
    const isAllowedOrigin =
      typeof origin !== 'string' ||
      origin.startsWith('devtools://devtools') ||
      /^https?:\\/\\/localhost[:/]/i.test(origin) ||
      /^https?:\\/\\/127\\.0\\.0\\.1[:/]/i.test(origin) ||
      /^https?:\\/\\/\\[::1\\][:/]/i.test(origin) ||
      new RegExp('^https?://' + host.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '[:/]', 'i').test(origin);
    if (!isAllowedOrigin) {
      next(new Error('Unauthorized request from ' + req.headers.origin + '. This may happen because of a conflicting browser extension. Please try to disable it and try again.'));
      return;
    }`;

    return src.includes(from) ? src.replace(from, to) : src;
  },
);

patchFile('@react-native-community/cli-server-api/build/index.js', src => {
  if (src.includes('maxAge: "1y"')) return null;
  const from = `  const middleware = (0, _connect().default)().use((0, _securityHeadersMiddleware.default)(options))`;
  const to = `  const debuggerFrontendPath = require("@react-native/debugger-frontend");
  const middleware = (0, _connect().default)()
  .use("/debugger-frontend", (0, _serveStatic().default)(debuggerFrontendPath, {
    fallthrough: true,
    index: false,
    maxAge: "1y",
    etag: true,
  }))
  .use((0, _securityHeadersMiddleware.default)(options))`;
  return src.includes(from) ? src.replace(from, to) : src;
});

patchFile(
  '@react-native/debugger-frontend/dist/third-party/front_end/core/i18n/i18n.js',
  src => {
    if (src.includes('timed out fetching locale"))),3e4)')) return null;
    if (!src.includes('timed out fetching locale"))),5e3)')) return src;
    return src.replace(
      'timed out fetching locale"))),5e3)',
      'timed out fetching locale"))),3e4)',
    );
  },
);
