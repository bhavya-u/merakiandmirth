(async () => {
  const report = document.querySelector('pre');
  try {
    const response = await fetch('/assets/catalogue-webp/300%20ml%20Bunny%20Glass%20Bottle--p00001.webp');
    if (!response.ok) throw new Error('Fixture unavailable');
    const blob = await response.blob();
    const results = await ProductImages.prepare(blob);
    const summary = {};
    for (const [name, image] of Object.entries(results)) {
      const decoded = await createImageBitmap(image);
      const [limit, budget] = ProductImages.specs[name];
      if (Math.max(decoded.width, decoded.height) > limit || image.size > budget) throw new Error('Budget exceeded');
      summary[name] = { bytes: image.size, width: decoded.width, height: decoded.height, type: image.type };
      decoded.close();
    }
    report.textContent = 'PASS: browser upload conversion and all variant budgets\n' + JSON.stringify(summary, null, 2);
  } catch (error) { report.textContent = 'FAIL: ' + error.message; }
})();
