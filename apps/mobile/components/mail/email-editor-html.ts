import { stripHtmlToPlainText } from "@saturn/core"

export type EmailEditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "heading2"
  | "bulletList"
  | "orderedList"
  | "blockquote"

export interface EmailEditorActiveFormats {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  heading2: boolean
  bulletList: boolean
  orderedList: boolean
  blockquote: boolean
}

export const EMPTY_ACTIVE_FORMATS: EmailEditorActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  heading2: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
}

function isHtmlEffectivelyEmpty(html: string): boolean {
  const trimmed = html.trim()
  if (!trimmed) return true
  if (/<(?:img|table|hr)\b/i.test(trimmed)) return false
  return stripHtmlToPlainText(trimmed).length === 0
}

export function buildMobileEditorDocumentHtml(params: {
  bodyHtml: string
  stylesHtml: string
  placeholder: string
  minHeight: number
  autoFocus?: boolean
}): string {
  const {
    bodyHtml,
    stylesHtml,
    placeholder,
    minHeight,
    autoFocus = false,
  } = params
  const isEmpty = isHtmlEffectivelyEmpty(bodyHtml)
  const escapedPlaceholder = placeholder
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    :root {
      color-scheme: light;
    }
    html {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    body {
      margin: 0;
      padding: 14px 16px;
      box-sizing: border-box;
      min-height: ${minHeight}px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 15px;
      line-height: 1.55;
      background-color: #ffffff;
      color: #18181b;
      outline: none;
      word-break: break-word;
      overflow-x: hidden;
      -webkit-user-select: text;
      user-select: text;
    }
    body[data-empty="true"]::before {
      content: attr(data-placeholder);
      color: #a1a1aa;
      pointer-events: none;
      display: block;
      height: 0;
    }
    p {
      margin: 0 0 0.5rem 0;
    }
    p:last-child {
      margin-bottom: 0;
    }
    h2 {
      font-size: 1.125rem;
      font-weight: 600;
      line-height: 1.35;
      margin: 0.75rem 0 0.375rem 0;
    }
    ul {
      list-style-type: disc;
      padding-left: 1.375rem;
      margin: 0.375rem 0 0.5rem 0;
    }
    ol {
      list-style-type: decimal;
      padding-left: 1.375rem;
      margin: 0.375rem 0 0.5rem 0;
    }
    blockquote {
      border-left: 2px solid #d4d4d8;
      padding-left: 0.75rem;
      margin: 0.5rem 0;
      color: #52525b;
    }
    img {
      max-width: 100% !important;
      height: auto !important;
    }
    table {
      max-width: 100% !important;
    }
    a {
      color: #2563eb;
      text-decoration: underline;
    }
  </style>
  ${stylesHtml}
  <style>
    html, body {
      height: auto !important;
    }
    body {
      padding: 14px 16px !important;
      box-sizing: border-box !important;
    }
  </style>
</head>
<body contenteditable="true" spellcheck="true" data-empty="${isEmpty ? "true" : "false"}" data-placeholder="${escapedPlaceholder}">${bodyHtml}</body>
<script>
(function() {
  var body = document.body;
  if (!body) return;

  function postMessage(payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  function checkEmpty() {
    var text = (body.textContent || "").trim();
    if (text.length > 0) return false;
    return !body.querySelector("img, table, hr");
  }

  function readActiveFormats() {
    try {
      var block = (document.queryCommandValue("formatBlock") || "").toLowerCase();
      return {
        bold: Boolean(document.queryCommandState("bold")),
        italic: Boolean(document.queryCommandState("italic")),
        underline: Boolean(document.queryCommandState("underline")),
        strike: Boolean(document.queryCommandState("strikeThrough")),
        bulletList: Boolean(document.queryCommandState("insertUnorderedList")),
        orderedList: Boolean(document.queryCommandState("insertOrderedList")),
        heading2: block === "h2" || block === "<h2>",
        blockquote: block === "blockquote" || block === "<blockquote>"
      };
    } catch (e) {
      return {
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        heading2: false,
        bulletList: false,
        orderedList: false,
        blockquote: false
      };
    }
  }

  function postResize() {
    var htmlEl = document.documentElement;
    var height = Math.max(
      body.scrollHeight || 0,
      body.offsetHeight || 0,
      htmlEl ? htmlEl.scrollHeight : 0,
      htmlEl ? htmlEl.offsetHeight : 0
    );
    if (height > 0) {
      postMessage({ type: "RESIZE", height: height });
    }
  }

  function postChange() {
    body.dataset.empty = checkEmpty() ? "true" : "false";
    postMessage({
      type: "CHANGE",
      html: body.innerHTML,
      text: body.innerText || body.textContent || ""
    });
    postResize();
  }

  function postFormats() {
    postMessage({ type: "FORMATS", formats: readActiveFormats() });
  }

  function focusAtStart() {
    body.focus();
    try {
      var sel = window.getSelection();
      if (!sel) return;
      var range = document.createRange();
      var target = body.firstElementChild || body;
      range.setStart(target, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  window.__saturnEditor = {
    execFormat: function(command) {
      body.focus();
      var current = readActiveFormats();
      switch (command) {
        case "bold":
          document.execCommand("bold");
          break;
        case "italic":
          document.execCommand("italic");
          break;
        case "underline":
          document.execCommand("underline");
          break;
        case "strike":
          document.execCommand("strikeThrough");
          break;
        case "bulletList":
          document.execCommand("insertUnorderedList");
          break;
        case "orderedList":
          document.execCommand("insertOrderedList");
          break;
        case "heading2":
          document.execCommand("formatBlock", false, current.heading2 ? "p" : "h2");
          break;
        case "blockquote":
          document.execCommand("formatBlock", false, current.blockquote ? "p" : "blockquote");
          break;
      }
      postChange();
      postFormats();
    },
    revealRemoteImages: function() {
      var imgs = body.querySelectorAll("img[data-saturn-remote-src]");
      for (var i = 0; i < imgs.length; i++) {
        var remoteSrc = imgs[i].getAttribute("data-saturn-remote-src");
        if (remoteSrc) {
          imgs[i].setAttribute("src", remoteSrc);
          imgs[i].removeAttribute("data-saturn-remote-src");
          imgs[i].addEventListener("load", postResize);
        }
      }
      postChange();
    },
    focus: focusAtStart
  };

  body.addEventListener("input", function() {
    postChange();
    postFormats();
  });
  body.addEventListener("keyup", postFormats);
  body.addEventListener("touchend", postFormats);
  body.addEventListener("focus", postFormats);
  document.addEventListener("selectionchange", postFormats);

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(postResize);
    ro.observe(body);
  }

  var images = document.images || [];
  for (var i = 0; i < images.length; i++) {
    images[i].addEventListener("load", postResize);
  }

  window.addEventListener("load", postResize);
  setTimeout(postResize, 80);
  setTimeout(postResize, 300);
  setTimeout(postResize, 1000);

  if (${autoFocus ? "true" : "false"}) {
    setTimeout(focusAtStart, 120);
  }
})();
</script>
</html>`
}
