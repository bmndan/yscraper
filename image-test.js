// ==UserScript==
// @name         Y2 Image Test
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
    Images_URLs: 7,
    Image_URL_First: 8,
    Image_Main: 4,     // תמונה
    Image_Gallery: 37  // גלריה
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

  function extractImages() {
    function uniq(arr) {
      return Array.from(new Set(arr));
    }
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
      Images_URLs: u.length ? u.join("\n") : null,
      Image_URL_First: u[0] || null,
      Gallery_List: u.slice(1),
      imgCount: u.length
    };
  }

  async function saveImagesOnly() {
    var TOKEN = await getToken();
    var imgs = extractImages();

    var fields = [];
    function add(id, val) {
      if (id == null) return;
      if (val == null) return;
      if (typeof val === "string" && !val.trim()) return;
      fields.push({ id: id, value: val });
    }

    add(FID.URL, location.href);
    add(FID.Images_URLs, imgs.Images_URLs);
    add(FID.Image_URL_First, imgs.Image_URL_First);

    if (imgs.Image_URL_First) {
      add(FID.Image_Main, [{ url: imgs.Image_URL_First }]);
    }

    if (imgs.Gallery_List && imgs.Gallery_List.length) {
      add(FID.Image_Gallery, imgs.Gallery_List.map(function (u) {
        return { url: u };
      }));
    }

    var body = JSON.stringify({ fields: fields });

    var postUrl = API_BASE + "/libraries/" + encodeURIComponent(LIBRARY_ID) +
      "/entries?token=" + encodeURIComponent(TOKEN);

    var result = await jfetch(postUrl, { method: "POST", body: body });

    alert(
      "✅ Created\n" +
      "Images found: " + imgs.imgCount +
      "\nFirst: " + (imgs.Image_URL_First || "-") +
      "\nGallery count: " + (imgs.Gallery_List ? imgs.Gallery_List.length : 0) +
      "\n\nResponse:\n" + JSON.stringify(result, null, 2)
    );
  }

  installDomainUi();

  if (!onStoredDomain()) return;
  if (!/\/realestate\/item\//.test(location.pathname)) return;

  makeUiButton("y2ImageTestBtn", "TEST IMAGE IMPORT", 16, function () {
    saveImagesOnly().catch(function (e) {
      console.error(e);
      alert("❌ " + (e && e.message ? e.message : e));
    });
  });

})();