// ==UserScript==
// @name         Y2 Main
// @namespace    berman
// @version      4.6.0
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
      }

      var menuBtn = makeUiButton("y2MenuBtn", "Y2", 58, function () {
        expanded = !expanded;
        if (expanded) showActions();
        else removeActions();
      });
      menuBtn.style.minWidth = "44px";
      menuBtn.style.padding = "8px 10px";
    }

    installDomainUi();

    if (!onStoredDomain()) return;
    if (!/\/realestate\/item\//.test(location.pathname)) return;

    GM_addStyle(
      "#mementoSaveBtn{position:fixed;right:16px;bottom:16px;z-index:999999;padding:10px 12px;border-radius:10px;border:1px solid #222;background:#fff;color:#111;font:14px/1.2 sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.18);cursor:pointer}" +
      "#mementoSaveBtn:disabled{opacity:.6;cursor:default}"
    );

    var btn = document.getElementById("mementoSaveBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "mementoSaveBtn";
      btn.textContent = "Save to Memento";
      document.body.appendChild(btn);
    }

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

      var u = uniq(urls).map(addC6);
      return {
        Image_URL_First: u[0] || null,
        Gallery_List: u.slice(1),
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

      var td = {
        Title: getFirstText(["[data-testid='ad-title']", "h1", "[class*='heading_heading']"]) || null,
        Description: getFirstText(["[data-testid='description']", "[class*='description_description']"]) || null
      };
      var addr = extractAddressSplit();
      var imgs = extractImages();
      var contacts = extractContactsUnified();
      var flags = extractTagsFlags();
      var features = extractPropertyFeatures(map);
      var condition = extractCondition(map, features);
      var publishedRaw = getDateText();
      var publishedIso = parseDateToIsoWithOffset(publishedRaw);

      if (DEBUG) console.log({ map: map, features: features, condition: condition, config: CFG });

      return {
        URL: getCleanItemUrl(),
        Created: getNowIsoWithOffset(),
        Published: publishedIso,
        Price: extractPriceFallback(),

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
      var fields = [];

      function add(id, val) {
        if (id == null) return;
        if (val == null) return;
        if (typeof val === "string" && !val.trim()) return;
        if (Array.isArray(val) && !val.length) return;
        fields.push({ id: id, value: val });
      }

      add(FID.URL, v.URL);
      add(FID.Created, v.Created);
      add(FID.Published, v.Published);

      if (v.Image_Main) add(FID.Image_Main, v.Image_Main);
      if (v.Image_Gallery && v.Image_Gallery.length) add(FID.Image_Gallery, v.Image_Gallery);

      add(FID.Price, v.Price);
      add(FID.Rooms, v.Rooms);
      add(FID.Floor, v.Floor);
      add(FID.Area, v.Area);
      add(FID.Floors, v.Floors);
      add(FID.BuiltArea, v.BuiltArea);

      add(FID.Title, v.Title);
      add(FID.Description, v.Description);

      add(FID.Type, v.Type);
      add(FID.Location, v.Location);
      add(FID.City, v.City);

      add(FID.Agency, v.Agency);
      add(FID.Name, v.Name);
      add(FID.Phone, v.Phone);
      add(FID.Name2, v.Name2);
      add(FID.Phone2, v.Phone2);

      add(FID.Broker, v.Broker);
      add(FID.Exclusive, v.Exclusive);
      add(FID.Shelter, v.Shelter);

      add(FID.Parking, v.Parking);
      add(FID.Elevator, v.Elevator);
      add(FID.Terrace, v.Terrace);
      add(FID.AC, v.AC);
      add(FID.Storage, v.Storage);
      add(FID.Renovated, v.Renovated);
      add(FID.Accessibility, v.Accessibility);
      add(FID.Bars, v.Bars);
      add(FID.Furnished, v.Furnished);
      add(FID.SolarHeater, v.SolarHeater);

      add(FID.Condition, v.Condition);

      var listUrl = API_BASE + "/libraries/" + encodeURIComponent(LIBRARY_ID) +
        "/entries?token=" + encodeURIComponent(TOKEN) + "&pageSize=1000";
      var list = await jfetch(listUrl, { method: "GET" });

      var existingId = null;
      (list.entries || []).some(function (e) {
        var f = (e.fields || []).find(function (x) { return x.id === FID.URL; });
        if (String((f && f.value) || "").trim() === v.URL) {
          existingId = e.id;
          return true;
        }
        return false;
      });

      var body = JSON.stringify({ fields: fields });

      if (existingId) {
        var putUrl = API_BASE + "/libraries/" + encodeURIComponent(LIBRARY_ID) +
          "/entries/" + encodeURIComponent(existingId) + "?token=" + encodeURIComponent(TOKEN);
        await jfetch(putUrl, { method: "PUT", body: body });
        alert("✅ Updated");
      } else {
        var postUrl = API_BASE + "/libraries/" + encodeURIComponent(LIBRARY_ID) +
          "/entries?token=" + encodeURIComponent(TOKEN);
        await jfetch(postUrl, { method: "POST", body: body });
        alert("✅ Created");
      }
    }

    btn.addEventListener("click", async function () {
      btn.disabled = true;
      btn.textContent = "Saving...";
      try {
        var v = await extractAll();
        await upsertToMemento(v);
      } catch (e) {
        console.error(e);
        alert("❌ " + (e && e.message ? e.message : e));
      } finally {
        btn.disabled = false;
        btn.textContent = "Save to Memento";
      }
    });

  } catch (e) {
    console.error(e);
    alert("❌ Script crashed: " + (e && e.message ? e.message : e));
  }
})();