// ==UserScript==
// @name         Yad2 -> Memento (v2.9: strict tiles + strict created date + scoped multi-contacts + ContactsRaw)
// @namespace    berman
// @version      2.9
// @match        https://www.yad2.co.il/realestate/item/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  // ======= CONFIG =======
  const TOKEN = "PASTE_YOUR_TOKEN_HERE";
  const LIBRARY_ID = "jRdNE9YJP";
  const API_BASE = "https://api.mementodatabase.com/v1";
  const DEBUG = false;

  // ======= FIELD IDs =======
  // Keep your confirmed IDs as-is. Fill the NEW ones once you create them.
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
    BuiltArea: 24,

    // NEW (set these IDs)
    BrokerName2: null,
    BrokerPhone2: null,
    OwnerName: null,
    OwnerPhone: null,
    OwnerName2: null,
    OwnerPhone2: null,
    ContactsRaw: null, // TEXT
  };

  // ======= UI =======
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

  // ======= helpers =======
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
  const digits = (s) => (s || "").toString().replace(/[^\d]/g, "");

  const asNum = (x) => {
    if (x === 0) return 0;
    const d = digits(x);
    if (!d) return null;
    const n = Number(d);
    return Number.isFinite(n) ? n : null;
  };

  function keepIf(n, pred) {
    return typeof n === "number" && Number.isFinite(n) && pred(n) ? n : null;
  }

  function normalizeNumerics({ Rooms, Floor, Area, BuiltArea, Floors }) {
    return {
      Rooms: keepIf(Rooms, (n) => n >= 1 && n <= 50),
      Area: keepIf(Area, (n) => n >= 5 && n <= 5000),
      BuiltArea: keepIf(BuiltArea, (n) => n >= 5 && n <= 20000),
      Floors: keepIf(Floors, (n) => n >= 1 && n <= 200),
      Floor: keepIf(Floor, (n) => n >= 0 && n <= 200),
    };
  }

  async function jfetch(url, opts) {
    const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json" } });
    const t = await res.text();
    let data;
    try {
      data = t ? JSON.parse(t) : {};
    } catch {
      throw new Error("Non-JSON response: " + t.slice(0, 220));
    }
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

  // ======= CreatedDate (STRICT: report/meta only) =======
  function extractCreatedDateStrict() {
    const clean = (s) =>
      (s || "")
        .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00ad\ufeff]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const parseDMY = (txt) => {
      const m = clean(txt).match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
      if (!m) return null;
      return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
    };

    // 1) report-ad_createdAt__*
    const els = Array.from(document.querySelectorAll('[class*="report-ad_createdAt__"]'));
    for (const el of els) {
      const ms = parseDMY(el.textContent || "");
      if (ms) return ms;
    }

    // 2) fallback within report/meta container only
    const scope =
      document.querySelector('[class*="report-ad_"]') ||
      document.querySelector('[data-testid*="report"]') ||
      null;

    if (scope) {
      const cand = Array.from(scope.querySelectorAll("div,span,p")).filter((el) =>
        (el.textContent || "").includes("פורסם")
      );
      for (const el of cand) {
        const ms = parseDMY(el.textContent || "");
        if (ms) return ms;
      }
    }

    return null;
  }

  // ======= Rooms/Floor/Area (STRICT: building tiles only) =======
  function extractRoomsFloorAreaFromTilesStrict() {
    const container =
      document.querySelector('[data-testid="building-details"]') ||
      document.querySelector('[class*="buildingDetailsBox"]');

    if (!container) return { Rooms: null, Floor: null, FloorsFromSlash: null, Area: null };

    let Rooms = null,
      Floor = null,
      FloorsFromSlash = null,
      Area = null;

    const blocks = Array.from(
      container.querySelectorAll(".property-detail_details__iHCfm, [class*='property-detail_details']")
    );

    for (const b of blocks) {
      const left = (b.querySelector('[data-testid="building-text"]')?.textContent || "").trim();
      const right = (
        b.querySelector("[class*='itemValue'], .property-detail_itemValue__V0z6l")?.textContent || ""
      ).trim();

      if (!left && !right) continue;

      if (right.includes("חדרים")) {
        Rooms = asNum(left);
        continue;
      }

      if (right.includes('מ"ר') || right.includes("מ״ר")) {
        Area = asNum(left);
        continue;
      }

      if (left.includes("קומה")) {
        if (right.includes("קרקע")) {
          Floor = 0;
          continue;
        }
        const m = right.match(/(\d+)\s*\/\s*(\d+)/);
        if (m) {
          Floor = Number(m[1]);
          FloorsFromSlash = Number(m[2]);
        } else {
          Floor = asNum(right);
        }
        continue;
      }

      if (left.includes("קרקע") || right.includes("קרקע")) {
        Floor = 0;
        continue;
      }
    }

    return { Rooms, Floor, FloorsFromSlash, Area };
  }

  // ======= Additional details map =======
  function extractAdditionalDetailsMap() {
    const labels = Array.from(document.querySelectorAll('[class*="item-detail_label"]'));
    const values = Array.from(document.querySelectorAll('[class*="item-detail_value"]'));
    const map = {};
    for (let i = 0; i < Math.min(labels.length, values.length); i++) {
      const k = (labels[i].innerText || labels[i].textContent || "").trim();
      const v = (values[i].innerText || values[i].textContent || "").trim();
      if (k) map[k] = v;
    }
    return map;
  }

  // ======= Title/Description =======
  function extractTitleAndDescription() {
    const Title = getFirstText(["[data-testid='ad-title']", "h1", "[class*='heading_heading']"]) || null;
    const Description =
      getFirstText(["[data-testid='description']", "[class*='description_description']"]) || null;
    return { Title, Description };
  }

  // ======= Address split =======
  function extractAddressSplit() {
    const AddressRaw =
      getFirstText(["[data-testid='address']", "[class*='address_address']", "[class*='address']"]) || null;
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

  // ======= Price (₪ distinct; safe) =======
  function extractPriceFallback() {
    const t = norm(document.body?.innerText || "");
    const matches = Array.from(t.matchAll(/₪\s*([\d,]{4,})/g))
      .map((x) => Number(digits(x[1])))
      .filter((n) => Number.isFinite(n) && n > 0);
    return matches.length ? Math.max(...matches) : null;
  }

  // ======= Images =======
  function extractImages() {
    const uniqArr = (arr) => Array.from(new Set(arr));
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
      const parts = srcset.split(",").map((s) => s.trim()).filter(Boolean);
      const last = parts[parts.length - 1] || "";
      return last.split(" ")[0] || "";
    };
    const addC6 = (u) => (u.includes("c=6") ? u : (u.includes("?") ? u + "&c=6" : u + "?c=6"));

    const gallery =
      document.querySelector(".ad-item-page-layout_galleryBox__4sXPG") ||
      document.querySelector("[class*='galleryBox']") ||
      null;

    const root = gallery || document;
    const nodes = Array.from(
      root.querySelectorAll('[data-testid="image"], [data-testid="image"] img, picture img, img, source')
    );

    const urls = [];
    for (const n of nodes) {
      if (n.tagName?.toLowerCase() === "img") {
        const u1 = n.currentSrc || n.src || "";
        const u2 = n.getAttribute("data-src") || "";
        const u3 = fromSrcset(n.getAttribute("srcset") || n.srcset || "");
        [u1, u2, u3].forEach((u) => {
          const abs = toAbsHttps(u);
          if (abs) urls.push(abs);
        });
      }
      if (n.tagName?.toLowerCase() === "source") {
        const u = fromSrcset(n.getAttribute("srcset") || "");
        const abs = toAbsHttps(u);
        if (abs) urls.push(abs);
      }
    }

    const u = uniqArr(urls).map(addC6);
    return {
      Images_URLs: u.length ? u.join("\n") : null,
      Image_URL_First: u[0] || null,
      imgCount: u.length,
    };
  }

  // ======= Contacts (SCOPED by your containers; up to 2+2 + raw) =======
  function extractContacts() {
    const cleanPhone = (s) => (s || "").toString().replace(/[^\d]/g, "") || null;
    const txt = (el) => (el?.textContent || "").trim() || null;

    // Agency name (single)
    const agencySpan = document.querySelector('[data-testid="agency-details"] .agency-details_mediatingAgency__w108Y');
    let agencyLine = (agencySpan?.textContent || "").trim();
    if (!agencyLine) {
      const block = document.querySelector('[data-testid="agency-details"]')?.textContent || "";
      agencyLine = block.split("\n").map((x) => x.trim()).find((x) => x.startsWith("תיווך:")) || "";
    }
    const Agency = agencyLine ? agencyLine.replace(/^תיווך:\s*/, "").trim() || null : null;

    // Brokers (agent listings): .forsale-agency-contact-section_agencyAdContactsBox -> .agency-ad-contact-info
    const brokers = [];
    const brokerSection = document.querySelector(".forsale-agency-contact-section_agencyAdContactsBox");
    const brokerBoxes = brokerSection ? Array.from(brokerSection.querySelectorAll(".agency-ad-contact-info")) : [];
    for (const box of brokerBoxes) {
      const name = txt(box.querySelector(".agency-ad-contact-info_name"));
      const phone = cleanPhone(txt(box.querySelector(".phone-number-link")));
      if (name || phone) brokers.push({ name, phone });
      if (brokers.length >= 2) break;
    }

    // Owners (owner listings): .forsale-contact-section_adContactsBox -> .ad-contacts_adContactInfoBox
    const owners = [];
    const ownerSection = document.querySelector(".forsale-contact-section_adContactsBox");
    const ownerBoxes = ownerSection ? Array.from(ownerSection.querySelectorAll(".ad-contacts_adContactInfoBox")) : [];
    for (const box of ownerBoxes) {
      const name = txt(box.querySelector(".ad-contact-info_name"));
      const phone = cleanPhone(txt(box.querySelector(".ad-contact-info_phoneNumber")));
      if (name || phone) owners.push({ name, phone });
      if (owners.length >= 2) break;
    }

    // Raw (safety net)
    const lines = [];
    if (Agency) lines.push(`agency|${Agency}`);
    brokers.forEach((c, i) => lines.push(`broker${i + 1}|${c.name || ""}|${c.phone || ""}`));
    owners.forEach((c, i) => lines.push(`owner${i + 1}|${c.name || ""}|${c.phone || ""}`));
    const ContactsRaw = lines.length ? lines.join("\n") : null;

    return {
      Agency,

      BrokerName: brokers[0]?.name || null,
      BrokerPhone: brokers[0]?.phone || null,
      BrokerName2: brokers[1]?.name || null,
      BrokerPhone2: brokers[1]?.phone || null,

      OwnerName: owners[0]?.name || null,
      OwnerPhone: owners[0]?.phone || null,
      OwnerName2: owners[1]?.name || null,
      OwnerPhone2: owners[1]?.phone || null,

      ContactsRaw,
    };
  }

  // ======= Combined extraction =======
  async function extractAll() {
    // wait for tiles; created date may render late
    for (let i = 0; i < 120; i++) {
      const hasTiles = !!(
        document.querySelector('[data-testid="building-details"]') || document.querySelector("[class*='buildingDetailsBox']")
      );
      if (hasTiles) break;
      await sleep(150);
    }

    const map = extractAdditionalDetailsMap();
    const FloorsFromMap = asNum(map["קומות בבניין"]);
    const BuiltAreaFromMap = asNum(map['מ"ר בנוי'] || map['מ״ר בנוי']);

    let Floors = keepIf(FloorsFromMap, (n) => n >= 1 && n <= 200);
    let BuiltArea = keepIf(BuiltAreaFromMap, (n) => n >= 5 && n <= 20000);

    const tile = extractRoomsFloorAreaFromTilesStrict();
    if (!Floors && tile.FloorsFromSlash) Floors = tile.FloorsFromSlash;

    let Rooms = tile.Rooms;
    let Floor = tile.Floor;
    let Area = tile.Area;

    const clean = normalizeNumerics({
      Rooms: Rooms === null ? null : Number(Rooms),
      Floor: Floor === null ? null : Number(Floor),
      Area: Area === null ? null : Number(Area),
      BuiltArea,
      Floors,
    });

    Rooms = clean.Rooms;
    Floor = clean.Floor;
    Area = clean.Area;
    BuiltArea = clean.BuiltArea;
    Floors = clean.Floors;

    const td = extractTitleAndDescription();
    const addr = extractAddressSplit();
    const imgs = extractImages();
    const CreatedDate = extractCreatedDateStrict();
    const c = extractContacts();

    if (DEBUG) {
      console.log("tiles:", tile);
      console.log("CreatedDate(ms):", CreatedDate);
      console.log("contacts:", c);
    }

    return {
      URL: location.href,
      CreatedDate: CreatedDate ?? null,
      Price: extractPriceFallback() ?? null,

      Rooms,
      Floor,
      Area,

      Floors,
      BuiltArea,

      Title: td.Title ?? null,
      Description: td.Description ?? null,

      Type: addr.Type ?? null,
      Location: addr.Location ?? null,
      City: addr.City ?? null,

      Images_URLs: imgs.Images_URLs ?? null,
      Image_URL_First: imgs.Image_URL_First ?? null,
      imgCount: imgs.imgCount ?? 0,

      ...c,
    };
  }

  // ======= Upsert to Memento =======
  async function upsertToMemento(v) {
    if (!TOKEN || TOKEN.includes("PASTE")) throw new Error("Set TOKEN at top of script.");

    const fields = [];
    const add = (id, val) => {
      if (id === null || id === undefined) return; // allows leaving NEW IDs as null
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

    add(FID.Title, v.Title);
    add(FID.Description, v.Description);

    add(FID.Type, v.Type);
    add(FID.Location, v.Location);
    add(FID.City, v.City);

    add(FID.BuiltArea, v.BuiltArea);
    add(FID.Floors, v.Floors);

    // Contacts
    add(FID.Agency, v.Agency);
    add(FID.BrokerName, v.BrokerName);
    add(FID.BrokerPhone, v.BrokerPhone);
    add(FID.BrokerName2, v.BrokerName2);
    add(FID.BrokerPhone2, v.BrokerPhone2);
    add(FID.OwnerName, v.OwnerName);
    add(FID.OwnerPhone, v.OwnerPhone);
    add(FID.OwnerName2, v.OwnerName2);
    add(FID.OwnerPhone2, v.OwnerPhone2);
    add(FID.ContactsRaw, v.ContactsRaw);

    // Duplicate check by URL (fine for 1–2/day)
    const listUrl = `${API_BASE}/libraries/${encodeURIComponent(LIBRARY_ID)}/entries?token=${encodeURIComponent(
      TOKEN
    )}&pageSize=1000`;
    const list = await jfetch(listUrl, { method: "GET" });

    let existingId = null;
    for (const e of list.entries || []) {
      const f = (e.fields || []).find((x) => x.id === FID.URL);
      if ((f?.value || "").toString().trim() === v.URL) {
        existingId = e.id;
        break;
      }
    }

    const body = JSON.stringify({ fields });

    if (existingId) {
      const putUrl = `${API_BASE}/libraries/${encodeURIComponent(LIBRARY_ID)}/entries/${encodeURIComponent(
        existingId
      )}?token=${encodeURIComponent(TOKEN)}`;
      await jfetch(putUrl, { method: "PUT", body });
      alert(
        `✅ Updated | Date:${v.CreatedDate ? "OK" : "-"} | Rooms:${v.Rooms ?? "-"} Floor:${v.Floor ?? "-"} Area:${
          v.Area ?? "-"
        } | Built:${v.BuiltArea ?? "-"} Floors:${v.Floors ?? "-"} | Images:${v.imgCount ?? 0}`
      );
    } else {
      const postUrl = `${API_BASE}/libraries/${encodeURIComponent(LIBRARY_ID)}/entries?token=${encodeURIComponent(TOKEN)}`;
      await jfetch(postUrl, { method: "POST", body });
      alert(
        `✅ Created | Date:${v.CreatedDate ? "OK" : "-"} | Rooms:${v.Rooms ?? "-"} Floor:${v.Floor ?? "-"} Area:${
          v.Area ?? "-"
        } | Built:${v.BuiltArea ?? "-"} Floors:${v.Floors ?? "-"} | Images:${v.imgCount ?? 0}`
      );
    }
  }

  // ======= Button handler =======
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      const v = await extractAll();
      await upsertToMemento(v);
    } catch (e) {
      alert("❌ " + (e?.message || e));
      if (DEBUG) console.error(e);
    } finally {
      btn.disabled = false;
      btn.textContent = "Save to Memento";
    }
  });
})();
