// ==UserScript==
// @name         Y2 -> Memento
// @namespace    bmndan
// @version      1.3
// @match        *://*.yad2.co.il/realestate/item/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @downloadURL  https://raw.githubusercontent.com/bmndan/yscraper/main/y2-memento.user.js
// @updateURL    https://raw.githubusercontent.com/bmndan/yscraper/main/y2-memento.user.js
// ==/UserScript==

(function () {
  'use strict';

  const TOKEN_URL = 'https://raw.githubusercontent.com/bmndan/yscraper/main/token.txt';
  const LIBRARY_ID = 'jRdNE9YJP';
  const API = `https://api.mementodatabase.com/v1/libraries/${LIBRARY_ID}/entries`;

  // Current field IDs based on the mapping used earlier.
  const FIELD_IDS = {
    url: 0,
    title: 1,
    address: 7,
    city: 8,
    price: 9,
    rooms: 10,
    floor: 11,
    area: 12,
    agency: 13,
    contact1Name: 14,
    contact1Phone: 15,
    contact2Name: 16,
    contact2Phone: 17,
    image1: null,
    remark: null
  };

  function clean(s) {
    return String(s || '')
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00ad\ufeff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function digitsOnly(s) {
    return String(s || '').replace(/\D+/g, '');
  }

  function normalizePhone(phone) {
    const d = digitsOnly(phone);
    if (!d) return '';
    if (d.startsWith('972') && d.length >= 11) return '0' + d.slice(3);
    return d;
  }

  function pushField(fields, id, value) {
    if (id == null) return;
    if (value == null) return;
    const v = clean(value);
    if (!v) return;
    fields.push({ id, value: v });
  }

  function getToken() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: TOKEN_URL,
        onload: r => {
          if (r.status === 200) {
            const token = clean(r.responseText);
            if (!token) reject(new Error('token.txt is empty'));
            else resolve(token);
          } else {
            reject(new Error('Token load failed: ' + r.status));
          }
        },
        onerror: () => reject(new Error('Token request failed'))
      });
    });
  }

  function getJsonScripts() {
    const out = [];
    for (const el of document.querySelectorAll('script[type="application/ld+json"], script#__NEXT_DATA__')) {
      const txt = el.textContent;
      if (!txt) continue;
      try {
        out.push(JSON.parse(txt));
      } catch (_) {}
    }
    return out;
  }

  function deepFindFirst(obj, keys) {
    const seen = new WeakSet();

    function walk(x) {
      if (!x || typeof x !== 'object') return null;
      if (seen.has(x)) return null;
      seen.add(x);

      for (const k of Object.keys(x)) {
        if (keys.includes(k) && x[k] != null && x[k] !== '') {
          return x[k];
        }
      }

      for (const k of Object.keys(x)) {
        const v = x[k];
        if (v && typeof v === 'object') {
          const found = walk(v);
          if (found != null) return found;
        }
      }

      return null;
    }

    return walk(obj);
  }

  function deepFindAddressPart(obj, partKey) {
    const seen = new WeakSet();

    function walk(x) {
      if (!x || typeof x !== 'object') return null;
      if (seen.has(x)) return null;
      seen.add(x);

      if (x.address && typeof x.address === 'object' && x.address[partKey]) {
        return x.address[partKey];
      }

      for (const k of Object.keys(x)) {
        const v = x[k];
        if (v && typeof v === 'object') {
          const found = walk(v);
          if (found != null) return found;
        }
      }

      return null;
    }

    return walk(obj);
  }

  function getTitle() {
    const h1 = document.querySelector('h1');
    if (h1) return clean(h1.textContent);

    for (const obj of getJsonScripts()) {
      const v = deepFindFirst(obj, ['name', 'title', 'headline']);
      if (v) return clean(v);
    }

    return '';
  }

  function getPrice() {
    const priceEl = document.querySelector('[class*="price"], [data-testid*="price"]');
    if (priceEl) {
      const txt = clean(priceEl.textContent);
      if (/\d/.test(txt)) return txt;
    }

    const body = clean(document.body ? document.body.innerText : '');
    const m1 = body.match(/₪\s*[\d,\.]+/);
    if (m1) return m1[0];

    const m2 = body.match(/[\d,\.]+\s*₪/);
    if (m2) return m2[0];

    for (const obj of getJsonScripts()) {
      const v = deepFindFirst(obj, ['price']);
      if (v) return clean(v);
    }

    return '';
  }

  function getRooms() {
    const body = clean(document.body ? document.body.innerText : '');

    const m1 = body.match(/(\d+(?:\.\d+)?)\s*(?:חדרים|חד'?|rooms?)/i);
    if (m1) return m1[1];

    for (const obj of getJsonScripts()) {
      const v = deepFindFirst(obj, ['numberOfRooms', 'rooms']);
      if (v) return clean(v);
    }

    return '';
  }

  function getArea() {
    const body = clean(document.body ? document.body.innerText : '');

    const m1 = body.match(/(\d+(?:\.\d+)?)\s*(?:מ"ר|מטר(?:ים)?\s*רבוע(?:ים)?|sqm|sq\.?\s*m)/i);
    if (m1) return m1[1];

    for (const obj of getJsonScripts()) {
      const v = deepFindFirst(obj, ['floorSize', 'area', 'squareMeters', 'squareMeter']);
      if (typeof v === 'object' && v && v.value) return clean(v.value);
      if (v) return clean(v);
    }

    return '';
  }

  function getFloor() {
    const body = clean(document.body ? document.body.innerText : '');

    const m1 = body.match(/קומה\s*[:\-]?\s*([^\n]+)/);
    if (m1) return clean(m1[1]).split(' ')[0];

    const m2 = body.match(/floor\s*[:\-]?\s*([^\n]+)/i);
    if (m2) return clean(m2[1]).split(' ')[0];

    for (const obj of getJsonScripts()) {
      const v = deepFindFirst(obj, ['floorLevel', 'floor']);
      if (v) return clean(v);
    }

    return '';
  }

  function getAddressAndCity() {
    for (const obj of getJsonScripts()) {
      const address = deepFindAddressPart(obj, 'streetAddress');
      const city = deepFindAddressPart(obj, 'addressLocality') || deepFindAddressPart(obj, 'addressRegion');
      if (address || city) {
        return {
          address: clean(address),
          city: clean(city)
        };
      }
    }

    const body = clean(document.body ? document.body.innerText : '');

    const addrMatch = body.match(/כתובת\s*[:\-]?\s*([^\n]+)/);
    const cityMatch = body.match(/(?:עיר|יישוב)\s*[:\-]?\s*([^\n]+)/);

    return {
      address: addrMatch ? clean(addrMatch[1]) : '',
      city: cityMatch ? clean(cityMatch[1]) : ''
    };
  }

  function getImageUrl() {
    const meta = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
    if (meta && meta.content) return clean(meta.content);

    for (const obj of getJsonScripts()) {
      const v = deepFindFirst(obj, ['image', 'images']);
      if (Array.isArray(v) && v.length) return clean(v[0]);
      if (typeof v === 'string') return clean(v);
    }

    return '';
  }

  function getPublishedRaw() {
    const el = document.querySelector('[class*="report-ad_createdAt__"]');
    if (!el) return '';
    return clean(el.textContent);
  }

  function getAgency() {
    const all = Array.from(document.querySelectorAll('body *'))
      .map(el => clean(el.textContent))
      .filter(Boolean);

    for (const txt of all) {
      if (/לאתר המשרד/.test(txt) || /מספר רישיון/.test(txt)) {
        let v = txt
          .replace(/לאתר המשרד/g, ' ')
          .replace(/מספר רישיון[^0-9\n]*\d+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (v && v.length <= 80) return v;
      }
    }

    return '';
  }

  function getContacts() {
    const results = [];
    const seen = new Set();

    const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'));

    for (const a of telLinks) {
      const rawPhone = clean(a.getAttribute('href').replace(/^tel:/i, '') || a.textContent);
      const phone = normalizePhone(rawPhone);
      if (!phone) continue;

      const container =
        a.closest('section, article, div, li') ||
        a.parentElement ||
        document.body;

      const txt = clean(container.textContent);
      let name = '';

      const lines = txt.split(/\s{2,}|\n/).map(clean).filter(Boolean);
      for (const line of lines) {
        if (line === rawPhone || normalizePhone(line) === phone) continue;
        if (/^(התקשרו|חייגו|שלחו|whatsapp|sms)$/i.test(line)) continue;
        if (/^\d+$/.test(line)) continue;
        name = line;
        break;
      }

      const key = `${name}|${phone}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({ name, phone });

      if (results.length >= 2) break;
    }

    return results;
  }

  async function createEntry() {
    const token = await getToken();

    const title = getTitle();
    const price = getPrice();
    const rooms = getRooms();
    const floor = getFloor();
    const area = getArea();
    const agency = getAgency();
    const contacts = getContacts();
    const { address, city } = getAddressAndCity();
    const image1 = getImageUrl();
    const publishedRaw = getPublishedRaw();

    const fields = [];

    pushField(fields, FIELD_IDS.url, location.href.split('?')[0]);
    pushField(fields, FIELD_IDS.title, title);
    pushField(fields, FIELD_IDS.address, address);
    pushField(fields, FIELD_IDS.city, city);
    pushField(fields, FIELD_IDS.price, price);
    pushField(fields, FIELD_IDS.rooms, rooms);
    pushField(fields, FIELD_IDS.floor, floor);
    pushField(fields, FIELD_IDS.area, area);
    pushField(fields, FIELD_IDS.agency, agency);
    pushField(fields, FIELD_IDS.image1, image1);

    if (contacts[0]) {
      pushField(fields, FIELD_IDS.contact1Name, contacts[0].name);
      pushField(fields, FIELD_IDS.contact1Phone, contacts[0].phone);
    }

    if (contacts[1]) {
      pushField(fields, FIELD_IDS.contact2Name, contacts[1].name);
      pushField(fields, FIELD_IDS.contact2Phone, contacts[1].phone);
    }

    if (FIELD_IDS.remark != null && publishedRaw) {
      pushField(fields, FIELD_IDS.remark, `Published: ${publishedRaw}`);
    }

    const payload = { fields };

    const r = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await r.text();
    alert('Status: ' + r.status + '\n\n' + text);
  }

  function addButton() {
    if (document.getElementById('y2-memento-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'y2-memento-btn';
    btn.textContent = 'Create in Memento';
    btn.style = 'position:fixed;top:20px;right:20px;z-index:999999;padding:10px 14px;background:#673ab7;color:#fff;border:none;border-radius:8px;cursor:pointer;';

    btn.onclick = () => {
      createEntry().catch(err => {
        alert(String(err && err.stack ? err.stack : err));
      });
    };

    document.body.appendChild(btn);
  }

  if (document.body) addButton();
  else window.addEventListener('load', addButton);
})();