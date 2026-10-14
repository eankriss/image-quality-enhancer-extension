(() => {
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];

  const els = {
    fileInput: $('#fileInput'),
    fileMeta: $('#fileMeta'),
    sourceInput: $('#sourceInput'),
    prefixSelect: $('#prefixSelect'),
    rightsInput: $('#rightsInput'),
    fontSize: $('#fontSize'),
    paddingInput: $('#paddingInput'),
    textColor: $('#textColor'),
    bgColor: $('#bgColor'),
    bgOpacity: $('#bgOpacity'),
    bgOpacityValue: $('#bgOpacityValue'),
    watermarkOpacity: $('#watermarkOpacity'),
    watermarkOpacityValue: $('#watermarkOpacityValue'),
    twoLine: $('#twoLine'),
    marginInput: $('#marginInput'),
    marginValue: $('#marginValue'),
    formatSelect: $('#formatSelect'),
    qualitySelect: $('#qualitySelect'),
    qualityField: $('#qualityField'),
    exportBtn: $('#exportBtn'),
    themeToggle: $('#themeToggle'),
    previewMeta: $('#previewMeta'),
    emptyState: $('#emptyState'),
    stageWrap: $('#stageWrap'),
    stage: $('#stage'),
    previewCanvas: $('#previewCanvas'),
  };

  const state = {
    file: null,
    url: null,
    img: null,
    w: 0,
    h: 0,
    pos: { x: 0.95, y: 0.95 },
    anchor: 'br',
    dragging: false,
    dragOffset: { x: 0, y: 0 },
    lastBox: null,
  };

  function rgba(hex, alpha) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  function creditText() {
    const source = els.sourceInput.value.trim();
    const rights = els.rightsInput.value.trim();
    const first = (els.prefixSelect.value || '') + source;
    if (!rights) return first;
    return els.twoLine.checked ? `${first}\n${rights}` : `${first} · ${rights}`;
  }

  // Wraps normal words AND very long URL-like tokens so nothing gets cut off.
  function wrapText(ctx, text, maxWidth) {
    const output = [];

    function splitLongToken(token) {
      const parts = [];
      let current = '';
      for (const char of token) {
        const test = current + char;
        if (current && ctx.measureText(test).width > maxWidth) {
          parts.push(current);
          current = char;
        } else {
          current = test;
        }
      }
      if (current) parts.push(current);
      return parts;
    }

    for (const rawLine of String(text || '').split('\n')) {
      const words = rawLine.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        output.push('');
        continue;
      }

      let line = '';
      for (const word of words) {
        if (ctx.measureText(word).width > maxWidth) {
          if (line) {
            output.push(line);
            line = '';
          }
          const pieces = splitLongToken(word);
          output.push(...pieces.slice(0, -1));
          line = pieces[pieces.length - 1] || '';
          continue;
        }

        const test = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(test).width > maxWidth) {
          output.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      output.push(line);
    }

    return output.length ? output : [''];
  }

  function computeBox(ctx, canvasWidth, canvasHeight) {
    const fontSize = Math.max(8, Number(els.fontSize.value) || 24);
    const pad = Math.max(0, Number(els.paddingInput.value) || 0);
    const text = creditText() || 'Image credit: Source';
    const maxTextWidth = Math.max(40, canvasWidth * 0.80);

    ctx.font = `500 ${fontSize}px Arial, sans-serif`;
    ctx.textBaseline = 'top';

    const lines = wrapText(ctx, text, maxTextWidth);
    const lineHeight = fontSize * 1.28;
    const textWidth = Math.min(
      maxTextWidth,
      Math.max(1, ...lines.map(line => ctx.measureText(line).width))
    );
    const boxWidth = Math.min(canvasWidth, textWidth + pad * 2);
    const boxHeight = Math.min(canvasHeight, lines.length * lineHeight + pad * 2);

    let x;
    let y;
    const px = state.pos.x * canvasWidth;
    const py = state.pos.y * canvasHeight;

    const a = state.anchor;
    if (a === 'tl') { x = px; y = py; }
    else if (a === 'tc') { x = px - boxWidth / 2; y = py; }
    else if (a === 'tr') { x = px - boxWidth; y = py; }
    else if (a === 'ml') { x = px; y = py - boxHeight / 2; }
    else if (a === 'mc' || a === 'free') { x = px - boxWidth / 2; y = py - boxHeight / 2; }
    else if (a === 'mr') { x = px - boxWidth; y = py - boxHeight / 2; }
    else if (a === 'bl') { x = px; y = py - boxHeight; }
    else if (a === 'bc') { x = px - boxWidth / 2; y = py - boxHeight; }
    else { x = px - boxWidth; y = py - boxHeight; }

    x = Math.max(0, Math.min(canvasWidth - boxWidth, x));
    y = Math.max(0, Math.min(canvasHeight - boxHeight, y));

    return {
      x, y,
      width: boxWidth,
      height: boxHeight,
      lines,
      lineHeight,
      fontSize,
      pad,
    };
  }

  function renderComposite(canvas) {
    if (!state.img) return null;

    canvas.width = state.w;
    canvas.height = state.h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.img, 0, 0, canvas.width, canvas.height);

    const box = computeBox(ctx, canvas.width, canvas.height);
    const opacity = Number(els.watermarkOpacity.value) / 100;
    const bgAlpha = (Number(els.bgOpacity.value) / 100) * opacity;

    ctx.save();
    ctx.fillStyle = rgba(els.bgColor.value, bgAlpha);
    ctx.fillRect(box.x, box.y, box.width, box.height);

    ctx.globalAlpha = opacity;
    ctx.font = `500 ${box.fontSize}px Arial, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = els.textColor.value;

    box.lines.forEach((line, i) => {
      ctx.fillText(
        line,
        box.x + box.pad,
        box.y + box.pad + i * box.lineHeight
      );
    });
    ctx.restore();

    state.lastBox = box;
    return box;
  }

  function renderPreview() {
    if (!state.img) return;
    renderComposite(els.previewCanvas);
  }

  function presetPos(pos) {
    if (!state.w || !state.h) return;
    const margin = Math.max(0, Number(els.marginInput.value) || 0);
    const mx = Math.min(0.45, margin / state.w);
    const my = Math.min(0.45, margin / state.h);
    const map = {
      tl: [mx, my], tc: [0.5, my], tr: [1 - mx, my],
      ml: [mx, 0.5], mc: [0.5, 0.5], mr: [1 - mx, 0.5],
      bl: [mx, 1 - my], bc: [0.5, 1 - my], br: [1 - mx, 1 - my],
    };

    if (!map[pos]) return;
    state.pos = { x: map[pos][0], y: map[pos][1] };
    state.anchor = pos;
    $$('#positionGrid button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.pos === pos);
    });
    renderPreview();
  }

  function loadImage(file) {
    if (state.url) URL.revokeObjectURL(state.url);
    state.file = file;
    state.url = URL.createObjectURL(file);

    const img = new Image();
    img.onload = () => {
      state.img = img;
      state.w = img.naturalWidth;
      state.h = img.naturalHeight;
      els.fileMeta.textContent = `${file.name} · ${state.w}×${state.h}`;
      els.previewMeta.textContent = `${state.w} × ${state.h}px · preview is rendered with the same engine as the downloaded image`;
      els.emptyState.classList.add('hidden');
      els.stageWrap.classList.remove('hidden');
      els.exportBtn.disabled = false;
      presetPos('br');
      renderPreview();
    };
    img.onerror = () => alert('Unable to read this image.');
    img.src = state.url;
  }

  function canvasPoint(event) {
    const rect = els.previewCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (els.previewCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (els.previewCanvas.height / rect.height),
    };
  }

  els.previewCanvas.addEventListener('pointerdown', event => {
    if (!state.img || !state.lastBox) return;
    const p = canvasPoint(event);
    const b = state.lastBox;
    const inside = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
    if (!inside) return;

    state.dragging = true;
    state.dragOffset = { x: p.x - b.x, y: p.y - b.y };
    els.previewCanvas.setPointerCapture(event.pointerId);
    els.previewCanvas.classList.add('dragging');
  });

  els.previewCanvas.addEventListener('pointermove', event => {
    if (!state.dragging || !state.lastBox) return;
    const p = canvasPoint(event);
    const b = state.lastBox;

    const x = Math.max(0, Math.min(state.w - b.width, p.x - state.dragOffset.x));
    const y = Math.max(0, Math.min(state.h - b.height, p.y - state.dragOffset.y));

    state.pos = {
      x: (x + b.width / 2) / state.w,
      y: (y + b.height / 2) / state.h,
    };
    state.anchor = 'free';
    $$('#positionGrid button').forEach(btn => btn.classList.remove('active'));
    renderPreview();
  });

  function stopDrag() {
    state.dragging = false;
    els.previewCanvas.classList.remove('dragging');
  }
  els.previewCanvas.addEventListener('pointerup', stopDrag);
  els.previewCanvas.addEventListener('pointercancel', stopDrag);

  $$('#positionGrid button').forEach(btn => {
    btn.addEventListener('click', () => presetPos(btn.dataset.pos));
  });

  const redrawControls = [
    els.sourceInput, els.prefixSelect, els.rightsInput, els.fontSize,
    els.paddingInput, els.textColor, els.bgColor, els.bgOpacity,
    els.watermarkOpacity, els.twoLine,
  ];

  redrawControls.forEach(el => {
    const eventName = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, renderPreview);
  });

  // Text fields should redraw while typing.
  els.sourceInput.addEventListener('input', renderPreview);
  els.rightsInput.addEventListener('input', renderPreview);

  els.bgOpacity.addEventListener('input', () => {
    els.bgOpacityValue.textContent = `${els.bgOpacity.value}%`;
  });
  els.watermarkOpacity.addEventListener('input', () => {
    els.watermarkOpacityValue.textContent = `${els.watermarkOpacity.value}%`;
  });

  els.marginInput.addEventListener('input', () => {
    els.marginValue.textContent = `${els.marginInput.value} px`;
    const active = $('#positionGrid button.active');
    if (active) presetPos(active.dataset.pos);
    else renderPreview();
  });

  els.fileInput.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) loadImage(file);
  });

  els.formatSelect.addEventListener('change', () => {
    els.qualityField.classList.toggle('hidden', els.formatSelect.value === 'image/png');
  });

  function exportImage() {
    if (!state.img) return;

    // Re-render immediately before export. This is the exact same renderer used by the preview.
    renderComposite(els.previewCanvas);

    const mime = els.formatSelect.value;
    const quality = Number(els.qualitySelect.value);
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';

    els.previewCanvas.toBlob(blob => {
      if (!blob) {
        alert('Unable to export image.');
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.file.name.replace(/\.[^.]+$/, '')}-credited.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    }, mime, quality);
  }

  els.exportBtn.addEventListener('click', exportImage);

  els.themeToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem(
      'creditWatermarkTheme',
      document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    );
  });

  const saved = localStorage.getItem('creditWatermarkTheme');
  if (saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }

  window.addEventListener('beforeunload', () => {
    if (state.url) URL.revokeObjectURL(state.url);
  });
})();
