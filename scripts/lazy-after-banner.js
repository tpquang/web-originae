(function () {

  const cfg = {
    bannerSelector: ".img-effect-banner",
    bannerTimeout: 500,
    mobileBreakpoint: 480,
    mobileSkip: ["/image/image.webp"],
    ioRootMargin: "200px",
  };

  const isMobile = () => window.innerWidth <= cfg.mobileBreakpoint;

  function waitForBanner(timeout = cfg.bannerTimeout) {
    const banner = document.querySelector(cfg.bannerSelector);
    return new Promise((res) => {
      if (!banner) return res();
      if (banner.complete) return res();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        res();
      };
      banner.addEventListener("load", finish, { once: true });
      banner.addEventListener("error", finish, { once: true });
      setTimeout(finish, timeout);
    });
  }

  function supportsRIC() {
    return typeof window.requestIdleCallback === "function";
  }

  // Safely set src/srcset on <img> and <source> elements, attaching handlers before assignment
  function assignImage(el, { src, srcset }) {
    return new Promise((resolve) => {
      const onDone = () => resolve();
      if (el.tagName === "IMG") {
        const tmp = new Image();
        if (srcset) tmp.srcset = srcset;
        if (src) tmp.src = src;
        tmp.onload = tmp.onerror = () => {
          if (srcset) el.srcset = srcset;
          if (src) el.src = src;
          el.removeAttribute("data-src");
          el.removeAttribute("data-srcset");
          el.removeAttribute("data-src-mobile");
          el.removeAttribute("data-srcset-mobile");
          resolve();
        };
      } else if (el.tagName === "SOURCE") {
        if (srcset) el.srcset = srcset;
        el.removeAttribute("data-srcset");
        el.removeAttribute("data-srcset-mobile");
        resolve();
      } else {
        resolve();
      }
    });
  }

  function loadPicture(pictureEl) {
    if (!pictureEl) return Promise.resolve();
    const sources = Array.from(pictureEl.querySelectorAll("source"));
    const img = pictureEl.querySelector("img");
    const mobile = isMobile();

    const tasks = [];
    sources.forEach((s) => {
      const srcset = mobile ? s.dataset.srcsetMobile || s.dataset.srcset : s.dataset.srcset || s.dataset.srcsetMobile;
      if (srcset) tasks.push(() => assignImage(s, { srcset }));
    });

    if (img) {
      const srcset = mobile ? img.dataset.srcsetMobile || img.dataset.srcset : img.dataset.srcset || img.dataset.srcsetMobile;
      const src = mobile ? img.dataset.srcMobile || img.dataset.src : img.dataset.src || img.dataset.srcMobile;
      if (srcset || src) tasks.push(() => assignImage(img, { src, srcset }));
    }

    return tasks.reduce((p, t) => p.then(t), Promise.resolve());
  }

  function loadBackground(el) {
    if (!el || !el.dataset) return Promise.resolve();
    const mobile = isMobile();
    const src = mobile ? el.dataset.bgMobile || el.dataset.bg : el.dataset.bg || el.dataset.bgMobile;
    if (!src) return Promise.resolve();
    if (mobile && cfg.mobileSkip.some((s) => src.includes(s))) return Promise.resolve();
    return new Promise((res) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        el.style.backgroundImage = `url("${src}")`;
        el.removeAttribute("data-bg");
        el.removeAttribute("data-bg-mobile");
        res();
      };
      img.src = src;
    });
  }

  function elementLoadTask(el) {
    if (!el) return Promise.resolve();
    if (el.tagName === "PICTURE") return loadPicture(el);
    if (el.tagName === "IMG") return loadPicture(el.parentElement && el.parentElement.tagName === "PICTURE" ? el.parentElement : null).then(() => assignImage(el, {
      src: isMobile() ? el.dataset.srcMobile || el.dataset.src : el.dataset.src || el.dataset.srcMobile,
      srcset: isMobile() ? el.dataset.srcsetMobile || el.dataset.srcset : el.dataset.srcset || el.dataset.srcsetMobile,
    }));
    return loadBackground(el);
  }

  function queryLazyElements() {
    const pictures = Array.from(document.querySelectorAll("picture")).filter(p => p.querySelector("source[data-srcset], source[data-srcset-mobile], img[data-src], img[data-src-mobile], img[data-srcset], img[data-srcset-mobile]"));
    const imgs = Array.from(document.querySelectorAll("img[data-src], img[data-src-mobile], img[data-srcset], img[data-srcset-mobile]"));
    const bgs = Array.from(document.querySelectorAll("[data-bg], [data-bg-mobile]"));
    const pictureImgs = new Set(pictures.map(p => p.querySelector("img")).filter(Boolean));
    const imgsFiltered = imgs.filter(i => !pictureImgs.has(i));
    return { pictures, imgs: imgsFiltered, bgs };
  }

  function observeAndLoad() {
    const { pictures, imgs, bgs } = queryLazyElements();
    const mobile = isMobile();

    if (mobile && window.IntersectionObserver) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          io.unobserve(el);
          elementLoadTask(el).catch(()=>{});
        });
      }, { root: null, rootMargin: cfg.ioRootMargin, threshold: 0 });

      pictures.forEach(p => io.observe(p));
      imgs.forEach(i => io.observe(i));
      bgs.forEach(b => io.observe(b));

      const inView = [...pictures, ...imgs, ...bgs].filter(el => {
        const r = el.getBoundingClientRect();
        return r.bottom >= -200 && r.top <= (window.innerHeight || document.documentElement.clientHeight) + 200;
      });
      inView.forEach(el => { try { elementLoadTask(el); } catch(e){} });
    } else {
      const tasks = [...pictures.map(p => () => elementLoadTask(p)), ...imgs.map(i => () => elementLoadTask(i)), ...bgs.map(b => () => elementLoadTask(b))];
      const runner = () => tasks.reduce((p, t) => p.then(t), Promise.resolve());
      if (supportsRIC()) requestIdleCallback(() => runner()); else runner();
    }
  }

  function onFirstInteraction(fn) {
    const once = () => { fn(); window.removeEventListener('scroll', once); window.removeEventListener('touchstart', once); window.removeEventListener('mousemove', once); window.removeEventListener('keydown', once); };
    window.addEventListener('scroll', once, { passive: true });
    window.addEventListener('touchstart', once, { passive: true });
    window.addEventListener('mousemove', once, { passive: true });
    window.addEventListener('keydown', once, { passive: true });
  }

  async function init() {
    // Wait for the banner LCP image to finish (or timeout)
    await waitForBanner();

    // Ensure banner is assigned/visible immediately if it uses data-* attributes
    try {
      const bannerEl = document.querySelector(cfg.bannerSelector);
      if (bannerEl) {
        if (bannerEl.tagName === 'IMG') {
          const src = isMobile() ? (bannerEl.dataset.srcMobile || bannerEl.dataset.src) : (bannerEl.dataset.src || bannerEl.src);
          const srcset = isMobile() ? (bannerEl.dataset.srcsetMobile || bannerEl.dataset.srcset) : (bannerEl.dataset.srcset || null);
          if (src || srcset) await assignImage(bannerEl, { src, srcset });
        } else if (bannerEl.tagName === 'PICTURE') {
          await loadPicture(bannerEl);
        }
      }
    } catch (e) {
      // swallow banner assignment errors to avoid console noise
    }

    // Delay loading other images by ~5s to prioritize LCP and primary content
    const delayMs = 500;
    const startLoads = () => { try { observeAndLoad(); } catch (e) {} };

    if (supportsRIC()) {
      setTimeout(() => requestIdleCallback(startLoads), delayMs);
    } else {
      setTimeout(startLoads, delayMs);
    }

    // Fallback: load remaining assets on first user interaction
    onFirstInteraction(() => { try { observeAndLoad(); } catch (e) {} });

    // Handle back/forward cache restores
    window.addEventListener('pageshow', (ev) => { if (ev.persisted) { try { observeAndLoad(); } catch (e) {} } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
