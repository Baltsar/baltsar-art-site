(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const header = document.querySelector(".site-header");
  const scrollReadout = document.querySelector(".bar-scroll span");
  let ticking = false;

  const onScroll = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 24);

    if (scrollReadout) {
      const travel = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = travel > 0 ? Math.min(1, window.scrollY / travel) : 0;
      scrollReadout.style.transform = `scaleX(${ratio})`;
    }

    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        requestAnimationFrame(onScroll);
        ticking = true;
      }
    },
    { passive: true }
  );

  const meter = document.querySelector(".bar-meter b");
  const meterState = meter?.closest(".bar-state");

  if (meter && meterState) {
    const fill = () => {
      const progress = Number(meterState.dataset.progress || 0);
      meter.style.clipPath = `inset(0 ${100 - progress}% 0 0)`;
    };

    if (reduce) fill();
    else requestAnimationFrame(fill);
  }

  const animateBars = (bars, getProgress) => {
    if (!bars.length) return;

    if (reduce || !("IntersectionObserver" in window)) {
      bars.forEach((el) => {
        el.style.transform = `scaleX(${getProgress(el) / 100})`;
      });
      return;
    }

    bars.forEach((el) => {
      el.style.transform = "scaleX(0)";
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.style.transform = `scaleX(${getProgress(el) / 100})`;
          io.unobserve(el);
        });
      },
      { threshold: 0.2 }
    );

    bars.forEach((el) => io.observe(el));
  };

  animateBars(
    Array.from(document.querySelectorAll(".progress-fill.is-on")),
    (el) => Number(el.closest("[data-progress]")?.dataset.progress || 0)
  );

  animateBars(
    Array.from(document.querySelectorAll(".fact-bar-fill")),
    (el) => Number(el.dataset.progress || 0)
  );

  const aboutToggle = document.querySelector(".about-toggle");
  const aboutMore = document.getElementById("about-more");

  if (aboutToggle && aboutMore) {
    aboutToggle.addEventListener("click", () => {
      const open = aboutMore.hidden;
      aboutMore.hidden = !open;
      aboutToggle.setAttribute("aria-expanded", String(open));
      aboutToggle.textContent = open ? "Show less" : "Show more";
    });
  }

  /* 1-bit ordered dither — stands in for work that doesn't exist yet */
  const ditherFigures = Array.from(document.querySelectorAll("[data-dither]"));

  if (ditherFigures.length) {
    const BAYER = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];

    const COARSE = { cell: 7, contrast: 0.72, lift: 0.16 };

    const sampler = document.createElement("canvas");
    const samplerCtx = sampler.getContext("2d", { willReadFrequently: true });
    const grid = document.createElement("canvas");
    const gridCtx = grid.getContext("2d");

    const render = (canvas, img, cell, contrast, lift) => {
      const width = Math.round(canvas.clientWidth);
      const height = Math.round(canvas.clientHeight);
      if (!width || !height || !img.naturalWidth) return;

      const cols = Math.max(1, Math.round(width / cell));
      const rows = Math.max(1, Math.round(height / cell));
      const count = cols * rows;

      sampler.width = cols;
      sampler.height = rows;
      samplerCtx.clearRect(0, 0, cols, rows);
      samplerCtx.drawImage(img, 0, 0, cols, rows);
      const pixels = samplerCtx.getImageData(0, 0, cols, rows).data;

      const luma = new Float32Array(count);
      let low = 1;
      let high = 0;

      for (let n = 0; n < count; n += 1) {
        const i = n * 4;
        const value =
          (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) / 255;
        luma[n] = value;
        if (value < low) low = value;
        if (value > high) high = value;
      }

      const span = Math.max(0.001, high - low);

      grid.width = cols;
      grid.height = rows;
      const out = gridCtx.createImageData(cols, rows);

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const n = y * cols + x;
          const normalized = (luma[n] - low) / span;
          const level = 0.5 + (normalized - 0.5) * contrast + lift;
          const i = n * 4;
          out.data[i] = 26;
          out.data[i + 1] = 26;
          out.data[i + 2] = 26;
          out.data[i + 3] = level < (BAYER[y & 3][x & 3] + 0.5) / 16 ? 255 : 0;
        }
      }

      gridCtx.putImageData(out, 0, 0);

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(grid, 0, 0, width, height);
    };

    ditherFigures.forEach((figure) => {
      const img = figure.querySelector("img");
      const canvas = figure.querySelector("canvas");
      if (!img || !canvas) return;

      const draw = () =>
        render(canvas, img, COARSE.cell, COARSE.contrast, COARSE.lift);

      const ready = img.complete ? Promise.resolve() : img.decode().catch(() => {});
      ready.then(draw);

      if ("ResizeObserver" in window) {
        new ResizeObserver(() => draw()).observe(canvas);
      } else {
        window.addEventListener("resize", draw, { passive: true });
      }
    });
  }

  /* share — copy link always; native sheet when the device has one */
  const shareBlocks = Array.from(document.querySelectorAll("[data-share]"));

  shareBlocks.forEach((block) => {
    const urlEl = block.querySelector("[data-share-url]");
    const copyBtn = block.querySelector("[data-share-copy]");
    const nativeBtn = block.querySelector("[data-share-native]");
    const xLink = block.querySelector("[data-share-x]");
    const waLink = block.querySelector("[data-share-wa]");
    const pageUrl = window.location.href.split("#")[0];
    const title = document.title.replace(/\s—\sBALTSAR$/, "") || "BALTSAR";

    if (urlEl) {
      try {
        const u = new URL(pageUrl);
        urlEl.textContent = (u.host + u.pathname).replace(/\/$/, "") || u.host;
      } catch {
        urlEl.textContent = pageUrl;
      }
    }

    if (xLink) {
      xLink.href =
        "https://x.com/intent/tweet?url=" +
        encodeURIComponent(pageUrl) +
        "&text=" +
        encodeURIComponent(title);
    }

    if (waLink) {
      waLink.href =
        "https://wa.me/?text=" + encodeURIComponent(title + " " + pageUrl);
    }

    const markCopied = () => {
      if (!copyBtn) return;
      const prev = copyBtn.textContent;
      copyBtn.textContent = "Copied";
      copyBtn.classList.add("is-copied");
      window.setTimeout(() => {
        copyBtn.textContent = prev;
        copyBtn.classList.remove("is-copied");
      }, 1600);
    };

    const copy = async () => {
      try {
        await navigator.clipboard.writeText(pageUrl);
        markCopied();
      } catch {
        const field = document.createElement("textarea");
        field.value = pageUrl;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        field.remove();
        markCopied();
      }
    };

    copyBtn?.addEventListener("click", copy);

    if (nativeBtn && navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener("click", async () => {
        try {
          await navigator.share({ title, text: title, url: pageUrl });
        } catch {
          /* user dismissed */
        }
      });
    }
  });

  /* footer field — slow Bayer crawl */
  const footerCanvas = document.querySelector("[data-footer-field]");

  if (footerCanvas) {
    const BAYER = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];
    const ctx = footerCanvas.getContext("2d");
    let cols = 0;
    let rows = 0;
    let phase = 0;
    let frame = null;

    const resize = () => {
      const width = Math.round(footerCanvas.clientWidth);
      const height = Math.round(footerCanvas.clientHeight);
      if (!width || !height) return;
      footerCanvas.width = width;
      footerCanvas.height = height;
      cols = Math.max(1, Math.round(width / 5));
      rows = Math.max(1, Math.round(height / 5));
      paint();
    };

    const paint = () => {
      if (!cols || !rows) return;
      const grid = document.createElement("canvas");
      grid.width = cols;
      grid.height = rows;
      const g = grid.getContext("2d");
      const out = g.createImageData(cols, rows);
      const cx = (cols - 1) / 2;
      const cy = (rows - 1) / 2;
      const maxDist = Math.sqrt(cx * cx + cy * cy) || 1;

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
          const wave =
            0.42 +
            0.28 * Math.sin(dist * 4.2 - phase) +
            0.12 * Math.sin((x + y) * 0.35 + phase * 0.6);
          const i = (y * cols + x) * 4;
          out.data[i] = 26;
          out.data[i + 1] = 26;
          out.data[i + 2] = 26;
          out.data[i + 3] =
            wave < (BAYER[(y + (phase | 0)) & 3][(x + (phase * 0.5) | 0) & 3] + 0.5) / 16
              ? 42
              : 0;
        }
      }

      g.putImageData(out, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, footerCanvas.width, footerCanvas.height);
      ctx.drawImage(grid, 0, 0, footerCanvas.width, footerCanvas.height);
    };

    const tick = () => {
      phase += 0.045;
      paint();
      frame = requestAnimationFrame(tick);
    };

    resize();
    requestAnimationFrame(resize);

    if ("ResizeObserver" in window) {
      new ResizeObserver(resize).observe(footerCanvas.parentElement || footerCanvas);
    } else {
      window.addEventListener("resize", resize, { passive: true });
    }

    if (!reduce) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              resize();
              if (!frame) frame = requestAnimationFrame(tick);
            } else if (frame) {
              cancelAnimationFrame(frame);
              frame = null;
            }
          });
        },
        { threshold: 0.05 }
      );
      io.observe(footerCanvas);
    } else {
      paint();
    }
  }

  const lightbox = document.getElementById("lightbox");
  const shots = Array.from(document.querySelectorAll(".shot"));
  if (!lightbox || !shots.length) return;

  const lightboxImg = lightbox.querySelector(".lightbox-img");
  const lightboxCaption = lightbox.querySelector(".lightbox-caption");
  const closeTriggers = lightbox.querySelectorAll("[data-lightbox-close]");

  let index = 0;
  let lastFocus = null;

  const show = (next) => {
    index = (next + shots.length) % shots.length;
    const shot = shots[index];
    lightboxImg.src = shot.dataset.src;
    lightboxImg.alt = shot.querySelector("img")?.alt || "";
    lightboxCaption.textContent = shot.dataset.caption || "";
  };

  const open = (next) => {
    lastFocus = document.activeElement;
    show(next);
    lightbox.hidden = false;
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-lightbox-open");
    lightbox.querySelector(".lightbox-close")?.focus();
  };

  const close = () => {
    lightbox.hidden = true;
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-lightbox-open");
    lastFocus?.focus?.();
    lastFocus = null;
  };

  shots.forEach((shot, i) => {
    shot.addEventListener("click", () => open(i));
  });

  closeTriggers.forEach((trigger) => {
    trigger.addEventListener("click", close);
  });

  window.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;

    if (event.key === "Escape") close();
    if (event.key === "ArrowLeft") show(index - 1);
    if (event.key === "ArrowRight") show(index + 1);
  });
})();
