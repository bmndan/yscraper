// ==UserScript==
// @name         Yad2 -> Memento (v4.0 Android-safe)
// @namespace    berman
// @version      4.0.3
// @match        *://*.yad2.co.il/realestate/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  try {
    // ===== TOKEN (prompt once, saved per-script) =====
    var TOKEN = GM_getValue("memento_token", "");
    if (!TOKEN) {
      TOKEN = prompt("Enter Memento API Token (saved for this script):");
      if (!TOKEN) {
        alert("❌ No token provided.");
        return;
      }
      GM_setValue("memento_token", TOKEN);
      alert("✅ Token saved.");
    }

    // ===== CONFIG =====
    var LIBRARY_ID = "jRdNE9YJP"; // <-- change ONLY if your library ID is different
    var API_BASE = "https://api.mementodatabase.com/v1";
    var DEBUG = false;

    // ===== FIELD IDs =====
    var FID = {
      URL: 0,
      CreatedDate: 1,