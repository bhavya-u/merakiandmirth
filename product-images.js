/* Versioned image contract. Legacy photo URLs remain valid. */
(() => {
  const specs = Object.freeze({ thumb: [240, 30000], grid: [640, 120000], export: [1200, 300000], detail: [1600, 500000] });
  function source(url, variant = 'grid') {
    if (!Object.hasOwn(specs, variant)) throw new Error('Unknown image variant');
    return url.replace(/(\/variants-v1\/[^/?]+\/)(thumb|grid|export|detail)\.webp(?=$|\?)/, `$1${variant}.webp`);
  }
  function fit(width, height, limit) {
    const scale = Math.min(1, limit / Math.max(width, height));
    return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
  }
  async function prepare(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP image smaller than 15 MB.');
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 24000000) throw new Error('Please resize the image to 24 megapixels or less.');
      const result = {};
      for (const [name, [limit, budget]] of Object.entries(specs)) {
        const canvas = document.createElement('canvas');
        [canvas.width, canvas.height] = fit(bitmap.width, bitmap.height, limit);
        try {
          canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          for (const quality of [.82, .72, .62, .52]) {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
            if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot optimize WebP images. Please use a current browser.');
            if (blob.size <= budget) { result[name] = blob; break; }
          }
          if (!result[name]) throw new Error('This image is too detailed for the upload budget. Please resize it and try again.');
        } finally { canvas.width = canvas.height = 1; }
      }
      return result;
    } finally { bitmap.close(); }
  }
  globalThis.ProductImages = { specs, source, fit, prepare };
})();

// A hidden view never gets a src. Observe inserted cards and release removed ones.
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  const load = image => { image.src = image.dataset.imageSrc; delete image.dataset.imageSrc; };
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { load(entry.target); observer.unobserve(entry.target); }
  }, { rootMargin: '160px' });
  const images = node => node.nodeType === 1 ? [...(node.matches('img[data-image-src]') ? [node] : []), ...node.querySelectorAll('img[data-image-src]')] : [];
  const watch = node => images(node).forEach(image => observer ? observer.observe(image) : load(image));
  watch(document.body);
  new MutationObserver(records => {
    for (const record of records) {
      record.removedNodes.forEach(node => images(node).forEach(image => observer?.unobserve(image)));
      record.addedNodes.forEach(watch);
    }
  }).observe(document.body, { childList: true, subtree: true });
});
