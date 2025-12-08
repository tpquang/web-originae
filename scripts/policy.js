// Simple tab switcher for policy page
(function(){
  function qs(sel, ctx){ return (ctx||document).querySelector(sel); }
  function qsa(sel, ctx){ return Array.from((ctx||document).querySelectorAll(sel)); }

  function showTab(id){
    // hide all sections under policy-content
    const sections = qsa('.policy-content > section');
    sections.forEach(s => {
      if(s.id === id) s.classList.remove('policy-hidden'); else s.classList.add('policy-hidden');
    });
    // update active button
    qsa('.policy-tab').forEach(b => {
      if(b.dataset.target === id) b.classList.add('policy-active'); else b.classList.remove('policy-active');
    });
    // update hash without scrolling
    try{ history.replaceState(null, '', '#'+id); }catch(e){}
  }

  document.addEventListener('DOMContentLoaded', function(){
    const tabs = qsa('.policy-tab');
    if(!tabs.length) return;
    tabs.forEach(btn => {
      btn.addEventListener('click', function(e){
        const t = this.dataset.target;
        if(t) showTab(t);
      });
    });

    // initialize: if hash present and matches, open it; otherwise open 'terms'
    const hash = (location.hash||'').replace('#','');
    const available = tabs.map(t=>t.dataset.target);
    const initial = available.includes(hash) ? hash : 'terms';
    showTab(initial);
  });
})();
