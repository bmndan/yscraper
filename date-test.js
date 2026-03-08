// ==UserScript==
// @name         Y2 Date Test
// @namespace    berman
// @version      1.1
// @match        *://*/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  var TOKEN_URL = "https://raw.githubusercontent.com/bmndan/yscraper/main/token.txt";
  var LIBRARY_ID = "jRdNE9YJP";
  var API_BASE = "https://api.mementodatabase.com/v1";
  var DOMAIN_KEY = "target_domain";

  var FID = {
    URL: 0,
    Published: 41
  };

  function clean(s) {
    return String(s || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

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

  function getToken() {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "GET",
        url: TOKEN_URL + "?t=" + Date.now(),
        headers: { "Cache-Control": "no-cache" },
        onload: function (r) {
          if (r.status === 200) {
            var token = String(r.responseText || "")
              .replace(/^\uFEFF/, "")
              .replace(/\r/g, "")
              .trim();
            if (!token) reject(new Error("token.txt empty"));
            else resolve(token);
          } else {
            reject(new Error("Token load failed: " + r.status));
          }
        },
        onerror: function () {
          reject(new Error("Token request failed"));
        }
      });
    });
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

  function getDateText() {
    var el = document.querySelector('[class*="report-ad_createdAt__"]');
    if (!el) return null;

    var m = clean(el.textContent).match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
    return m ? m[0] : null;
  }

  function parseDateToIsoWithOffset(text) {
    var m = String(text || '').match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (!m) return null;

    var day = parseInt(m[1], 10);
    var month = parseInt(m[2], 10);
    var year = parseInt(m[3], 10);
    if (year < 100) year += 2000;

    var d = new Date(year, month - 1, day, 0, 0, 0);

    function pad(n) {
      return String(Math.abs(n)).padStart(2, '0');
    }

    var offsetMin = -d.getTimezoneOffset();
    var sign = offsetMin >= 0 ? '+' : '-';
    var hh = pad(Math.floor(Math.abs(offsetMin) / 60));
    var mm = pad(Math.abs(offsetMin) % 60);

    return (
      d.getFullYear() + '-' +
      pad(d.getMonth() + 1) + '-' +
      pad(d.getDate()) + 'T' +
      pad(d.getHours()) + ':' +
      pad(d.getMinutes()) + ':' +
      pad(d.getSeconds()) +
      sign + hh + ':' + mm
    );
  }

  async function saveDateOnly() {
    var TOKEN = await getToken();
    var rawDate = getDateText();
    var isoDate = parseDateToIsoWithOffset(rawDate);

    if (!rawDate) throw new Error("Date text not found");
    if (!isoDate) throw new Error("Could not parse date: " + rawDate);

    var fields = [
      { id: FID.URL, value: location.href },
      { id: FID.Published, value: isoDate }
    ];

    var body = JSON.stringify({ fields: fields });

    var postUrl = API_BASE + "/libraries/" + encodeURIComponent(LIBRARY_ID) +
      "/entries?token=" + encodeURIComponent(TOKEN);

    var result = await jfetch(postUrl, { method: "POST", body: body });

    alert(
      "✅ Created\n" +
      "Raw date: " + rawDate +
      "\nISO date: " + isoDate +
      "\n\nResponse:\n" + JSON.stringify(result, null, 2)
    );
  }

  installDomainUi();

  if (!onStoredDomain()) return;
  if (!/\/realestate\/item\//.test(location.pathname)) return;

  makeUiButton("y2DateTestBtn", "TEST DATE IMPORT", 16, function () {
    saveDateOnly().catch(function (e) {
      console.error(e);
      alert("❌ " + (e && e.message ? e.message : e));
    });
  });

})();