(() => {
  function previewUrl(value) {
    try {
      const url = new URL(value, location.origin);
      if (url.origin === location.origin && url.pathname.startsWith('/storage/profile/'))
        return '/_next/image?url=' + encodeURIComponent(url.pathname + url.search) + '&w=256&q=75';
    } catch (_) { /* Keep the original fallback for unsupported sources. */ }
    return value;
  }
  function retryOriginal(image) {
    if (!image.dataset.originalSource || image.dataset.originalRetried) return false;
    image.dataset.originalRetried = '1';
    image.src = image.dataset.originalSource;
    return true;
  }
  window.SCDPersonnelPhotos = {previewUrl, retryOriginal};
})();
