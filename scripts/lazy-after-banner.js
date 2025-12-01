/*
  Improved lazy loader
  - Waits for banner image to load (with timeout) then loads images/backgrounds
  - Supports concurrency (parallel downloads), small delays between batches
  - Skips configured files on mobile (e.g. ./image/image.webp)
  - Falls back to loading remaining assets on first user interaction
*/
(function(){
  const cfg = {
    bannerSelector: '.img-effect-banner',
    bannerTimeout: 5000, // ms
    concurrency: 2,
    delayBetweenBatches: 100, // ms
    mobileBreakpoint: 480, // px (skip image.webp on <=480)
    // files to skip on mobile (substring match)
    mobileSkip: ['/image/image.webp']
  };

  function isMobile(){ return window.innerWidth <= cfg.mobileBreakpoint; }

  function waitForBannerLoaded(timeout = cfg.bannerTimeout){
    const banner = document.querySelector(cfg.bannerSelector);
    return new Promise(resolve=>{
      if(!banner) return resolve();
      if(banner.complete) return resolve();
      let done = false;
      const finish = ()=>{ if(done) return; done = true; resolve(); };
      banner.addEventListener('load', finish, {once:true});
      banner.addEventListener('error', finish, {once:true});
      setTimeout(finish, timeout);
    });
  }

  function preloadImage(url){
    return new Promise(resolve=>{
      const img = new Image();
      img.src = url;
      img.onload = img.onerror = ()=>resolve();
    });
  }

  function createTasks(){
    const imgs = Array.from(document.querySelectorAll('img[data-src], img[data-lazy]'));
    const bgs = Array.from(document.querySelectorAll('[data-bg]'));
    const mobile = isMobile(); // Determine if the device is mobile

    const tasks = [];

    imgs.forEach(img => {
      const src = img.dataset.src || img.dataset.lazy;
      if(!src) return;
      if(mobile && cfg.mobileSkip.some(s => src.includes(s))) return; // skip on mobile
      tasks.push(() => preloadImage(src).then(()=>{
        img.src = src;
        img.removeAttribute('data-src');
        img.removeAttribute('data-lazy');
      }));
    });

    bgs.forEach(el => {
      const src = el.dataset.bg;
      if(!src) return;
      if(mobile && cfg.mobileSkip.some(s => src.includes(s))) return;
      tasks.push(() => preloadImage(src).then(()=>{
        el.style.backgroundImage = `url("${src}")`;
        el.removeAttribute('data-bg');
      }));
    });

    return tasks;
  }

  function runPool(tasks){
    return new Promise(resolve => {
      let inFlight = 0;
      function next(){
        if(tasks.length === 0 && inFlight === 0) return resolve();
        while(inFlight < cfg.concurrency && tasks.length){
          const task = tasks.shift();
          inFlight++;
          task().finally(()=>{
            inFlight--;
            // small delay before scheduling next batch to avoid spikes
            setTimeout(next, cfg.delayBetweenBatches);
          });
        }
      }
      next();
    });
  }

  function onFirstInteraction(loadFn){
    const handler = ()=>{ loadFn();
      window.removeEventListener('scroll', handler);
      window.removeEventListener('touchstart', handler);
      window.removeEventListener('mousemove', handler);
      window.removeEventListener('keydown', handler);
    };
    window.addEventListener('scroll', handler, {passive:true, once:true});
    window.addEventListener('touchstart', handler, {once:true});
    window.addEventListener('mousemove', handler, {once:true});
    window.addEventListener('keydown', handler, {once:true});
  }

  async function init(){
    // Build task list but don't start yet
    const tasks = createTasks();

    // Wait for banner (or timeout) so hero is ready before loading other heavy assets
    await waitForBannerLoaded();

    // If we're on mobile, we prefer IntersectionObserver: only load images when near viewport
    if(isMobile()){
      // Observe img[data-src] and elements with [data-bg]
      const obsOptions = {root: null, rootMargin: '200px', threshold: 0};
      const io = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if(!entry.isIntersecting) return;
          const el = entry.target;
          if(el.tagName === 'IMG'){
            const src = el.dataset.src || el.dataset.lazy;
            if(!src) { observer.unobserve(el); return; }
            if(cfg.mobileSkip.some(s => src.includes(s))){ observer.unobserve(el); return; }
            preloadImage(src).then(()=>{ el.src = src; el.removeAttribute('data-src'); el.removeAttribute('data-lazy'); observer.unobserve(el); });
          } else {
            const src = el.dataset.bg;
            if(!src) { observer.unobserve(el); return; }
            if(cfg.mobileSkip.some(s => src.includes(s))){ observer.unobserve(el); return; }
            preloadImage(src).then(()=>{ el.style.backgroundImage = `url("${src}")`; el.removeAttribute('data-bg'); observer.unobserve(el); });
          }
        });
      }, obsOptions);

      const imgsToObserve = Array.from(document.querySelectorAll('img[data-src], img[data-lazy]'));
      imgsToObserve.forEach(img => {
        const src = img.dataset.src || img.dataset.lazy || '';
        if(cfg.mobileSkip.some(s => src.includes(s))) return; // don't observe skipped files
        io.observe(img);
      });

      const bgsToObserve = Array.from(document.querySelectorAll('[data-bg]'));
      bgsToObserve.forEach(el => {
        const src = el.dataset.bg || '';
        if(cfg.mobileSkip.some(s => src.includes(s))) return;
        io.observe(el);
      });

      // Immediately check visibility (handles reload with restored scroll position)
      const rootMarginPx = 200; // matches rootMargin above
      function isVisibleWithMargin(el){
        const r = el.getBoundingClientRect();
        const winH = window.innerHeight || document.documentElement.clientHeight;
        const winW = window.innerWidth || document.documentElement.clientWidth;
        return (r.bottom >= -rootMarginPx && r.top <= winH + rootMarginPx && r.right >= 0 && r.left <= winW);
      }

      // Run a quick pass to load any elements already in view (fixes reload-in-middle issue)
      setTimeout(()=>{
        imgsToObserve.forEach(img => {
          try{
            if(isVisibleWithMargin(img)){
              const src = img.dataset.src || img.dataset.lazy;
              if(src){
                preloadImage(src).then(()=>{ img.src = src; img.removeAttribute('data-src'); img.removeAttribute('data-lazy'); io.unobserve(img); });
              }
            }
          }catch(e){}
        });
        bgsToObserve.forEach(el => {
          try{
            if(isVisibleWithMargin(el)){
              const src = el.dataset.bg;
              if(src){
                preloadImage(src).then(()=>{ el.style.backgroundImage = `url("${src}")`; el.removeAttribute('data-bg'); io.unobserve(el); });
              }
            }
          }catch(e){}
        });
      }, 50);

      // Also re-check when the page is shown (back/refresh with scroll restoration)
      window.addEventListener('pageshow', ()=>{
        imgsToObserve.forEach(img => {
          try{
            if(isVisibleWithMargin(img)){
              const src = img.dataset.src || img.dataset.lazy;
              if(src){
                preloadImage(src).then(()=>{ img.src = src; img.removeAttribute('data-src'); img.removeAttribute('data-lazy'); io.unobserve(img); });
              }
            }
          }catch(e){}
        });
        bgsToObserve.forEach(el => {
          try{
            if(isVisibleWithMargin(el)){
              const src = el.dataset.bg;
              if(src){
                preloadImage(src).then(()=>{ el.style.backgroundImage = `url("${src}")`; el.removeAttribute('data-bg'); io.unobserve(el); });
              }
            }
          }catch(e){}
        });
      });

      // Also ensure remaining tasks (for non-mobile-safe items) get loaded on first interaction
      const remaining = document.querySelectorAll('img[data-src], img[data-lazy], [data-bg]');
      if(remaining.length){
        onFirstInteraction(async ()=>{
          const remTasks = createTasks();
          if(remTasks.length) await runPool(remTasks);
        });
      }
    } else {
      // Desktop/tablet: load tasks after banner with concurrency
      await runPool(tasks);

      // If there are still any remaining data-src/bg attributes (e.g. skipped on mobile), set up interaction loader
      const remaining = document.querySelectorAll('img[data-src], img[data-lazy], [data-bg]');
      if(remaining.length){
        onFirstInteraction(async ()=>{
          const remTasks = createTasks();
          if(remTasks.length) await runPool(remTasks);
        });
      }
    }

    // If there are still any remaining data-src/bg attributes (e.g. skipped on mobile), set up interaction loader
    const remaining = document.querySelectorAll('img[data-src], img[data-lazy], [data-bg]');
    if(remaining.length){
      onFirstInteraction(async ()=>{
        const remTasks = createTasks();
        if(remTasks.length) await runPool(remTasks);
      });
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
