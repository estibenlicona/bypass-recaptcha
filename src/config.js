// Configuration loader
function getConfig() {
  return {
    chromePath: process.env.CHROME_PATH,
    userDataDir: process.env.USER_DATA_DIR,
    proxy: process.env.PROXY,
    proxyType: process.env.PROXY_TYPE,
    proxyUser: process.env.PROXY_USER,
    proxyPass: process.env.PROXY_PASS,
    userAgent: process.env.USER_AGENT,
    targetUrl: process.env.TARGET_URL,
    testDocument: process.env.TEST_DOCUMENT,
    navigationTimeout: parseInt(process.env.NAVIGATION_TIMEOUT, 10),
    navigationRetries: parseInt(process.env.NAVIGATION_RETRIES, 10),
    findInputRetries: parseInt(process.env.FIND_INPUT_RETRIES, 10),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS, 10),
  };
}

module.exports = { getConfig };
