// ==UserScript==
// @name         Y2 Features Test
// @namespace    berman
// @version      1.0
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
    Elevator: 48,        // מעלית
    Terrace: 49,         // מרפסת
    AC: 50,              // מיזוג
    Storage: 51,         // מחסן
    Renovated: 52,       // משופצת
    Accessibility: 53,   // גישה לנכים
    Bars: 54,            // סורגים
    Furnished: 55,       // מרוהטת
    Condition: 57,       // מצב
    SolarHeater: 58      // דוד שמש
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

  function onStoredDomain() {
    var d = getStoredDomain();
    return !!d && location.hostname === d;
  }

  function getCleanItemUrl() {
    return location.origin + location.pathname;
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

  function extractAdditionalDetailsMap() {
    var labels = Array.from(document.querySelectorAll('[class*="item-detail_label"]'));
    var values = Array.from(document.querySelectorAll('[class*="item-detail_value"]'));
    var map = {};
    for (var i = 0; i < Math.min(labels.length, values.length); i++) {
      var k = (labels[i].innerText || labels[i].textContent || "").trim();
      var v = (values[i].innerText || values[i].textContent || "").trim();
      if (k) map[k] = v;
    }
    return map;
  }

  function asNum(x) {
    if (x === 0) return 0;
    var d = String(x || "").replace(/[^\d]/g, "");
    if (!d) return null;
    var n = Number(d);
    return isFinite(n) ? n : null;
  }

  function extractActiveFeatureMap() {
    function findFeatureSection() {
      var els = Array.from(document.querySelectorAll("h2,h3,h4,div,span,p"));
      for (var i = 0; i < els.length; i++) {
        var t = clean(els[i].textContent);
        if (t === "מה יש בנכס") {
          var node = els[i];
          for (var up = 0; up < 4 && node; up++, node = node.parentElement) {
            if (!node) break;
            var txt = clean(node.innerText || node.textContent || "");
            if (
              txt.indexOf("מה יש בנכס") !== -1 &&
              (
                txt.indexOf("מעלית") !== -1 ||
                txt.indexOf("מרפסת") !== -1 ||
                txt.indexOf("מיזוג") !== -1 ||
                txt.indexOf("מחסן") !== -1 ||
                txt.indexOf("גישה לנכים") !== -1 ||
                txt.indexOf("משופצת") !== -1
              )
            ) {
              return node;
            }
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
        if (txt === "מה יש בנכס") return false;
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

  function extractPropertyFeatures(map) {
    var active = extractActiveFeatureMap();

    function has(label) {
      return !!active[label];
    }

    return {
      Elevator: has("מעלית"),
      Terrace: has("מרפסת"),
      AC: has("מיזוג"),
      Storage: has("מחסן"),
      Renovated: has("משופצת"),
      Accessibility: has("גישה לנכים"),
      Bars: has("סורגים"),
      Furnished: has("מרוהטת"),
      SolarHeater: has("דוד שמש")
    };
  }

  function extractCondition(map, features) {
    var raw = clean(
      map["מצב הנכס"] ||
      map["מצב"] ||
      ""
    );

    if (raw === "משופץ") return "משופץ ב-5 שנים האחרונים";
    return raw || (features.Renovated ? "משופץ ב-5 שנים האחרונים" : null);
  }

  async function testFeaturesOnly() {
    var TOKEN = await getToken();
    var map = extractAdditionalDetailsMap();
    var features = extractPropertyFeatures(map);
    var condition = extractCondition(map, features);

    console.log("details map", map);
    console.log("active features", extractActiveFeatureMap());
    console.log("parsed features", features);
    console.log("condition", condition);

    var fields = [];
    function add(id, val) {
      if (id == null) return;
      if (val == null) return;
      if (typeof val === "string" && !val.trim()) return;
      fields.push({ id: id, value: val });
    }

    add(FID.URL, getCleanItemUrl());
    add(FID.Elevator, features.Elevator);
    add(FID.Terrace, features.Terrace);
    add(FID.AC, features.AC);
    add(FID.Storage, features.Storage);
    add(FID.Renovated, features.Renovated);
    add(FID.Accessibility, features.Accessibility);
    add(FID.Bars, features.Bars);
    add(FID.Furnished, features.Furnished);
    add(FID.SolarHeater, features.SolarHeater);
    add(FID.Condition, condition);

    var body = JSON.stringify({ fields: fields });

    var postUrl = API_BASE + "/libraries/" + encodeURIComponent(LIBRARY_ID) +
      "/entries?token=" + encodeURIComponent(TOKEN);

    var result = await jfetch(postUrl, { method: "POST", body: body });

    alert(
      "✅ Created\n\n" +
      "Active features:\n" + JSON.stringify(extractActiveFeatureMap(), null, 2) +
      "\n\nParsed features:\n" + JSON.stringify(features, null, 2) +
      "\n\nCondition:\n" + String(condition) +
      "\n\nResponse:\n" + JSON.stringify(result, null, 2)
    );
  }

  if (!onStoredDomain()) return;
  if (!/\/realestate\/item\//.test(location.pathname)) return;

  makeUiButton("y2FeaturesTestBtn", "TEST FEATURES", 16, function () {
    testFeaturesOnly().catch(function (e) {
      console.error(e);
      alert("❌ " + (e && e.message ? e.message : e));
    });
  });

})();