<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Beta Player — Download</title>
  <style>
    *,
    *::before,
    *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --bg: #0a0a0a;
      --surface: #141414;
      --surface2: #1e1e1e;
      --border: #2a2a2a;
      --text: #e8e8e8;
      --text-dim: #888;
      --accent: #1da0c3;
      --accent-hover: #25b8de;
      --radius: 10px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      color: var(--accent-hover);
    }

    /* Hero */
    .hero {
      text-align: center;
      padding: 80px 24px 60px;
      max-width: 640px;
      margin: 0 auto;
    }

    .hero img {
      width: 96px;
      height: 96px;
      border-radius: 20px;
      margin-bottom: 24px;
    }

    .hero h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .hero .version {
      color: var(--text-dim);
      font-size: 0.95rem;
      margin-bottom: 8px;
    }

    .hero .tagline {
      color: var(--text-dim);
      font-size: 1.05rem;
      margin-bottom: 32px;
    }

    .hero-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: var(--accent);
      color: #fff;
      font-size: 1.1rem;
      font-weight: 600;
      padding: 14px 36px;
      border-radius: var(--radius);
      border: none;
      cursor: pointer;
      transition: background 0.15s;
      text-decoration: none;
    }

    .hero-btn:hover {
      background: var(--accent-hover);
      color: #fff;
    }

    .hero-btn svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }

    .hero-hint {
      color: var(--text-dim);
      font-size: 0.82rem;
      margin-top: 12px;
    }

    /* Downloads grid */
    .downloads {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 24px 80px;
      width: 100%;
    }

    .downloads h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 24px;
      text-align: center;
      color: var(--text-dim);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 16px;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
    }

    .card h3 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card h3 svg {
      width: 18px;
      height: 18px;
      fill: var(--text);
    }


    .card ul {
      list-style: none;
    }

    .card li {
      margin-bottom: 6px;
    }

    .card a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.88rem;
      background: var(--surface2);
      color: var(--text);
      transition: background 0.15s;
      width: 100%;
    }

    .card a:hover {
      background: var(--border);
      color: var(--text);
    }

    .card a .size {
      margin-left: auto;
      color: var(--text-dim);
      font-size: 0.78rem;
    }

    .card a svg {
      width: 14px;
      height: 14px;
      fill: var(--text-dim);
      flex-shrink: 0;
    }

    .recommended {
      border-color: var(--accent);
    }

    .recommended h3 {
      color: var(--accent);
    }

    .card h4 {
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 10px 0 6px;
    }

    .card h4:first-of-type {
      margin-top: 0;
    }

    /* Loading / error */
    .status {
      text-align: center;
      padding: 40px 24px;
      color: var(--text-dim)
    }

    /* Footer */
    footer {
      text-align: center;
      padding: 24px;
      margin-top: auto;
      color: var(--text-dim);
      font-size: 0.82rem;
      border-top: 1px solid var(--border);
    }

    footer a {
      color: var(--text-dim);
    }

    footer a:hover {
      color: var(--text);
    }

    @media (max-width: 600px) {
      .hero {
        padding: 48px 20px 40px;
      }

      .hero h1 {
        font-size: 1.5rem;
      }

      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>

<body>

  <section class="hero">
    <img src="icon.png" alt="Beta Player">
    <h1>Beta Player</h1>
    <p class="version" id="version">Loading&hellip;</p>
    <p class="tagline">Unofficial Bandcamp desktop &amp; mobile player</p>
    <div id="hero-cta"></div>
  </section>

  <section class="downloads">
    <h2>All Downloads</h2>
    <div class="grid" id="grid">
      <p class="status" id="status">Fetching latest release&hellip;</p>
    </div>
  </section>

  <footer>
    MIT License &middot;
    <a href="https://github.com/eremef/Bandcamp-player">Source on GitHub</a>
  </footer>

  <script>
    const REPO = 'eremef/Bandcamp-player';
    const API = `https://api.github.com/repos/${REPO}/releases/latest`;

    const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24"><path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-7 4h14v-2H5v2z"/></svg>';

    // --- Platform detection ---

    async function detectPlatform() {
      const ua = navigator.userAgent.toLowerCase();
      const platform = navigator.platform?.toLowerCase() || '';

      // Mobile platforms — arch doesn't matter for downloads
      if (/android/.test(ua)) return { os: 'android', arch: '', distro: null };
      if (/iphone|ipad|ipod/.test(ua)) return { os: 'ios', arch: '', distro: null };

      // Try the high-entropy API first (Chromium 93+): most reliable for CPU arch
      const heArch = await getHighEntropyArch();

      if (/win/.test(platform)) return { os: 'windows', arch: heArch || fallbackArch(ua), distro: null };
      if (/mac/.test(platform)) return { os: 'mac', arch: heArch || 'x64', distro: null };
      if (/linux/.test(platform)) return { os: 'linux', arch: heArch || fallbackArch(ua), distro: detectLinuxDistro(ua) };

      return { os: 'unknown', arch: '', distro: null };
    }

    /** Chromium high-entropy API — returns 'x64' | 'arm64' | null */
    async function getHighEntropyArch() {
      try {
        if (navigator.userAgentData?.getHighEntropyValues) {
          const hints = await navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness']);
          const arch = hints.architecture;   // "x86" | "arm"
          const bits = hints.bitness;         // "64" | "32"
          if (arch === 'arm') return 'arm64';
          if (arch === 'x86' && bits === '64') return 'x64';
          if (arch === 'x86') return 'x64';  // 32-bit x86 — still suggest x64 build
          if (arch) return arch;
        }
      } catch (_) { /* not supported or denied — fall through */ }
      return null;
    }

    /** UA-string fallback for arch detection */
    function fallbackArch(ua) {
      if (/arm|aarch64/.test(ua)) return 'arm64';
      return 'x64';
    }

    /**
     * Detect Linux distro family from UA string to suggest the right package format.
     * Returns { name, ext } or null.
     *
     * Chromium-based browsers on Linux often include distro hints in the UA,
     * e.g. "Ubuntu", "Fedora", "SUSE". Firefox is less reliable but still
     * sometimes includes them. When no hint is found, we default to AppImage.
     */
    function detectLinuxDistro(ua) {
      // .deb-based distros
      if (/ubuntu|debian|pop!_os|pop_os|linuxmint|elementary|zorin|kde neon|mx linux/.test(ua))
        return { name: getDEBDistroName(ua), ext: 'deb' };

      // .rpm-based distros
      if (/fedora|red hat|rhel|centos|rocky|alma|suse|opensuse|mandriva|mageia|nobara/.test(ua))
        return { name: getRPMDistroName(ua), ext: 'rpm' };

      return null;
    }

    function getDEBDistroName(ua) {
      if (/ubuntu/.test(ua)) return 'Ubuntu';
      if (/linuxmint/.test(ua)) return 'Linux Mint';
      if (/pop.os/.test(ua)) return 'Pop!_OS';
      if (/elementary/.test(ua)) return 'elementary OS';
      if (/zorin/.test(ua)) return 'Zorin OS';
      if (/debian/.test(ua)) return 'Debian';
      return 'Linux';
    }

    function getRPMDistroName(ua) {
      if (/fedora/.test(ua)) return 'Fedora';
      if (/suse|opensuse/.test(ua)) return 'openSUSE';
      if (/centos/.test(ua)) return 'CentOS';
      if (/nobara/.test(ua)) return 'Nobara';
      if (/red hat|rhel/.test(ua)) return 'RHEL';
      return 'Linux';
    }

    // --- Asset classification ---

    // Skip metadata files that aren't user-facing downloads
    const SKIP_EXTS = new Set(['blockmap', 'yml', 'yaml', 'zsync', 'zip']);

    function classifyAsset(name) {
      const n = name.toLowerCase();
      let os = null, arch = null, ext = null;

      const dotIdx = n.lastIndexOf('.');
      if (dotIdx > 0) ext = n.slice(dotIdx + 1);

      // Filter out non-download metadata files
      if (SKIP_EXTS.has(ext)) return { os: null };

      if (n.includes('-windows-')) os = 'windows';
      else if (n.includes('-mac-')) os = 'mac';
      else if (n.includes('-linux-')) os = 'linux';
      else if (ext === 'apk') os = 'android';

      // Normalize architecture variants
      if (n.includes('-x64.') || n.includes('-x86_64.') || n.includes('-amd64.')) arch = 'x64';
      else if (n.includes('-arm64.') || n.includes('-aarch64.')) arch = 'arm64';

      return { os, arch, ext };
    }

    /** Deduplicate assets: when both alpha and release builds exist, keep the release (non-alpha) one. */
    function deduplicateAssets(assets) {
      const key = a => `${a.os}-${a.arch || ''}-${a.ext}`;
      const map = new Map();
      for (const a of assets) {
        const k = key(a);
        const existing = map.get(k);
        if (!existing) { map.set(k, a); continue; }
        // Prefer the one WITHOUT "alpha" in the filename
        const aIsAlpha = /alpha/i.test(a.name);
        const eIsAlpha = /alpha/i.test(existing.name);
        if (eIsAlpha && !aIsAlpha) map.set(k, a);
      }
      return [...map.values()];
    }

    function formatSize(bytes) {
      if (!bytes) return '';
      if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
      if (bytes > 1e6) return (bytes / 1e6).toFixed(0) + ' MB';
      if (bytes > 1e3) return (bytes / 1e3).toFixed(0) + ' KB';
      return bytes + ' B';
    }

    const OS_LABELS = {
      windows: 'Windows',
      mac: 'macOS',
      linux: 'Linux',
      android: 'Android'
    };

    const OS_ICONS = {
      windows: '<svg viewBox="0 0 24 24"><path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM12 5.3l9-1.3v8h-9V5.3zm0 7.2h9v8l-9-1.3v-6.7z"/></svg>',
      mac: '<svg viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>',
      linux: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
      android: '<svg viewBox="0 0 24 24"><path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V7H6v11zM3.5 7C2.67 7 2 7.67 2 8.5v7c0 .83.67 1.5 1.5 1.5S5 16.33 5 15.5v-7C5 7.67 4.33 7 3.5 7zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"/></svg>'
    };

    // Preferred file extension for hero button per OS (lowercase — ext is already lowercased)
    const PREFERRED_EXT = { windows: 'exe', mac: 'dmg', linux: 'appimage', android: 'apk' };

    // --- Render ---

    async function init() {
      const { os, arch, distro } = await detectPlatform();

      // Override Linux preferred extension based on detected distro
      if (distro?.ext) PREFERRED_EXT.linux = distro.ext;

      let data;

      try {
        // Use sessionStorage cache + ETag to avoid GitHub API rate limits (60 req/hr unauthenticated)
        const cacheKey = 'bp_release';
        const cached = sessionStorage.getItem(cacheKey);
        const parsed = cached ? JSON.parse(cached) : null;

        const headers = {};
        if (parsed?.etag) headers['If-None-Match'] = parsed.etag;

        const res = await fetch(API, { headers });

        if (res.status === 304 && parsed?.data) {
          data = parsed.data;
        } else if (res.ok) {
          data = await res.json();
          const etag = res.headers.get('ETag');
          sessionStorage.setItem(cacheKey, JSON.stringify({ data, etag }));
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        document.getElementById('status').textContent = 'Could not fetch release info. Visit GitHub for downloads.';
        document.getElementById('version').innerHTML = '';
        document.getElementById('hero-cta').innerHTML =
          `<a class="hero-btn" href="https://github.com/${REPO}/releases/latest">${DOWNLOAD_ICON} Go to GitHub Releases</a>`;
        return;
      }

      const version = data.tag_name.replace(/^v/, '');
      document.getElementById('version').textContent = 'v' + version;

      // Classify, filter, and deduplicate assets
      const assets = deduplicateAssets(
        data.assets
          .map(a => ({ ...classifyAsset(a.name), name: a.name, url: a.browser_download_url, size: a.size }))
          .filter(a => a.os)
      );

      // Group by OS
      const groups = {};
      for (const a of assets) {
        (groups[a.os] = groups[a.os] || []).push(a);
      }

      // Hero CTA
      const heroEl = document.getElementById('hero-cta');
      if (os !== 'unknown' && os !== 'ios') {
        const prefExt = PREFERRED_EXT[os];
        const match = assets.find(a =>
          a.os === os &&
          (!arch || !a.arch || a.arch === arch) &&
          (!prefExt || a.ext === prefExt)
        ) || assets.find(a => a.os === os);

        if (match) {
          const osName = (os === 'linux' && distro?.name) ? distro.name : OS_LABELS[os];
          const label = `Download for ${osName}` + (match.arch ? ` (${match.arch})` : '');
          const formatHint = (os === 'linux' && distro?.ext) ? ` &middot; .${distro.ext}` : '';
          heroEl.innerHTML =
            `<a class="hero-btn" href="${match.url}">${DOWNLOAD_ICON} ${label}</a>` +
            `<p class="hero-hint">${match.name} &middot; ${formatSize(match.size)}${formatHint}</p>`;
        }
      }

      if (!heroEl.innerHTML) {
        heroEl.innerHTML =
          `<a class="hero-btn" href="https://github.com/${REPO}/releases/tag/${data.tag_name}">${DOWNLOAD_ICON} View Downloads</a>`;
      }

      // Grid cards
      const gridEl = document.getElementById('grid');
      gridEl.innerHTML = '';

      for (const osKey of ['windows', 'mac', 'linux', 'android']) {
        const items = groups[osKey];
        if (!items || items.length === 0) continue;

        const isRecommended = osKey === os;
        const card = document.createElement('div');
        card.className = 'card' + (isRecommended ? ' recommended' : '');

        const icon = OS_ICONS[osKey] || '';
        let html = `<h3>${icon} ${OS_LABELS[osKey]}</h3>`;

        // Group by architecture, then sort formats within each group
        const byArch = new Map();
        for (const a of items) {
          const key = a.arch || '_none';
          (byArch.get(key) || byArch.set(key, []).get(key)).push(a);
        }

        // Sort arch groups: detected arch first, then alphabetically
        const archOrder = [...byArch.keys()].sort((a, b) => {
          if (a === arch) return -1;
          if (b === arch) return 1;
          return a.localeCompare(b);
        });

        const pref = PREFERRED_EXT[osKey];
        for (const archKey of archOrder) {
          const archItems = byArch.get(archKey);
          archItems.sort((a, b) => {
            const aP = a.ext === pref ? 0 : 1;
            const bP = b.ext === pref ? 0 : 1;
            return aP - bP;
          });

          if (archKey !== '_none') {
            html += `<h4>${archKey}</h4>`;
          }
          html += '<ul>';
          for (const a of archItems) {
            html += `<li><a href="${a.url}">${DOWNLOAD_ICON} .${a.ext}<span class="size">${formatSize(a.size)}</span></a></li>`;
          }
          html += '</ul>';
        }

        html += '</ul>';
        card.innerHTML = html;
        gridEl.appendChild(card);
      }
    }

    init();
  </script>
</body>

</html>