import type { Attachment } from "@saturn/api/saturn/mail/v1/mail"
import {
  restoreRemoteImageSrc,
  sanitizeEmailHtml,
  stripTrailingEmptyParagraphsAndBrs,
} from "@saturn/core"

export interface BuildMobileMessageHtmlOptions {
  html: string
  plainText?: string
  attachments?: Attachment[]
  loadImages: boolean
  apiBaseUrl?: string
}

export function buildMobileMessageDocumentHtml({
  html,
  plainText,
  attachments = [],
  loadImages,
  apiBaseUrl = "",
}: BuildMobileMessageHtmlOptions): string {
  let source = html?.trim() ?? ""

  if (!source && plainText) {
    const escaped = plainText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, "<br>")
    source = `<div style="white-space: pre-wrap; font-family: -apple-system, system-ui, sans-serif; font-size: 14px; line-height: 1.5; color: #18181b;">${escaped}</div>`
  }

  if (!source) {
    source =
      "<div style='color: #71717a; font-family: -apple-system, system-ui, sans-serif; font-size: 13px;'>(Empty message)</div>"
  } else {
    source = sanitizeEmailHtml(source, {
      allowRemoteImages: loadImages,
    }).html
    source = stripTrailingEmptyParagraphsAndBrs(source)

    if (attachments.length > 0) {
      const cleanBase = apiBaseUrl.replace(/\/$/, "")
      for (const att of attachments) {
        if (!att.downloadUrl) continue
        const resolvedUrl = att.downloadUrl.startsWith("http")
          ? att.downloadUrl
          : `${cleanBase}${att.downloadUrl}`
        if (att.contentId) {
          const cleanCid = att.contentId.replace(/^<|>$/g, "").trim()
          source = source.replaceAll(`cid:${cleanCid}`, resolvedUrl)
          source = source.replaceAll(`CID:${cleanCid}`, resolvedUrl)
          source = source.replaceAll(`cid:<${cleanCid}>`, resolvedUrl)
          source = source.replaceAll(`CID:<${cleanCid}>`, resolvedUrl)
        }
        if (att.filename && att.isInline) {
          source = source.replaceAll(`cid:${att.filename}`, resolvedUrl)
          source = source.replaceAll(`CID:${att.filename}`, resolvedUrl)
        }
      }
    }

    if (loadImages) {
      source = restoreRemoteImageSrc(source)
    }
  }

  let apiOrigin = ""
  if (apiBaseUrl) {
    try {
      apiOrigin = ` ${new URL(apiBaseUrl).origin}`
    } catch {
      apiOrigin = ""
    }
  }
  const imgSrcPolicy = loadImages
    ? `https: http: data: blob:${apiOrigin}`
    : `data: blob:${apiOrigin}`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=2.0">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="img-src ${imgSrcPolicy}; media-src ${imgSrcPolicy}; object-src 'none'; frame-src 'none';">
  <style>
    :root {
      color-scheme: light;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      height: auto !important;
      min-height: 0 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      background-color: #ffffff;
      color: #18181b;
      overflow-wrap: break-word;
      overflow-x: hidden;
      overflow-y: hidden !important;
      -webkit-text-size-adjust: 100%;
    }
    #saturn-email-viewport {
      width: 100%;
      overflow: hidden;
      margin: 0;
      padding: 0;
    }
    #saturn-email-root {
      display: flow-root;
      box-sizing: border-box;
      width: 100%;
      padding: 10px 12px;
      height: auto !important;
      min-height: 0 !important;
    }
    /* Neutralize full-viewport height rules in email templates that create large blank bottom padding */
    #saturn-email-root [style*="100vh"],
    #saturn-email-root table[height="100%"],
    #saturn-email-root td[height="100%"],
    #saturn-email-root > div[style*="height: 100%"],
    #saturn-email-root > div[style*="height:100%"] {
      height: auto !important;
      min-height: 0 !important;
    }
    /* Preserve explicit icon heights & small icon intrinsic widths (e.g. GitHub octicons/checks) while allowing large banners to shrink */
    img {
      max-width: 100%;
    }
    img:not([height]):not([style*="height"]) {
      height: auto;
    }
    img[width="12"],
    img[width="14"],
    img[width="16"],
    img[width="18"],
    img[width="20"],
    img[width="24"],
    img[width="28"],
    img[width="32"] {
      max-width: none;
    }
    img[align="absmiddle"],
    img[align="middle"] {
      vertical-align: middle;
    }
    img[align="absbottom"] {
      vertical-align: bottom;
    }
    img[align="texttop"] {
      vertical-align: text-top;
    }
    table {
      line-height: normal;
    }
    /* Hide blocked 1x1 tracking pixels & decorative unloaded images so they never add trailing bottom space */
    img[data-saturn-remote-src]:not([src])[alt=""],
    img[data-saturn-remote-src]:not([src])[width="1"],
    img[data-saturn-remote-src]:not([src])[height="1"] {
      display: none !important;
    }
    a {
      color: #2563eb;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div id="saturn-email-viewport">
    <div id="saturn-email-root">${source}</div>
  </div>
  <style>html, body { height: auto !important; min-height: 0 !important; }</style>
</body>
</html>`
}

export const INJECTED_EMAIL_LAYOUT_JS = `
(function() {
  if (window.__saturnEmailLayoutInit) {
    if (window.__saturnEmailLayoutBind) window.__saturnEmailLayoutBind();
    if (window.__saturnEmailLayoutMeasure) window.__saturnEmailLayoutMeasure();
    return;
  }
  window.__saturnEmailLayoutInit = true;

  var lastPostedHeight = 0;
  var boundImages = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  var rafPending = false;

  function trimTrailingEmptyNodes(root) {
    if (!root) return;
    while (root.lastChild) {
      var node = root.lastChild;
      if (node.nodeType === 3) {
        if ((node.nodeValue || '').replace(/[\\s\\u00a0]+/g, '') === '') {
          root.removeChild(node);
          continue;
        }
        break;
      }
      if (node.nodeType === 1) {
        var tag = node.tagName ? node.tagName.toUpperCase() : '';
        if (tag === 'STYLE' || tag === 'LINK' || tag === 'META') {
          break;
        }
        if (tag === 'BR') {
          root.removeChild(node);
          continue;
        }
        var hasMedia = node.querySelector && node.querySelector('img[src], svg, video, table, hr, input, button');
        var text = (node.textContent || '').replace(/[\\s\\u00a0]+/g, '');
        if (!hasMedia && text === '' && (tag === 'P' || tag === 'DIV' || tag === 'SPAN')) {
          root.removeChild(node);
          continue;
        }
      }
      break;
    }
  }

  function fitAndMeasure() {
    rafPending = false;
    var viewport = document.getElementById('saturn-email-viewport');
    var root = document.getElementById('saturn-email-root');
    if (!viewport || !root) return;

    root.style.transform = 'none';
    root.style.width = '100%';
    viewport.style.height = 'auto';

    var availWidth = document.documentElement.clientWidth || window.innerWidth || 0;
    var naturalWidth = root.scrollWidth || 0;
    var currentScale = 1;

    if (availWidth > 0 && naturalWidth > availWidth + 2) {
      currentScale = Math.max(0.25, availWidth / naturalWidth);
      root.style.width = naturalWidth + 'px';
      root.style.transformOrigin = 'top left';
      root.style.transform = 'scale(' + currentScale + ')';
    }

    var rect = root.getBoundingClientRect();
    var visualHeight = Math.ceil(Math.max(rect.height, (root.scrollHeight || 0) * currentScale));
    if (visualHeight > 0) {
      viewport.style.height = visualHeight + 'px';
      if (
        window.ReactNativeWebView &&
        Math.abs(visualHeight - lastPostedHeight) >= 1
      ) {
        lastPostedHeight = visualHeight;
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'RESIZE', height: visualHeight })
        );
      }
    }
  }

  function scheduleMeasure() {
    if (rafPending) return;
    rafPending = true;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(fitAndMeasure);
    } else {
      setTimeout(fitAndMeasure, 16);
    }
  }

  function onImageSettled() {
    scheduleMeasure();
    setTimeout(scheduleMeasure, 80);
  }

  function bindImages() {
    var images = document.images || [];
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      if (!img) continue;
      var widthAttr = parseInt(img.getAttribute ? (img.getAttribute('width') || '') : '', 10);
      if (widthAttr > 0 && widthAttr <= 48 && img.style) {
        img.style.maxWidth = 'none';
      }
      if (boundImages && boundImages.has(img)) continue;
      if (boundImages) boundImages.add(img);
      img.addEventListener('load', onImageSettled);
      img.addEventListener('error', onImageSettled);
    }
  }

  window.__saturnEmailLayoutBind = bindImages;
  window.__saturnEmailLayoutMeasure = scheduleMeasure;

  var root = document.getElementById('saturn-email-root');
  trimTrailingEmptyNodes(root);
  bindImages();
  fitAndMeasure();

  if (typeof ResizeObserver !== 'undefined' && root) {
    try {
      new ResizeObserver(scheduleMeasure).observe(root);
    } catch (e) {}
  }
  if (typeof MutationObserver !== 'undefined' && root) {
    try {
      new MutationObserver(function() {
        bindImages();
        scheduleMeasure();
      }).observe(root, { childList: true, subtree: true, attributes: true });
    } catch (e) {}
  }

  window.addEventListener('load', scheduleMeasure);
  window.addEventListener('resize', scheduleMeasure);
  setTimeout(scheduleMeasure, 120);
  setTimeout(scheduleMeasure, 500);
})();
true;
`

export const INJECTED_EMAIL_LAYOUT_BEFORE_LOAD_JS = `
(function() {
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function() {
      ${INJECTED_EMAIL_LAYOUT_JS}
    }, { once: true });
  }
})();
true;
`
