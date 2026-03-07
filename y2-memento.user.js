// ==UserScript==
// @name         Y2 -> Memento
// @namespace    bmndan
// @version      1.0
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

  const URL_FIELD = 0;
  const PUBLISHED_FIELD = 41;

  function clean(s){
    return String(s||'').replace(/\s+/g,' ').trim();
  }

  function getToken(){
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:'GET',
        url:TOKEN_URL,
        onload:r=>{
          if(r.status===200) resolve(clean(r.responseText));
          else reject('token load failed');
        },
        onerror:()=>reject('token request failed')
      });
    });
  }

  function getDate(){
    const el=document.querySelector('[class*="report-ad_createdAt__"]');
    if(!el) return null;

    const m=clean(el.textContent).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if(!m) return null;

    let y=+m[3];
    if(y<100) y+=2000;

    return Date.UTC(y,+m[2]-1,+m[1]);
  }

  async function create(){
    const token=await getToken();
    const date=getDate();

    if(!date){
      alert('date not found');
      return;
    }

    const payload={
      fields:[
        {id:URL_FIELD,value:location.href.split('?')[0]},
        {id:PUBLISHED_FIELD,value:date}
      ]
    };

    const r=await fetch(API,{
      method:'POST',
      headers:{
        Authorization:`Bearer ${token}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(payload)
    });

    alert('status '+r.status);
  }

  const btn=document.createElement('button');
  btn.textContent='Create in Memento';
  btn.style='position:fixed;top:20px;right:20px;z-index:999999;padding:10px;';
  btn.onclick=create;

  document.body.appendChild(btn);

})();
