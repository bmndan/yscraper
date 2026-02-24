
// ==UserScript==
// @name         Yad2 -> Memento (Full Robust v1.6: fixes CreatedDate/Area/Floors/BuiltArea)
// @namespace    berman
// @version      1.6
// @match        https://www.yad2.co.il/realestate/item/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  const TOKEN = "PASTE_YOUR_TOKEN_HERE";
  const LIBRARY_ID = "jRdNE9YJP";
  const API_BASE = "https://api.mementodatabase.com/v1";

  // Field IDs (your library)
  const FID = {
    URL: 0,
    CreatedDate: 1,
    Images_URLs: 7,
    Image_URL_First: 8,
    Price: 9,
    Rooms: 10,
    Floor: 11,
    Area: 12,
    Agency: 13,
    BrokerName: 14,
    BrokerPhone: 15,

    Type: 16,
    Floors: 17,
    City: 18,
    Location: 19,
    Title: 20,
    Description: 21,

    // You recreated BuiltArea as Integer -> new id:
    BuiltArea: 24,
  };

  GM_addStyle(`
    #mementoSaveBtn{
      position:fixed; right:16px; bottom:16px; z-index:999999;
      padding:10px 12px; border-radius:10px; border:1px solid #222;
      background:#fff; color:#111; font:14px/1.2 sans-serif;
      box-shadow:0 6px 18px rgba(0,0,0,.18);
      cursor:pointer;
    }
    #mementoSaveBtn:disabled{opacity:.6;cursor:default;}
  `);

  const btn = document.createElement("button");
  btn.id = "mementoSaveBtn";
  btn.textContent = "Save to Memento";
  document.body.appendChild(btn);

  // ---- helpers
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const digits = (s) => (s || "").toString().replace(/[^\d]/g, "");
  const uniq = (arr) => Array.from(new Set(arr));
  const pick = (...vals) => vals.find(v => v !== undefined && v !== null && v !== "");
  const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();

  async function jfetch(url, opts) {
    const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json" } });
    const t = await res.text();
    let data;
    try { data = t ? JSON.parse(t) : {}; }
    catch { throw new Error("Non-JSON response: " + t.slice(0, 220)); }
    if (!res.ok) throw new Error(`${res.status}: ${t.slice(0, 320)}`);
    return data;
  }

  function getText(sel) {
    const el = document.querySelector(sel);
    return el ? ((el.innerText || el.textContent || "").trim()) : "";
  }
  function getFirstText(selectors) {
    for (const s of selectors) {
      const v = getText(s);
      if (v) return v;
    }
    return "";
  }

  // ---- CreatedDate (DOM-based)
  function extractCreatedDateFromDOM() {
    const el =
      document.querySelector(".report-ad_createdAt__tqSM6") ||
      document.querySelector('[class*="report-ad_createdAt"]') ||
      document.querySelector('[data-testid="created-at"]');

    const raw = (el?.innerText || el?.textContent || "").trim();
    if (!raw) return null;

    const s = raw.replace(/^פורסם ב\s*/,"").trim();
    const m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (!m) return null;

    return new Date(+m[3], +m[2]-1, +m[1]).getTime();
  }

  // ---- Price fallback (rendered text; stable)
  function extractPriceFallback() {
    const t = norm(document.body?.innerText || "");
    const matches = Array.from(t.matchAll(/₪\s*([\d,]{4,})/g))
      .map(x => +digits(x[1]))
      .filter(n => n > 0);
    return matches.length ? Math.max(...matches) : null;
  }

  // ---- Contact extraction (your testids)
  function extractBrokerAgencyFromDOM() {
    const BrokerName = getText('[data-testid="agency-ad-contact-info-name"]') || null;

    const BrokerPhone = (() => {
      const raw = getText('[data-testid="phone-number-link"]');
      const d = digits(raw);
      return d || null;
    })();

    // Only the "תיווך:" line (avoid license/site)
    const agencyLine = (() => {
      const s = getText('[data-testid="agency-details"] .agency-details_mediatingAgency__w108Y');
      if (s) return s;

      const block = getText('[data-testid="agency-details"]');
      if (!block) return "";
      const line = block.split("\n").map(x => x.trim()).find(x => x.startsWith("תיווך:"));
      return line || "";
    })();

    const Agency = agencyLine ? agencyLine.replace(/^תיווך:\s*/,"").trim() || null : null;
    return { Agency, BrokerName, BrokerPhone };
  }

  // ---- Title + Description
  function extractTitleAndDescription() {
    const Title = getFirstText([
      '[data-testid="ad-title"]',
      'h1',
      '[class*="heading_heading"]',
    ]) || null;

    const Description = getFirstText([
      '[data-testid="description"]',
      '[class*="description_description"]',
      '[class*="description"] [class*="text"]',
    ]) || null;

    return { Title, Description };
  }

  // ---- Address split (Type/Location/City)
  function extractAddressAndSplit() {
    const AddressRaw = getFirstText([
      '[data-testid="address"]',
      '[class*="address_address"]',
      '[class*="address"]',
    ]) || null;

    if (!AddressRaw) return { Type: null, Location: null, City: null };

    const s = AddressRaw.trim();
    const firstComma = s.indexOf(",");
    const lastComma = s.lastIndexOf(",");

    if (firstComma === -1) return { Type: s || null, Location: null, City: null };
    if (firstComma === lastComma) {
      return {
        Type: s.slice(0, firstComma).trim() || null,
        Location: null,
        City: s.slice(firstComma + 1).trim() || null,
      };
    }

    return {
      Type: s.slice(0, firstComma).trim() || null,
      Location: s.slice(firstComma + 1, lastComma).trim() || null,
      City: s.slice(lastComma + 1).trim() || null,
    };
  }

  // ---- Building details tiles (Rooms/Floor/Area/Floors ONLY from X/Y)
  function extractBuildingDetailsFromDOM() {
    let Rooms = null, Floor = null, Floors = null, Area = null;

    const root =
      document.querySelector('[data-testid="building-details"]') ||
      document.querySelector('[class*="buildingDetailsBox"]') ||
      document;

    // each tile: span.property-detail_details__iHCfm
    const tiles = Array.from(root.querySelectorAll('span.property-detail_details__iHCfm'));

    for (const t of tiles) {
      const value = (t.querySelector('[data-testid="building-text"]')?.innerText || t.querySelector('[data-testid="building-text"]')?.textContent || "").trim();
      const label = (t.querySelector('[class*="property-detail_itemValue"]')?.innerText || t.querySelector('[class*="property-detail_itemValue"]')?.textContent || "").trim();

      if (!label && !value) continue;

      if (label.includes("חדרים")) {
        const n = Number(value.replace(",", "."));
        if (!Number.isNaN(n)) Rooms = n;
      }

      if (label.includes('מ"ר') || label.includes('מ״ר')) {
        const n = Number(digits(value));
        if (!Number.isNaN(n)) Area = n;
      }

      // floor tile variants
      const floorText = `${value} ${label}`.trim();

      if (floorText.includes("קרקע")) {
        Floor = 0;
      } else {
        const m = floorText.match(/(\d+)\s*\/\s*(\d+)/);
        if (m) { Floor = Number(m[1]); Floors = Number(m[2]); }
        else {
          // plain floor number: set Floor only
          const m2 = floorText.match(/\bקומה\b.*?(\d{1,2})\b/);
          if (m2) Floor = Number(m2[1]);
        }
      }
    }

    return { Rooms, Floor, Floors, Area };
  }

  // ---- Additional details (BuiltArea + Floors fallback)
  function extractAdditionalDetailsKeyValue() {
    const labels = Array.from(document.querySelectorAll('[class*="item-detail_label"]'));
    const values = Array.from(document.querySelectorAll('[class*="item-detail_value"]'));

    const map = {};
    for (let i = 0; i < Math.min(labels.length, values.length); i++) {
      const k = (labels[i].innerText || labels[i].textContent || "").trim();
      const v = (values[i].innerText || values[i].textContent || "").trim();
      if (k) map[k] = v;
    }

    const BuiltArea = (() => {
      const raw = map['מ"ר בנוי'] || map['מ״ר בנוי'] || "";
      const n = Number(digits(raw));
      return Number.isFinite(n) ? n : null;
    })();

    const Floors = (() => {
      const raw = map["קומות בבניין"] || "";
      const n = Number(digits(raw));
      return (Number.isFinite(n) && n >= 1 && n <= 200) ? n : null;
    })();

    return { BuiltArea, Floors };
  }

  // ---- Images (robust; many variants)
  function extractImagesFromDOM() {
    const toAbsHttps = (u) => {
      if (!u) return "";
      u = u.trim();
      if (!u || u.startsWith("blob:") || u.startsWith("data:")) return "";
      if (u.startsWith("//")) return "https:" + u;
      if (u.startsWith("/")) return location.origin + u;
      return u;
    };

    const fromSrcset = (srcset) => {
      if (!srcset) return "";
      const parts = srcset.split(",").map(s => s.trim()).filter(Boolean);
      const last = parts[parts.length - 1] || "";
      return last.split(" ")[0] || "";
    };

    const addC6 = (u) => {
      if (!u) return "";
      if (u.includes("c=6")) return u;
      return u.includes("?") ? (u + "&c=6") : (u + "?c=6");
    };

    const gallery =
      document.querySelector('.ad-item-page-layout_galleryBox__4sXPG') ||
      document.querySelector('[class*="galleryBox"]') ||
      document.querySelector('[data-testid="gallery"]') ||
      document.querySelector('[data-testid="ad-gallery"]') ||
      null;

    const root = gallery || document;

    const nodes = Array.from(root.querySelectorAll('[data-testid="image"], [data-testid="image"] img, img'));
    const urls = [];

    for (const n of nodes) {
      const img = (n.tagName?.toLowerCase() === "img") ? n : n.querySelector?.("img");

      if (img) {
        const u1 = img.currentSrc || img.src || "";
        const u2 = img.getAttribute("data-src") || img.getAttribute("data-original") || "";
        const u3 = fromSrcset(img.getAttribute("srcset") || img.srcset || "");
        [u1, u2, u3].forEach(u => { const abs = toAbsHttps(u); if (abs) urls.push(abs); });
      }

      const a1 = n.getAttribute?.("src") || "";
      const a2 = n.getAttribute?.("data-src") || "";
      const a3 = n.getAttribute?.("data-image") || "";
      [a1, a2, a3].forEach(u => { const abs = toAbsHttps(u); if (abs) urls.push(abs); });

      const bg = (n.style && n.style.backgroundImage) ? n.style.backgroundImage : "";
      const m = bg.match(/url\(["']?(.*?)["']?\)/);
      if (m && m[1]) { const abs = toAbsHttps(m[1]); if (abs) urls.push(abs); }
    }

    let uniqClean = uniq(urls);

    if (!uniqClean.length) {
      const fallback = Array.from(document.querySelectorAll('[data-testid="image"], [data-testid="image"] img'))
        .map(el => {
          const img = el.tagName?.toLowerCase() === "img" ? el : el.querySelector?.("img");
          if (!img) return "";
          return toAbsHttps(img.currentSrc || img.src || fromSrcset(img.getAttribute("srcset") || img.srcset || ""));
        })
        .filter(Boolean);
      uniqClean = uniq(fallback);
    }

    const withC6 = uniqClean.map(addC6);

    return {
      Images_URLs: withC6.length ? withC6.join("\n") : null,
      Image_URL_First: uniqClean[0] || null,
      imgCount: uniqClean.length
    };
  }

  // ---- Combined extract (wait a bit for SPA/lazy)
  async function extractAll() {
    for (let i = 0; i < 30; i++) {
      const ready =
        document.querySelector('span.property-detail_details__iHCfm') ||
        document.querySelector('[class*="item-detail_label"]') ||
        document.querySelector('[data-testid="agency-details"]') ||
        document.querySelector('h1');
      if (ready) break;
      await sleep(200);
    }

    const contact = extractBrokerAgencyFromDOM();
    const bd = extractBuildingDetailsFromDOM();
    const extra = extractAdditionalDetailsKeyValue();
    const imgs = extractImagesFromDOM();
    const td = extractTitleAndDescription();
    const addr = extractAddressAndSplit();

    const floorsCandidate = pick(bd.Floors, extra.Floors);
    const Floors = (typeof floorsCandidate === "number" && floorsCandidate >= 1 && floorsCandidate <= 200)
      ? floorsCandidate
      : null;

    return {
      URL: location.href,
      CreatedDate: extractCreatedDateFromDOM() ?? null,
      Price: extractPriceFallback() ?? null,

      Rooms: bd.Rooms ?? null,
      Floor: bd.Floor ?? null,
      Area: bd.Area ?? null,

      Floors,
      BuiltArea: extra.BuiltArea ?? null,

      Title: td.Title ?? null,
      Description: td.Description ?? null,

      Type: addr.Type ?? null,
      Location: addr.Location ?? null,
      City: addr.City ?? null,

      Agency: contact.Agency ?? null,
      BrokerName: contact.BrokerName ?? null,
      BrokerPhone: contact.BrokerPhone ?? null,

      Images_URLs: imgs.Images_URLs ?? null,
      Image_URL_First: imgs.Image_URL_First ?? null,
      imgCount: imgs.imgCount ?? 0,
    };
  }

  // ---- Upsert
  async function upsertToMemento(v) {
    if (!TOKEN || TOKEN.includes("PASTE")) throw new Error("Set TOKEN at top of script.");

    const fields = [];
    const add = (id, val) => {
      if (val === null || val === undefined) return;
      if (typeof val === "string" && !val.trim()) return;
      fields.push({ id, value: val });
    };

    add(FID.URL, v.URL);
    add(FID.CreatedDate, v.CreatedDate);
    add(FID.Images_URLs, v.Images_URLs);
    add(FID.Image_URL_First, v.Image_URL_First);

    add(FID.Price, v.Price);
    add(FID.Rooms, v.Rooms);
    add(FID.Floor, v.Floor);
    add(FID.Area, v.Area);

    add(FID.Agency, v.Agency);
    add(FID.BrokerName, v.BrokerName);
    add(FID.BrokerPhone, v.BrokerPhone);

    add(FID.Title, v.Title);
    add(FID.Description, v.Description);
    add(FID.Type, v.Type);
    add(FID.Location, v.Location);
    add(FID.City, v.City);
    add(FID.BuiltArea, v.BuiltArea);
    add(FID.Floors, v.Floors);

    const listUrl = `${API_BASE}/libraries/${encodeURIComponent(LIBRARY_ID)}/entries?token=${encodeURIComponent(TOKEN)}&pageSize=1000`;
    const list = await jfetch(listUrl, { method: "GET" });

    let existingId = null;
    for (const e of (list.entries || [])) {
      const f = (e.fields || []).find(x => x.id === FID.URL);
      if ((f?.value || "").toString().trim() === v.URL) { existingId = e.id; break; }
    }

    const body = JSON.stringify({ fields });

    if (existingId) {
      const putUrl = `${API_BASE}/libraries/${encodeURIComponent(LIBRARY_ID)}/entries/${encodeURIComponent(existingId)}?token=${encodeURIComponent(TOKEN)}`;
      await jfetch(putUrl, { method: "PUT", body });
      alert(`✅ Updated | Price:${v.Price ?? "-"} Rooms:${v.Rooms ?? "-"} Floor:${v.Floor ?? "-"} Area:${v.Area ?? "-"} Built:${v.BuiltArea ?? "-"} Floors:${v.Floors ?? "-"} | Images:${v.imgCount}`);
    } else {
      const postUrl = `${API_BASE}/libraries/${encodeURIComponent(LIBRARY_ID)}/entries?token=${encodeURIComponent(TOKEN)}`;
      await jfetch(postUrl, { method: "POST", body });
      alert(`✅ Created | Price:${v.Price ?? "-"} Rooms:${v.Rooms ?? "-"} Floor:${v.Floor ?? "-"} Area:${v.Area ?? "-"} Built:${v.BuiltArea ?? "-"} Floors:${v.Floors ?? "-"} | Images:${v.imgCount}`);
    }

    // Copy first image URL for manual Image “Insert from URL”
    if (v.Image_URL_First) {
      try { await navigator.clipboard.writeText(v.Image_URL_First); } catch {}
    }
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      const v = await extractAll();
      await upsertToMemento(v);
    } catch (e) {
      alert("❌ " + (e?.message || e));
    } finally {
      btn.disabled = false;
      btn.textContent = "Save to Memento";
    }
  });
})();
