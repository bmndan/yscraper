// ==UserScript==
// @name         Y2 Main
// @namespace    berman
// @version      4.8.2
// @match        *://*/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(async function () {
  try {
    var TOKEN_URL = "https://raw.githubusercontent.com/bmndan/yscraper/main/token.txt";
    var CONFIG_URL = "https://raw.githubusercontent.com/bmndan/yscraper/main/config.json";
    var API_BASE = "https://api.mementodatabase.com/v1";
    var DEBUG = false;

    var SAVE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    var MENU_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    var WAIT_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/></svg>';

    function clean(s) {
      return String(s || "")
        .replace(/^\uFEFF/, "")
        .replace(/\r/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getText(sel) {
      var el = document.querySelector(sel);
      return el ? clean(el.innerText || el.textContent || "") : "";
    }

    function getFirstText(selectors) {
      for (var i = 0; i < selectors.length; i++) {
        var v = getText(selectors[i]);
        if (v) return v;
      }
      return "";
    }

    function sleep(ms) {
      return new Promise(function (r) { setTimeout(r, ms); });
    }

    function digits(s) {
      return String(s || "").replace(/[^\d]/g, "");
    }

    function asNum(x) {
      if (x === 0) return 0;
      var d = digits(x);
      if (!d) return null;
      var n = Number(d);
      return isFinite(n) ? n : null;
    }

    function asFloat(x) {
      if (x === 0) return 0;
      var s = String(x || "").replace(",", ".").match(/\d+(?:\.\d+)?/);
      if (!s) return null;
      var n = Number(s[0]);
      return isFinite(n) ? n : null;
    }

    function keepIf(n, pred) {
      return (typeof n === "number" && isFinite(n) && pred(n)) ? n : null;
    }

    function normalizeNumerics(o) {
      return {
        Rooms: keepIf(o.Rooms, function (n) { return n >= 1 && n <= 50; }),
        Area: keepIf(o.Area, function (n) { return n >= 5 && n <= 5000; }),
        BuiltArea: keepIf(o.BuiltArea, function (n) { return n >= 5 && n <= 20000; }),
        Floors: keepIf(o.Floors, function (n) { return n >= 1 && n <= 200; }),
        Floor: keepIf(o.Floor, function (n) { return n >= 0 && n <= 200; })
      };
    }

    function getCleanItemUrl() {
      return location.origin + location.pathname;
    }

    function getListingIdFromUrl() {
      var parts = location.pathname.split("/").filter(Boolean);
      return parts.length ? parts[parts.length - 1] : null;
    }

    function getNowIsoWithOffset() {
      var d = new Date();
      function pad(n) { return String(Math.abs(n)).padStart(2, "0"); }
      var offsetMin = -d.getTimezoneOffset();
      var sign = offsetMin >= 0 ? "+" : "-";
      var hh = pad(Math.floor(Math.abs(offsetMin) / 60));
      var mm = pad(Math.abs(offsetMin) % 60);

      return (
        d.getFullYear() + "-" +
        pad(d.getMonth() + 1) + "-" +
        pad(d.getDate()) + "T" +
        pad(d.getHours()) + ":" +
        pad(d.getMinutes()) + ":" +
        pad(d.getSeconds()) +
        sign + hh + ":" + mm
      );
    }

    function todayStamp() {
      var d = new Date();
      function pad(n) { return String(n).padStart(2, "0"); }
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    function formatPriceHistoryValue(n) {
      var num = Number(String(n || "").replace(/[^\d.-]/g, ""));
      if (!isFinite(num)) return String(n || "");
      return String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }

    function splitLines(s) {
      return String(s || "")
        .split(/\r?\n/)
        .map(function (x) { return clean(x); })
        .filter(Boolean);
    }

    function uniqueStrings(arr) {
      return Array.from(new Set((arr || []).filter(Boolean).map(clean).filter(Boolean)));
    }

    function appendHistoryLine(existing, line, separator) {
      var cur = clean(existing || "");
      var add = clean(line || "");
      if (!add) return cur || null;

      var parts = separator === "\n"
        ? splitLines(cur)
        : String(cur || "").split(separator).map(clean).filter(Boolean);

      if (parts.indexOf(add) !== -1) return cur || null;
      return cur ? cur + separator + add : add;
    }

    function extractFieldValue(entry, fieldId) {
      if (!entry || !entry.fields) return null;
      var f = entry.fields.find(function (x) { return x.id === fieldId; });
      return f ? f.value : null;
    }

    function normalizeImageFieldValue(v) {
      if (!v) return [];
      if (Array.isArray(v)) {
        return v.map(function (x) {
          if (typeof x === "string") return clean(x);
          if (x && typeof x === "object") return clean(x.url || x.value || x.path || "");
          return "";
        }).filter(Boolean);
      }
      if (typeof v === "string") return splitLines(v);
      return [];
    }

    function gmGet(url) {
      return new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
          method: "GET",
          url: url + (url.indexOf("?") === -1 ? "?t=" : "&t=") + Date.now(),
          headers: { "Cache-Control": "no-cache" },
          onload: function (r) {
            if (r.status === 200) resolve(r.responseText);
            else reject(new Error("Load failed: " + r.status + " " + url));
          },
          onerror: function () {
            reject(new Error("Request failed: " + url));
          }
        });
      });
    }

    async function getToken() {
      return clean(await gmGet(TOKEN_URL));
    }

    async function getConfig() {
      var txt = await gmGet(CONFIG_URL);
      return JSON.parse(txt);
    }

    async function jfetch(url, opts) {
      var headers = Object.assign({ "Content-Type": "application/json" }, (opts && opts.headers) || {});
      var res = await fetch(url, Object.assign({}, opts, { headers: headers }));
      var t = await res.text();
      var data = {};
      try {
        data = t ? JSON.parse(t) : {};
      } catch (e) {
        throw new Error("Non-JSON response: " + t.slice(0, 220));
      }
      if (!res.ok) throw new Error(res.status + ": " + t.slice(0, 320));
      return data;
    }

    var CFG = await getConfig();
    var LIBRARY_ID = CFG.libraryId;
    var DOMAIN_KEY = CFG.domainKey;
    var FID = CFG.fields;

    function getStoredDomain() {
      return GM_getValue(DOMAIN_KEY, "");
    }

    function setStoredDomain(v) {
      GM_setValue(DOMAIN_KEY, clean(v));
    }

    function clearStoredDomain() {
      GM_deleteValue(DOMAIN_KEY);
    }

    function onStoredDomain() {
      var d = getStoredDomain();
      return !!d && location.hostname === d;
    }

    function setButtonIcon(btn, html, title) {
      if (!btn) return;
      btn.innerHTML = html;
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      if (title) btn.title = title;
    }

    function styleMainCircleButton(btn) {
      if (!btn) return;
      btn.style.width = "40px";
      btn.style.height = "40px";
      btn.style.minWidth = "40px";
      btn.style.padding = "0";
      btn.style.boxSizing = "border-box";
      btn.style.borderRadius = "50%";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.lineHeight = "1";
      btn.style.textAlign = "center";
    }

    function makeUiButton(id, text, bottom, onClick) {
      if (document.getElementById(id)) return document.getElementById(id);

      var btn = document.createElement("button");
      btn.id = id;
      btn.textContent = text;
      btn.style.position = "fixed";
      btn.style.right = "16px";
      btn.style.bottom = bottom + "px";
      btn.style.zIndex = "999999";
      btn.style.padding = "10px 12px";
      btn.style.borderRadius = "10px";
      btn.style.border = "1px solid #222";
      btn.style.background = "#fff";
      btn.style.color = "#111";
      btn.style.font = "14px/1.2 sans-serif";
      btn.style.boxShadow = "0 6px 18px rgba(0,0,0,.18)";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", onClick);
      document.body.appendChild(btn);
      return btn;
    }

    function isDesktopLayout() {
      return window.innerWidth >= 900;
    }

    function positionMainButtons() {
      var menu = document.getElementById("y2MenuBtn");
      var save = document.getElementById("mementoSaveBtn");

      if (isDesktopLayout()) {
        if (save) {
          save.style.top = "20px";
          save.style.bottom = "auto";
          save.style.left = "20px";
          save.style.right = "auto";
          save.style.transform = "none";
        }

        if (menu) {
          menu.style.top = "68px";
          menu.style.bottom = "auto";
          menu.style.left = "20px";
          menu.style.right = "auto";
          menu.style.transform = "none";
        }
      } else {
        if (save) {
          save.style.top = "100px";
          save.style.bottom = "auto";
          save.style.left = "12px";
          save.style.right = "auto";
          save.style.transform = "none";
        }

        if (menu) {
          menu.style.top = "148px";
          menu.style.bottom = "auto";
          menu.style.left = "12px";
          menu.style.right = "auto";
          menu.style.transform = "none";
        }
      }
    }

    function positionMenuActionButtons() {
      var items = isDesktopLayout()
        ? [
            ["y2ShowDomainBtn", 116],
            ["y2SetDomainBtn", 164],
            ["y2ChangeDomainBtn", 212],
            ["y2ClearDomainBtn", 260]
          ]
        : [
            ["y2ShowDomainBtn", 196],
            ["y2SetDomainBtn", 244],
            ["y2ChangeDomainBtn", 292],
            ["y2ClearDomainBtn", 340]
          ];

      items.forEach(function (item) {
        var el = document.getElementById(item[0]);
        if (!el) return;

        el.style.top = item[1] + "px";
        el.style.bottom = "auto";
        el.style.left = isDesktopLayout() ? "20px" : "12px";
        el.style.right = "auto";
        el.style.transform = "none";
        el.style.zIndex = "1000000";
      });
    }

    function installDomainUi() {
      var expanded = false;
      var actionIds = [
        "y2ShowDomainBtn",
        "y2SetDomainBtn",
        "y2ChangeDomainBtn",
        "y2ClearDomainBtn"
      ];

      function removeActions() {
        actionIds.forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.remove();
        });
      }

      function showActions() {
        makeUiButton("y2ShowDomainBtn", "SHOW DOMAIN", 226, function () {
          alert(
            "Stored domain: " + getStoredDomain() +
            "\nCurrent host: " + location.hostname +
            "\nKeys: " + GM_listValues().join(", ")
          );
        });

        makeUiButton("y2SetDomainBtn", "SET THIS DOMAIN", 184, function () {
          setStoredDomain(location.hostname);
          alert("Stored domain set to: " + getStoredDomain());
          location.reload();
        });

        makeUiButton("y2ChangeDomainBtn", "CHANGE DOMAIN", 142, function () {
          var value = prompt("Enter domain/hostname", getStoredDomain() || location.hostname);
          if (!value) return;
          setStoredDomain(value);
          alert("Stored domain changed to: " + getStoredDomain());
          location.reload();
        });

        makeUiButton("y2ClearDomainBtn", "CLEAR DOMAIN", 100, function () {
          clearStoredDomain();
          alert("Stored domain cleared");
          location.reload();
        });

        positionMenuActionButtons();
      }

      var menuBtn = makeUiButton("y2MenuBtn", "", 58, function () {
        expanded = !expanded;
        if (expanded) showActions();
        else removeActions();
      });

      styleMainCircleButton(menuBtn);
      setButtonIcon(menuBtn, MENU_ICON, "הגדרות");
    }

    installDomainUi();
    positionMainButtons();

    if (!onStoredDomain()) return;
    if (!/\/realestate\/item\//.test(location.pathname)) return;

    GM_addStyle(
      "#mementoSaveBtn{position:fixed;right:16px;bottom:16px;z-index:999999;width:40px;height:40px;min-width:40px;padding:0;box-sizing:border-box;border-radius:50%;border:1px solid #222;background:#fff;color:#111;font:14px/1.2 sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;text-align:center}" +
      "#mementoSaveBtn:disabled{opacity:.6;cursor:default}"
    );

    var btn = document.getElementById("mementoSaveBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "mementoSaveBtn";
      document.body.appendChild(btn);
    }
    styleMainCircleButton(btn);
    setButtonIcon(btn, SAVE_ICON, "שמירה");
    positionMainButtons();

    window.addEventListener("resize", function () {
      positionMainButtons();
      positionMenuActionButtons();
    });

    function extractRoomsFloorAreaFromTiles() {
      var container =
        document.querySelector('[data-testid="building-details"]') ||
        document.querySelector('[class*="buildingDetailsBox"]');

      if (!container) return { Rooms: null, Floor: null, FloorsFromSlash: null, Area: null };

      var Rooms = null, Floor = null, FloorsFromSlash = null, Area = null;
      var items = Array.from(container.querySelectorAll(".property-detail_buildingItemBox__ESM9C, [class*='buildingItemBox']"));

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var left = clean((item.querySelector('[data-testid="building-text"]') || {}).textContent || "");
        var unit = clean((item.querySelector(".property-detail_itemValue__V0z6l, [class*='itemValue']") || {}).textContent || "");
        var combined = (left + " " + unit).trim();

        if (unit.indexOf("חדרים") !== -1) Rooms = asFloat(left);
        if (unit.indexOf('מ"ר') !== -1 || unit.indexOf('מ״ר') !== -1 || unit.indexOf('מ\"ר') !== -1) Area = asNum(left);
        if (combined.indexOf("קרקע") !== -1) Floor = 0;

        var m = combined.match(/(\d+)\s*\/\s*(\d+)/);
        if (m) {
          Floor = Number(m[1]);
          FloorsFromSlash = Number(m[2]);
        } else if (combined.indexOf("קומה") !== -1) {
          var n = combined.match(/(\d+)/);
          if (n) Floor = Number(n[1]);
        }
      }
      return { Rooms: Rooms, Floor: Floor, FloorsFromSlash: FloorsFromSlash, Area: Area };
    }

    function extractAdditionalDetailsMap() {
      var labels = Array.from(document.querySelectorAll('[class*="item-detail_label"]'));
      var values = Array.from(document.querySelectorAll('[class*="item-detail_value"]'));
      var map = {};
      for (var i = 0; i < Math.min(labels.length, values.length); i++) {
        var k = clean(labels[i].innerText || labels[i].textContent || "");
        var v = clean(values[i].innerText || values[i].textContent || "");
        if (k) map[k] = v;
      }
      return map;
    }

    function extractTitleAndDescription() {
      var Title = getFirstText(["[data-testid='ad-title']", "h1", "[class*='heading_heading']"]) || null;
      var Description = getFirstText(["[data-testid='description']", "[class*='description_description']"]) || null;
      return { Title: Title, Description: Description };
    }

    function extractAddressSplit() {
      var AddressRaw = getFirstText([
        "[data-testid='address']",
        "[class*='address_address']",
        "[class*='address']"
      ]) || null;

      if (!AddressRaw) return { Type: null, Location: null, City: null };

      var s = AddressRaw.trim();
      var firstComma = s.indexOf(",");
      var lastComma = s.lastIndexOf(",");

      if (firstComma === -1) {
        return { Type: s || null, Location: null, City: null };
      }

      if (firstComma === lastComma) {
        return {
          Type: s.slice(0, firstComma).trim() || null,
          Location: null,
          City: s.slice(firstComma + 1).trim() || null
        };
      }

      return {
        Type: s.slice(0, firstComma).trim() || null,
        Location: s.slice(firstComma + 1, lastComma).trim() || null,
        City: s.slice(lastComma + 1).trim() || null
      };
    }

    function extractPriceInfo() {
      function parsePriceValue(text) {
        var m = String(text || "").match(/([\d,]{4,})\s*₪/);
        return m ? Number(String(m[1]).replace(/[^\d]/g, "")) : null;
      }

      var currentText =
        (document.querySelector('[data-testid="current-price"]') || {}).innerText ||
        "";

      var prevText =
        (document.querySelector('[data-testid="previous-tagged-price"]') || {}).innerText ||
        "";

      var currentPrice = parsePriceValue(currentText);
      var oldDisplayedPrice = parsePriceValue(prevText);

      if (!currentPrice) {
        var nums = String(document.body.innerText || "").match(/[\d,]{4,}\s*₪/g) || [];
        var values = nums.map(function (x) {
          return Number(String(x).replace(/[^\d]/g, ""));
        }).filter(Boolean);

        currentPrice = values[0] || null;
        if (!oldDisplayedPrice) oldDisplayedPrice = values[1] || null;
      }

      return {
        currentPrice: currentPrice,
        oldDisplayedPrice: oldDisplayedPrice
      };
    }

    function extractImages() {
      function uniq(arr) { return Array.from(new Set(arr)); }

      function toAbsHttps(u) {
        if (!u) return "";
        u = u.trim();
        if (!u || u.indexOf("blob:") === 0 || u.indexOf("data:") === 0) return "";
        if (u.indexOf("//") === 0) return "https:" + u;
        if (u.indexOf("/") === 0) return location.origin + u;
        return u;
      }

      function fromSrcset(srcset) {
        if (!srcset) return "";
        var parts = srcset.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        var last = parts[parts.length - 1] || "";
        return (last.split(" ")[0] || "");
      }

      function addC6(u) {
        if (!u) return u;
        return u.indexOf("c=6") !== -1 ? u : (u.indexOf("?") !== -1 ? u + "&c=6" : u + "?c=6");
      }

      function isOverlayAsset(u) {
        u = String(u || "").toLowerCase();
        return !u || u.indexOf("/gallery/play.png") !== -1 || u.endsWith("/play.png");
      }

      function getVideoPosterUrls(root) {
        var out = [];

        Array.from(root.querySelectorAll("video")).forEach(function (v) {
          var p = v.getAttribute("poster") || "";
          if (p) out.push(p);
        });

        Array.from(root.querySelectorAll('[style*="background-image"]')).forEach(function (el) {
          var s = el.getAttribute("style") || "";
          var m = s.match(/background-image:\s*url\((['"]?)(.*?)\1\)/i);
          if (m && m[2]) out.push(m[2]);
        });

        return out;
      }

      function imageBaseKey(u) {
        u = String(u || "").trim();
        if (!u) return "";
        return u.split("?")[0];
      }

      function parseImageScore(u) {
        u = String(u || "");
        var mW = u.match(/[?&]w=(\d+)/i);
        var mH = u.match(/[?&]h=(\d+)/i);
        var w = mW ? Number(mW[1]) : 0;
        var h = mH ? Number(mH[1]) : 0;
        return w * h;
      }

      function dedupePreferLargest(urls) {
        var best = {};
        (urls || []).forEach(function (u) {
          var key = imageBaseKey(u);
          if (!key) return;
          var score = parseImageScore(u);
          if (!best[key] || score > best[key].score) {
            best[key] = { url: u, score: score };
          }
        });
        return Object.keys(best).map(function (k) { return best[k].url; });
      }

      var gallery =
        document.querySelector(".ad-item-page-layout_galleryBox__4sXPG") ||
        document.querySelector("[class*='galleryBox']") ||
        null;

      var root = gallery || document;
      var nodes = Array.from(root.querySelectorAll('[data-testid="image"], [data-testid="image"] img, picture img, img, source'));

      var urls = [];
      nodes.forEach(function (n) {
        var tag = (n.tagName || "").toLowerCase();
        if (tag === "img") {
          var u1 = n.currentSrc || n.src || "";
          var u2 = n.getAttribute("data-src") || "";
          var u3 = fromSrcset(n.getAttribute("srcset") || n.srcset || "");
          [u1, u2, u3].forEach(function (u) {
            var abs = toAbsHttps(u);
            if (abs) urls.push(abs);
          });
        } else if (tag === "source") {
          var u = fromSrcset(n.getAttribute("srcset") || "");
          var abs2 = toAbsHttps(u);
          if (abs2) urls.push(abs2);
        }
      });

      var posterUrls = getVideoPosterUrls(root).map(toAbsHttps).filter(Boolean);

      var u = dedupePreferLargest(
        uniq(posterUrls.concat(urls))
          .filter(function (x) { return !isOverlayAsset(x); })
          .map(addC6)
      );

      return {
        Image_URL_First: u[0] || null,
        Gallery_List: u.slice(1),
        All_Image_URLs: u,
        imgCount: u.length
      };
    }

    async function revealPhonesIfNeeded() {
      var btns = Array.from(document.querySelectorAll("button, a"))
        .filter(function (el) {
          return /(הצג|חשפ|לצפייה|לראות).*(טלפון|מספר)/.test(clean(el.innerText || el.textContent || ""));
        })
        .slice(0, 8);

      for (var i = 0; i < btns.length; i++) {
        try { btns[i].click(); } catch (e) {}
        await sleep(250);
      }
    }

    function extractContactsUnified() {
      function cleanPhone(s) { return String(s || "").replace(/[^\d]/g, "") || null; }
      function t(el) { return clean((el && el.textContent) || "") || null; }

      var Agency = null;
      var agencySpan =
        document.querySelector('[class*="agency-details_mediatingAgency__"]') ||
        document.querySelector('[data-testid="agency-details"] [class*="mediatingAgency"]');
      if (agencySpan) Agency = clean(agencySpan.textContent || "");

      if (!Agency) {
        var agencyDetails = document.querySelector('[data-testid="agency-details"]');
        if (agencyDetails) {
          var lines = (agencyDetails.textContent || "").split("\n").map(clean).filter(Boolean);
          var agencyLine = lines.find(function (x) { return x.indexOf("תיווך:") === 0; });
          if (agencyLine) Agency = agencyLine;
        }
      }

      if (Agency) {
        Agency = Agency.replace(/^תיווך:\s*/, "").trim();
        Agency = Agency.split("מספר רישיון")[0].trim();
        Agency = Agency.split("לאתר המשרד")[0].trim();
        Agency = Agency.replace(/\s+/g, " ").trim() || null;
      }

      var brokerRoot =
        document.querySelector(".forsale-agency-contact-section_agencyAdContactsBox") ||
        document.querySelector('[class*="forsale-agency-contact-section_agencyAdContactsBox"]') ||
        document.querySelector('[data-testid="forsale-agency-contact-section"]') ||
        null;

      var ownerRoot =
        document.querySelector(".forsale-contact-section_adContactsBox") ||
        document.querySelector('[class*="forsale-contact-section_adContactsBox"]') ||
        document.querySelector('[data-testid="forsale-contact-section"]') ||
        null;

      var hasAnyAgencyUI =
        !!Agency ||
        !!document.querySelector('[data-testid="agency-details"]') ||
        !!document.querySelector('[class*="agency-details_"]') ||
        !!document.querySelector('[data-testid="agency-ad-contact-info-name"]') ||
        !!document.querySelector('[class*="agency-ad-contact-info_name"]');

      var treatAsOwner = !!ownerRoot && !hasAnyAgencyUI && !brokerRoot;
      var contacts = [];

      if (!treatAsOwner) {
        var root = brokerRoot || document;
        var cards = Array.from(root.querySelectorAll(".agency-ad-contact-info,[class*='agency-ad-contact-info']"));

        for (var i = 0; i < cards.length; i++) {
          var card = cards[i];
          var name =
            t(card.querySelector('[data-testid="agency-ad-contact-info-name"]')) ||
            t(card.querySelector('[class*="agency-ad-contact-info_name"]'));
          var phone =
            cleanPhone(t(card.querySelector('[data-testid="phone-number-link"]'))) ||
            cleanPhone(t(card.querySelector('[class*="phone-number-link"]')));
          if (name || phone) contacts.push({ name: name, phone: phone });
          if (contacts.length >= 4) break;
        }

        if (!contacts.length) {
          var names = Array.from(root.querySelectorAll('[data-testid="agency-ad-contact-info-name"]')).map(t);
          var phones = Array.from(root.querySelectorAll('[data-testid="phone-number-link"]')).map(function (x) { return cleanPhone(t(x)); });

          for (var j = 0; j < Math.min(4, Math.max(names.length, phones.length)); j++) {
            var nm = names[j] || null;
            var ph = phones[j] || null;
            if (nm || ph) contacts.push({ name: nm, phone: ph });
          }
        }
      } else {
        var ocards = Array.from(ownerRoot.querySelectorAll(".ad-contacts_adContactInfoBox,[class*='ad-contacts_adContactInfoBox'],[class*='adContactInfoBox']"));

        for (var k = 0; k < ocards.length; k++) {
          var c = ocards[k];
          var oname = t(c.querySelector('[class*="ad-contact-info_name"]'));
          var ophone = cleanPhone(t(c.querySelector('[class*="ad-contact-info_phoneNumber"]')));
          if (oname || ophone) contacts.push({ name: oname, phone: ophone });
          if (contacts.length >= 4) break;
        }

        if (!contacts.length) {
          var names2 = Array.from(ownerRoot.querySelectorAll('[class*="ad-contact-info_name"]')).map(function (x) { return t(x); });
          var phones2 = Array.from(ownerRoot.querySelectorAll('[class*="ad-contact-info_phoneNumber"]')).map(function (x) { return cleanPhone(t(x)); });

          for (var kk = 0; kk < Math.min(4, Math.max(names2.length, phones2.length)); kk++) {
            var nn = names2[kk] || null;
            var pp = phones2[kk] || null;
            if (nn || pp) contacts.push({ name: nn, phone: pp });
          }
        }
      }

      var seen = {};
      var uniq = [];
      for (var u = 0; u < contacts.length; u++) {
        var cn = (contacts[u].name || "").trim();
        var cp = (contacts[u].phone || "").trim();
        if (!cn && !cp) continue;
        var key = cn + "|" + cp;
        if (seen[key]) continue;
        seen[key] = true;
        uniq.push({ name: cn || null, phone: cp || null });
        if (uniq.length >= 2) break;
      }

      return {
        Agency: Agency,
        Name: (uniq[0] && uniq[0].name) || null,
        Phone: (uniq[0] && uniq[0].phone) || null,
        Name2: (uniq[1] && uniq[1].name) || null,
        Phone2: (uniq[1] && uniq[1].phone) || null
      };
    }

    function getDateText() {
      var el = document.querySelector('[class*="report-ad_createdAt__"]');
      if (!el) return null;
      var m = clean(el.textContent).match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
      return m ? m[0] : null;
    }

    function parseDateToIsoWithOffset(text) {
      var m = String(text || "").match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
      if (!m) return null;

      var day = parseInt(m[1], 10);
      var month = parseInt(m[2], 10);
      var year = parseInt(m[3], 10);
      if (year < 100) year += 2000;

      var d = new Date(year, month - 1, day, 0, 0, 0);
      function pad(n) { return String(Math.abs(n)).padStart(2, "0"); }
      var offsetMin = -d.getTimezoneOffset();
      var sign = offsetMin >= 0 ? "+" : "-";
      var hh = pad(Math.floor(Math.abs(offsetMin) / 60));
      var mm = pad(Math.abs(offsetMin) % 60);

      return (
        d.getFullYear() + "-" +
        pad(d.getMonth() + 1) + "-" +
        pad(d.getDate()) + "T" +
        pad(d.getHours()) + ":" +
        pad(d.getMinutes()) + ":" +
        pad(d.getSeconds()) +
        sign + hh + ":" + mm
      );
    }

    function extractTagsText() {
      var tagsRoot =
        document.querySelector('[class*="tags_tagsBox"]') ||
        document.querySelector('[class*="tags"]') ||
        document.querySelector('[data-testid="tags"]') ||
        document;

      var texts = Array.from(tagsRoot.querySelectorAll("*"))
        .map(function (el) { return clean(el.textContent); })
        .filter(Boolean);

      return texts.join(" | ");
    }

    function extractTagsFlags() {
      var allText = extractTagsText();
      var isExclusive = allText.indexOf(CFG.tagFlags.Exclusive) !== -1;
      var hasShelter = new RegExp(CFG.tagFlags.ShelterRegex).test(allText);

      var hasAgencyUi =
        !!document.querySelector('[data-testid="agency-details"]') ||
        !!document.querySelector('[class*="agency-details_"]') ||
        !!document.querySelector('[data-testid="agency-ad-contact-info-name"]') ||
        !!document.querySelector('[class*="agency-ad-contact-info_name"]') ||
        !!document.querySelector(".forsale-agency-contact-section_agencyAdContactsBox") ||
        !!document.querySelector('[class*="forsale-agency-contact-section_agencyAdContactsBox"]');

      var hasOwnerUi =
        !!document.querySelector(".forsale-contact-section_adContactsBox") ||
        !!document.querySelector('[class*="forsale-contact-section_adContactsBox"]');

      var isBroker = hasAgencyUi || (!hasOwnerUi && isExclusive);

      return {
        Broker: !!isBroker,
        Exclusive: !!isExclusive,
        Shelter: !!hasShelter
      };
    }

    function extractActiveFeatureMap() {
      function findFeatureSection() {
        var els = Array.from(document.querySelectorAll("h2,h3,h4,div,span,p"));
        for (var i = 0; i < els.length; i++) {
          var t = clean(els[i].textContent);
          if (t === CFG.labels.featureSection) {
            var node = els[i];
            for (var up = 0; up < 4 && node; up++, node = node.parentElement) {
              if (!node) break;
              var txt = clean(node.innerText || node.textContent || "");
              if (
                txt.indexOf(CFG.labels.featureSection) !== -1 &&
                (
                  txt.indexOf(CFG.features.Elevator) !== -1 ||
                  txt.indexOf(CFG.features.Terrace) !== -1 ||
                  txt.indexOf(CFG.features.AC) !== -1 ||
                  txt.indexOf(CFG.features.Storage) !== -1 ||
                  txt.indexOf(CFG.features.Accessibility) !== -1 ||
                  txt.indexOf(CFG.features.Renovated) !== -1
                )
              ) return node;
            }
          }
        }
        return null;
      }

      function isInactive(el) {
        if (!el) return false;
        var chain = [el];
        var p = el.parentElement;
        while (p && chain.length < 4) {
          chain.push(p);
          p = p.parentElement;
        }

        return chain.some(function (node) {
          var cls = String(node.className || "");
          var cs = window.getComputedStyle(node);
          if (node.getAttribute("aria-disabled") === "true") return true;
          if (/disabled|inactive|muted|grey|gray|off/i.test(cls)) return true;
          if (cs.display === "none" || cs.visibility === "hidden") return true;
          if (parseFloat(cs.opacity || "1") < 0.95) return true;
          if (cs.filter && cs.filter !== "none" && /grayscale/i.test(cs.filter)) return true;
          return false;
        });
      }

      var root = findFeatureSection();
      var map = {};
      if (!root) return map;

      var nodes = Array.from(root.querySelectorAll("button,span,div,p"))
        .filter(function (el) {
          var txt = clean(el.textContent);
          if (!txt) return false;
          if (txt.length > 20) return false;
          if (txt === CFG.labels.featureSection) return false;
          return true;
        });

      nodes.forEach(function (el) {
        var txt = clean(el.textContent);
        if (!txt) return;
        if (isInactive(el)) return;
        map[txt] = true;
      });

      return map;
    }

    function hasFurnitureSection() {
      var texts = Array.from(document.querySelectorAll("h2,h3,h4,div,span,p"))
        .map(function (el) { return clean(el.textContent); });

      return texts.indexOf(CFG.labels.furnitureSection) !== -1;
    }

    function extractPropertyFeatures(map) {
      var active = extractActiveFeatureMap();
      function has(label) { return !!active[label]; }

      var parkingKeys = CFG.labels.detailsParking || [];
      var parkingNum = 0;
      for (var i = 0; i < parkingKeys.length; i++) {
        parkingNum = Math.max(parkingNum, asNum(map[parkingKeys[i]]) || 0);
      }

      return {
        Parking: parkingNum > 0 || has(CFG.features.Parking),
        Elevator: has(CFG.features.Elevator),
        Terrace: has(CFG.features.Terrace),
        AC: has(CFG.features.AC),
        Storage: has(CFG.features.Storage),
        Renovated: has(CFG.features.Renovated),
        Accessibility: has(CFG.features.Accessibility),
        Bars: has(CFG.features.Bars),
        Furnished: hasFurnitureSection(),
        SolarHeater: has(CFG.features.SolarHeater)
      };
    }

    function extractCondition(map, features) {
      var raw = "";
      var keys = CFG.labels.detailsCondition || [];
      for (var i = 0; i < keys.length; i++) {
        raw = clean(map[keys[i]] || "");
        if (raw) break;
      }

      if (CFG.conditionMap[raw]) return CFG.conditionMap[raw];
      if (!raw && features.Renovated) return CFG.conditionMap["משופץ"] || null;
      return raw || null;
    }

    async function extractAll() {
      for (var i = 0; i < 120; i++) {
        var ok = !!(document.querySelector('[data-testid="building-details"]') || document.querySelector("[class*='buildingDetailsBox']"));
        if (ok) break;
        await sleep(150);
      }

      await revealPhonesIfNeeded();
      await sleep(250);

      var map = extractAdditionalDetailsMap();
      var FloorsFromMap = asNum(map["קומות בבניין"]);
      var BuiltAreaFromMap = asNum(map['מ"ר בנוי'] || map['מ״ר בנוי']);

      var Floors = keepIf(FloorsFromMap, function (n) { return n >= 1 && n <= 200; });
      var BuiltArea = keepIf(BuiltAreaFromMap, function (n) { return n >= 5 && n <= 20000; });

      var tile = extractRoomsFloorAreaFromTiles();
      if (!Floors && tile.FloorsFromSlash) Floors = tile.FloorsFromSlash;

      var num = normalizeNumerics({
        Rooms: tile.Rooms === null ? null : Number(tile.Rooms),
        Floor: tile.Floor === null ? null : Number(tile.Floor),
        Area: tile.Area === null ? null : Number(tile.Area),
        BuiltArea: BuiltArea,
        Floors: Floors
      });

      var td = extractTitleAndDescription();
      var addr = extractAddressSplit();
      var imgs = extractImages();
      var contacts = extractContactsUnified();
      var flags = extractTagsFlags();
      var features = extractPropertyFeatures(map);
      var condition = extractCondition(map, features);
      var publishedRaw = getDateText();
      var publishedIso = parseDateToIsoWithOffset(publishedRaw);
      var priceInfo = extractPriceInfo();

      if (DEBUG) {
        console.log({
          map: map,
          features: features,
          condition: condition,
          config: CFG,
          images: imgs,
          priceInfo: priceInfo
        });
      }

      return {
        URL: getCleanItemUrl(),
        Listing_ID: getListingIdFromUrl(),
        Created: getNowIsoWithOffset(),
        Published: publishedIso,
        Price: priceInfo.currentPrice,
        OldDisplayedPrice: priceInfo.oldDisplayedPrice,

        Rooms: num.Rooms,
        Floor: num.Floor,
        Area: num.Area,
        Floors: num.Floors,
        BuiltArea: num.BuiltArea,

        Title: td.Title,
        Description: td.Description,

        Type: addr.Type,
        Location: addr.Location,
        City: addr.City,

        Image_Main: imgs.Image_URL_First,
        Image_Gallery: imgs.Gallery_List,
        Image_URLs_All_New: imgs.All_Image_URLs,
        imgCount: imgs.imgCount,

        Agency: contacts.Agency,
        Name: contacts.Name,
        Phone: contacts.Phone,
        Name2: contacts.Name2,
        Phone2: contacts.Phone2,

        Broker: flags.Broker,
        Exclusive: flags.Exclusive,
        Shelter: flags.Shelter,

        Parking: features.Parking,
        Elevator: features.Elevator,
        Terrace: features.Terrace,
        AC: features.AC,
        Storage: features.Storage,
        Renovated: features.Renovated,
        Accessibility: features.Accessibility,
        Bars: features.Bars,
        Furnished: features.Furnished,
        SolarHeater: features.SolarHeater,

        Condition: condition
      };
    }

    async function upsertToMemento(v) {
      var TOKEN = await getToken();
      var listUrl = API_BASE + "/libraries/" + encodeURIComponent(LIBRARY_ID) +
        "/entries?token=" + encodeURIComponent(TOKEN) + "&pageSize=1000";
      var list = await jfetch(listUrl, { method: "GET" });

      var existingEntry = null;

      (list.entries || []).some(function (e) {
        var idVal = extractFieldValue(e, FID.Listing_ID);
        if (clean(idVal || "") && clean(idVal || "") === clean(v.Listing_ID || "")) {
          existingEntry = e;
          return true;
        }
        return false;
      });

      if (!existingEntry) {
        (list.entries || []).some(function (e) {
          var urlVal = extractFieldValue(e, FID.URL);
          if (clean(urlVal || "") === clean(v.URL || "")) {
            existingEntry = e;
            return true;
          }
          return false;
        });
      }

      var finalValues = Object.assign({}, v);

      if (existingEntry) {
        var existingStartPrice = extractFieldValue(existingEntry, FID.StartPrice);
        var existingPrice = extractFieldValue(existingEntry, FID.Price);
        var existingPrevPrice = extractFieldValue(existingEntry, FID.PrevPrice);
        var existingDesc = extractFieldValue(existingEntry, FID.Description);
        var existingPrevDesc = extractFieldValue(existingEntry, FID.PrevDescription);
        var existingAllImages = extractFieldValue(existingEntry, FID.Image_URLs_All);
        var existingMain = extractFieldValue(existingEntry, FID.Image_Main);
        var existingGallery = extractFieldValue(existingEntry, FID.Image_Gallery);

        finalValues.StartPrice =
          existingStartPrice != null && String(existingStartPrice).trim() !== ""
            ? existingStartPrice
            : (v.OldDisplayedPrice || v.Price);

        if (
          existingPrice != null &&
          v.Price != null &&
          String(existingPrice) !== String(v.Price)
        ) {
          finalValues.PrevPrice = appendHistoryLine(
            existingPrevPrice,
            formatPriceHistoryValue(existingPrice) + " | " + todayStamp(),
            "\n"
          );
        } else {
          finalValues.PrevPrice = existingPrevPrice || null;
        }

        if (
          v.OldDisplayedPrice != null &&
          String(v.OldDisplayedPrice) !== String(v.Price)
        ) {
          finalValues.PrevPrice = appendHistoryLine(
            finalValues.PrevPrice,
            formatPriceHistoryValue(v.OldDisplayedPrice) + " | " + todayStamp(),
            "\n"
          );
        }

        if (
          clean(existingDesc || "") &&
          clean(v.Description || "") &&
          clean(existingDesc || "") !== clean(v.Description || "")
        ) {
          finalValues.PrevDescription = appendHistoryLine(
            existingPrevDesc,
            todayStamp() + " | " + clean(existingDesc),
            "\n----\n"
          );
        } else {
          finalValues.PrevDescription = existingPrevDesc || null;
        }

        var mergedAllImages = uniqueStrings(
          splitLines(existingAllImages)
            .concat(normalizeImageFieldValue(existingMain))
            .concat(normalizeImageFieldValue(existingGallery))
            .concat(v.Image_URLs_All_New || [])
        );

        finalValues.Image_URLs_All = mergedAllImages.join("\n") || null;
      } else {
        finalValues.StartPrice = v.OldDisplayedPrice || v.Price;
        finalValues.PrevPrice =
          (v.OldDisplayedPrice != null && String(v.OldDisplayedPrice) !== String(v.Price))
            ? (formatPriceHistoryValue(v.OldDisplayedPrice) + " | " + todayStamp())
            : null;
        finalValues.PrevDescription = null;
        finalValues.Image_URLs_All = uniqueStrings(v.Image_URLs_All_New || []).join("\n") || null;
      }

      finalValues.Discount =
        finalValues.StartPrice != null &&
        finalValues.Price != null &&
        Number(finalValues.StartPrice) > Number(finalValues.Price);

      var fields = [];
      function add(id, val) {
        if (id == null) return;
        if (val == null) return;
        if (typeof val === "string" && !val.trim()) return;
        if (Array.isArray(val) && !val.length) return;
        fields.push({ id: id, value: val });
      }

      add(FID.URL, finalValues.URL);
      add(FID.Listing_ID, finalValues.Listing_ID);
      add(FID.Created, finalValues.Created);
      add(FID.Published, finalValues.Published);

      if (finalValues.Image_Main) add(FID.Image_Main, finalValues.Image_Main);
      if (finalValues.Image_Gallery && finalValues.Image_Gallery.length) add(FID.Image_Gallery, finalValues.Image_Gallery);
      add(FID.Image_URLs_All, finalValues.Image_URLs_All);

      add(FID.Price, finalValues.Price);
      add(FID.StartPrice, finalValues.StartPrice);
      add(FID.PrevPrice, finalValues.PrevPrice);
      add(FID.Discount, finalValues.Discount);

      add(FID.Rooms, finalValues.Rooms);
      add(FID.Floor, finalValues.Floor);
      add(FID.Area, finalValues.Area);
      add(FID.Floors, finalValues.Floors);
      add(FID.BuiltArea, finalValues.BuiltArea);

      add(FID.Title, finalValues.Title);
      add(FID.Description, finalValues.Description);
      add(FID.PrevDescription, finalValues.PrevDescription);

      add(FID.Type, finalValues.Type);
      add(FID.Location, finalValues.Location);
      add(FID.City, finalValues.City);

      add(FID.Agency, finalValues.Agency);
      add(FID.Name, finalValues.Name);
      add(FID.Phone, finalValues.Phone);
      add(FID.Name2, finalValues.Name2);
      add(FID.Phone2, finalValues.Phone2);

      add(FID.Broker, finalValues.Broker);
      add(FID.Exclusive, finalValues.Exclusive);
      add(FID.Shelter, finalValues.Shelter);

      add(FID.Parking, finalValues.Parking);
      add(FID.Elevator, finalValues.Elevator);
      add(FID.Terrace, finalValues.Terrace);
      add(FID.AC, finalValues.AC);
      add(FID.Storage, finalValues.Storage);
      add(FID.Renovated, finalValues.Renovated);
      add(FID.Accessibility, finalValues.Accessibility);
      add(FID.Bars, finalValues.Bars);
      add(FID.Furnished, finalValues.Furnished);
      add(FID.SolarHeater, finalValues.SolarHeater);

      add(FID.Condition, finalValues.Condition);

      var body = JSON.stringify({ fields: fields });

      if (existingEntry) {
        var putUrl = API_BASE + "/libraries/" + encodeURIComponent(LIBRARY_ID) +
          "/entries/" + encodeURIComponent(existingEntry.id) + "?token=" + encodeURIComponent(TOKEN);
        await jfetch(putUrl, { method: "PUT", body: body });
        alert("✅ עודכן");
      } else {
        var postUrl = API_BASE + "/libraries/" + encodeURIComponent(LIBRARY_ID) +
          "/entries?token=" + encodeURIComponent(TOKEN);
        await jfetch(postUrl, { method: "POST", body: body });
        alert("✅ נשמר");
      }
    }

    btn.addEventListener("click", async function () {
      btn.disabled = true;
      setButtonIcon(btn, WAIT_ICON, "שומר...");
      try {
        var v = await extractAll();
        await upsertToMemento(v);
      } catch (e) {
        console.error(e);
        alert("❌ " + (e && e.message ? e.message : e));
      } finally {
        btn.disabled = false;
        setButtonIcon(btn, SAVE_ICON, "שמירה");
      }
    });

  } catch (e) {
    console.error(e);
    alert("❌ Script crashed: " + (e && e.message ? e.message : e));
  }
})();