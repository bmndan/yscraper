// ==UserScript==
// @name         Yad2 -> Memento (v3.3 stable)
// @namespace    berman
// @version      3.3
// @match        https://www.yad2.co.il/realestate/item/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(() => {

  const TOKEN = "PASTE_YOUR_TOKEN_HERE";
  const LIBRARY_ID = "jRdNE9YJP";
  const API_BASE = "https://api.mementodatabase.com/v1";

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

    Name: 14,
    Phone: 15,
    Type: 16,
    Floors: 17,
    City: 18,
    Location: 19,
    Title: 20,
    Description: 21,
    BuiltArea: 24,

    Name2: 27,
    Phone2: 28
  };

  GM_addStyle(`
    #mementoSaveBtn{
      position:fixed; right:16px; bottom:16px; z-index:999999;
      padding:10px 12px; border-radius:10px;
      border:1px solid #222; background:#fff;
      font:14px sans-serif; cursor:pointer;
    }
  `);

  const btn = document.createElement("button");
  btn.id = "mementoSaveBtn";
  btn.textContent = "Save to Memento";
  document.body.appendChild(btn);

  const digits = s => (s || "").toString().replace(/[^\d]/g, "");
  const asNum = x => {
    const d = digits(x);
    if (!d) return null;
    const n = Number(d);
    return Number.isFinite(n) ? n : null;
  };

  function extractRoomsFloorArea() {
    const container =
      document.querySelector('[data-testid="building-details"]') ||
      document.querySelector('[class*="buildingDetailsBox"]');

    if (!container) return {};

    let Rooms = null, Floor = null, Floors = null, Area = null;

    const items = Array.from(
      container.querySelectorAll("[class*='buildingItemBox']")
    );

    for (const item of items) {
      const left = item.querySelector('[data-testid="building-text"]')?.textContent?.trim() || "";
      const right = item.querySelector("[class*='itemValue']")?.textContent?.trim() || "";
      const combined = left + " " + right;

      if (right.includes("חדרים")) Rooms = asNum(left);
      if (right.includes('מ"ר') || right.includes("מ״ר")) Area = asNum(left);

      if (combined.includes("קרקע")) Floor = 0;

      const m = combined.match(/(\d+)\s*\/\s*(\d+)/);
      if (m) {
        Floor = Number(m[1]);
        Floors = Number(m[2]);
      }
    }

    return { Rooms, Floor, Floors, Area };
  }

  function extractContacts() {
    const cleanPhone = s => (s || "").replace(/[^\d]/g, "") || null;
    const txt = el => el?.textContent?.trim() || null;

    const agencySpan = document.querySelector('[data-testid="agency-details"] .agency-details_mediatingAgency__w108Y');
    let agency = agencySpan?.textContent?.trim() || null;
    if (agency) agency = agency.replace(/^תיווך:\s*/, "").trim();

    const contacts = [];

    const brokerSection =
      document.querySelector(".forsale-agency-contact-section_agencyAdContactsBox");

    if (brokerSection) {
      const boxes = brokerSection.querySelectorAll("[class*='agency-ad-contact-info']");
      boxes.forEach(box => {
        const name = txt(box.querySelector("[class*='agency-ad-contact-info_name']"));
        const phone = cleanPhone(txt(box.querySelector("[class*='phone-number-link']")));
        if (name || phone) contacts.push({ name, phone });
      });
    } else {
      const ownerSection =
        document.querySelector(".forsale-contact-section_adContactsBox");
      if (ownerSection) {
        const boxes = ownerSection.querySelectorAll("[class*='adContactInfoBox']");
        boxes.forEach(box => {
          const name = txt(box.querySelector("[class*='ad-contact-info_name']"));
          const phone = cleanPhone(txt(box.querySelector("[class*='ad-contact-info_phoneNumber']")));
          if (name || phone) contacts.push({ name, phone });
        });
      }
    }

    return {
      Agency: agency,
      Name: contacts[0]?.name || null,
      Phone: contacts[0]?.phone || null,
      Name2: contacts[1]?.name || null,
      Phone2: contacts[1]?.phone || null
    };
  }

  function extractCreatedDate() {
    const el = document.querySelector('[class*="report-ad_createdAt__"]');
    if (!el) return null;
    const txt = el.textContent;
    const m = txt.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  }

  async function save() {

    const r = extractRoomsFloorArea();
    const c = extractContacts();

    const entry = {
      URL: location.href,
      CreatedDate: extractCreatedDate(),
      Price: asNum(document.body.innerText.match(/₪\s*[\d,]+/)?.[0]),
      Rooms: r.Rooms,
      Floor: r.Floor,
      Floors: r.Floors,
      Area: r.Area,
      Title: document.querySelector("h1")?.innerText || null,
      Description: document.querySelector("[class*='description']")?.innerText || null,
      Agency: c.Agency,
      Name: c.Name,
      Phone: c.Phone,
      Name2: c.Name2,
      Phone2: c.Phone2
    };

    const fields = [];
    Object.entries(entry).forEach(([key, val]) => {
      const id = FID[key];
      if (id != null && val != null && val !== "") {
        fields.push({ id, value: val });
      }
    });

    await fetch(`${API_BASE}/libraries/${LIBRARY_ID}/entries?token=${TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields })
    });

    alert("Saved");
  }

  btn.addEventListener("click", save);

})();
