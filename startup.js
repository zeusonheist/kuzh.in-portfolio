// Runs in the head, independently of model-viewer and the main module graph.
(() => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const entryURL = location.href;
  let interacted = false;
  const media = matchMedia('(max-width: 600px)');

  function resetScroll() {
    if (!interacted && !location.hash && location.href === entryURL) {
      window.scrollTo({top: 0, behavior: 'instant'});
    }
  }

  function mountArtwork(main, phoneLayout) {
    if (!main) return;
    const desktop = main.querySelector('template.desktop-artwork');
    if (!desktop) return;
    const phone = main.querySelector('template.phone-artwork');
    const drawn = main.querySelector(':scope > .design');
    const desired = phoneLayout ? phone : desktop;
    if (drawn && (phone ? drawn.dataset.artworkLayout !== (phoneLayout ? 'mobile' : 'desktop') : phoneLayout)) {
      (drawn.dataset.artworkLayout === 'mobile' ? phone : desktop).content.append(drawn);
    }
    if (desired?.content.firstElementChild) {
      const artwork = desired.content.firstElementChild;
      artwork.dataset.artworkLayout = phoneLayout ? 'mobile' : 'desktop';
      main.prepend(artwork);
    }
  }

  function ready() {
    mountArtwork(document.querySelector('main'), media.matches);
    window.portfolioImages?.modelLoading(Boolean(document.querySelector('main')?.querySelector('[data-model-slot]')));
    window.portfolioImages?.observe(document.querySelector('main'));
    resetScroll();
    requestAnimationFrame(resetScroll);
  }

  window.portfolioStartup = {mountArtwork, resetScroll, ready};
  media.addEventListener('change', () => mountArtwork(document.querySelector('main'), media.matches));
  for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown']) {
    window.addEventListener(event, () => { interacted = true; }, {once: true, passive: true});
  }
  window.addEventListener('pageshow', event => { if (!event.persisted) resetScroll(); });
  resetScroll();
})();
