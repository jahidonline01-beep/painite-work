#!/usr/bin/env node
/**
 * After `npx cap add android` / `npx cap sync`, patch MainActivity so the
 * WebView accepts third-party cookies. Required for 555api Cloudflare
 * challenge to complete inside the in-app Inbox iframe.
 */
const fs = require('fs');
const path = require('path');

function findMainActivity(dir, depth = 0) {
  if (depth > 10 || !fs.existsSync(dir)) return null;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (name === 'build' || name === '.gradle') continue;
      const found = findMainActivity(full, depth + 1);
      if (found) return found;
    } else if (name === 'MainActivity.java' || name === 'MainActivity.kt') {
      return full;
    }
  }
  return null;
}

const root = process.cwd();
const androidSrc = path.join(root, 'android', 'app', 'src', 'main');
const main = findMainActivity(androidSrc);
if (!main) {
  console.log('[patch-android-webview] MainActivity not found — skip');
  process.exit(0);
}

let src = fs.readFileSync(main, 'utf8');
if (src.includes('setAcceptThirdPartyCookies')) {
  console.log('[patch-android-webview] already patched:', main);
  process.exit(0);
}

const isKotlin = main.endsWith('.kt');
const marker = isKotlin ? 'super.onCreate' : 'super.onCreate';

if (!src.includes(marker)) {
  console.log('[patch-android-webview] onCreate not found — skip');
  process.exit(0);
}

if (isKotlin) {
  if (!src.includes('android.webkit.CookieManager')) {
    src = src.replace(
      /(package [^\n]+\n)/,
      '$1\nimport android.webkit.CookieManager\nimport android.webkit.WebView\n'
    );
  }
  const inject = `
        // Allow third-party cookies (555api / Cloudflare challenge in Inbox iframe)
        try {
            CookieManager.getInstance().setAcceptCookie(true)
            val wv = this.bridge?.webView
            if (wv != null) {
                CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)
                wv.settings.javaScriptEnabled = true
                wv.settings.domStorageEnabled = true
                wv.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }
        } catch (_: Exception) { }
`;
  src = src.replace(/(super\.onCreate\([^\)]*\)\s*\n)/, '$1' + inject);
} else {
  if (!src.includes('android.webkit.CookieManager')) {
    src = src.replace(
      /(package [^\n]+\n)/,
      '$1\nimport android.webkit.CookieManager;\nimport android.webkit.WebSettings;\nimport android.webkit.WebView;\n'
    );
  }
  const inject = `
        // Allow third-party cookies (555api / Cloudflare challenge in Inbox iframe)
        try {
            CookieManager.getInstance().setAcceptCookie(true);
            WebView wv = this.bridge.getWebView();
            if (wv != null) {
                CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);
                WebSettings s = wv.getSettings();
                s.setJavaScriptEnabled(true);
                s.setDomStorageEnabled(true);
                s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
        } catch (Exception ignored) {}
`;
  src = src.replace(/(super\.onCreate\([^\)]*\);\s*\n)/, '$1' + inject);
}

fs.writeFileSync(main, src);
console.log('[patch-android-webview] patched:', main);
