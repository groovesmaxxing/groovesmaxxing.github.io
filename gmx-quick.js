/* groovesmaxxing quick search. moved into gmx-nav.js with shell v2 (2026-10-12): the floating search button
   and its sheet are part of the shell now. this file stays so the pages that still load it do not 404, and
   fetches the shell on a page that has nothing else to. */
(function(){
if(window.gmxNav||document.querySelector('script[src^="/gmx-nav.js"]'))return;
var s=document.createElement('script');s.src='/gmx-nav.js?v=18';s.defer=true;document.head.appendChild(s);
})();
