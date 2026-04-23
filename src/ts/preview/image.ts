const previewI18nFallback = {close: "关闭", zoomIn: "放大", zoomOut: "缩小"};

const getPreviewI18n = () => {
    const b = window.VditorI18n;
    if (b) {
        return {close: b.close, zoomIn: previewI18nFallback.zoomIn, zoomOut: previewI18nFallback.zoomOut};
    }
    return previewI18nFallback;
};

/**
 * Important: this modal uses inline styles intentionally.
 * Reason: downstream projects may load JS bundle without matching vditor CSS.
 * Inline styles guarantee the fullscreen overlay is visible cross-project.
 */
const applyInlineStyles = (
    wrap: HTMLElement,
    scroller: HTMLElement,
    zoomBox: HTMLElement,
    imgEl: HTMLImageElement,
    closeBtn: HTMLButtonElement,
    zoomWrap: HTMLElement,
    zoomOutBtn: HTMLButtonElement,
    zoomInBtn: HTMLButtonElement,
    pctEl: HTMLElement,
    theme = "classic",
) => {
    const isDark = theme === "dark";
    wrap.style.position = "fixed";
    wrap.style.top = "0";
    wrap.style.left = "0";
    wrap.style.right = "0";
    wrap.style.bottom = "0";
    wrap.style.width = "100vw";
    wrap.style.height = "100vh";
    wrap.style.zIndex = "2147483647";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.border = "0";
    wrap.style.borderRadius = "0";
    wrap.style.backgroundColor = isDark ? "rgba(20,20,20,0.66)" : "rgba(0,0,0,0.55)";

    closeBtn.style.position = "absolute";
    closeBtn.style.top = "10px";
    closeBtn.style.right = "10px";
    closeBtn.style.zIndex = "2";
    closeBtn.style.display = "flex";
    closeBtn.style.alignItems = "center";
    closeBtn.style.padding = "6px 12px";
    closeBtn.style.border = "0";
    closeBtn.style.borderRadius = "3px";
    closeBtn.style.background = "rgba(0,0,0,0.55)";
    closeBtn.style.color = "#fff";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.userSelect = "none";

    scroller.style.flex = "1";
    scroller.style.minHeight = "0";
    scroller.style.display = "flex";
    scroller.style.alignItems = "center";
    scroller.style.justifyContent = "center";
    scroller.style.padding = "48px 12px 56px";
    scroller.style.boxSizing = "border-box";
    scroller.style.overflow = "hidden";
    scroller.style.cursor = "default";

    zoomBox.style.display = "inline-block";
    zoomBox.style.lineHeight = "0";
    zoomBox.style.transition = "transform 0.12s ease-out";
    zoomBox.style.transformOrigin = "center center";

    imgEl.style.display = "block";
    imgEl.style.maxWidth = "none";
    imgEl.style.maxHeight = "none";
    imgEl.style.width = "auto";
    imgEl.style.height = "auto";
    imgEl.style.objectFit = "contain";

    zoomWrap.style.position = "absolute";
    zoomWrap.style.left = "0";
    zoomWrap.style.right = "0";
    zoomWrap.style.bottom = "12px";
    zoomWrap.style.zIndex = "2";
    zoomWrap.style.display = "flex";
    zoomWrap.style.alignItems = "center";
    zoomWrap.style.justifyContent = "center";
    zoomWrap.style.gap = "12px";
    zoomWrap.style.userSelect = "none";

    [zoomOutBtn, zoomInBtn].forEach((btn) => {
        btn.style.minWidth = "40px";
        btn.style.height = "40px";
        btn.style.border = "0";
        btn.style.borderRadius = "4px";
        btn.style.background = "rgba(0,0,0,0.58)";
        btn.style.color = "#fff";
        btn.style.fontSize = "22px";
        btn.style.lineHeight = "1";
        btn.style.cursor = "pointer";
        btn.style.padding = "0 10px";
    });
    pctEl.style.minWidth = "3.2em";
    pctEl.style.textAlign = "center";
    pctEl.style.fontSize = "12px";
    pctEl.style.color = "#fff";
};

/**
 * 轻量大图预览：仅「关闭、放大、缩小」；点空白区或 Esc 关闭；不做旋转/全屏/下载。
 */
export const previewImage = (oldImgElement: HTMLImageElement, _lang: keyof II18n = "zh_CN", theme = "classic") => {
    const i18n = getPreviewI18n();
    const wrap = document.createElement("div");
    wrap.className = `vditor vditor-img${theme === "dark" ? " vditor--dark" : ""} vditor-img--layer`;
    wrap.innerHTML = `<button type="button" class="vditor-img__close" data-vditor-img-close aria-label="${i18n.close}">
  <span class="vditor-img__close-x">×</span><span class="vditor-img__close-txt"> ${i18n.close}</span>
</button>
<div class="vditor-img__stage" data-vditor-img-scroller>
  <div class="vditor-img__inner" data-vditor-img-zoom-box>
    <img alt="" data-vditor-img-target />
  </div>
</div>
<div class="vditor-img__zoom" role="toolbar">
  <button type="button" class="vditor-img__btn" data-vditor-img-zoom-out title="${i18n.zoomOut}" aria-label="${i18n.zoomOut}">−</button>
  <span class="vditor-img__zoom-pct" data-vditor-img-zoom-pct>100%</span>
  <button type="button" class="vditor-img__btn" data-vditor-img-zoom-in title="${i18n.zoomIn}" aria-label="${i18n.zoomIn}">+</button>
</div>`;
    document.body.appendChild(wrap);
    document.body.style.overflow = "hidden";

    const scroller = wrap.querySelector("[data-vditor-img-scroller]") as HTMLElement;
    const zoomBox = wrap.querySelector("[data-vditor-img-zoom-box]") as HTMLElement;
    const imgEl = wrap.querySelector("[data-vditor-img-target]") as HTMLImageElement;
    const pctEl = wrap.querySelector("[data-vditor-img-zoom-pct]") as HTMLElement;
    const closeBtn = wrap.querySelector("[data-vditor-img-close]") as HTMLButtonElement;
    const zoomWrap = wrap.querySelector("[role='toolbar']") as HTMLElement;
    const zoomOutBtn = wrap.querySelector("[data-vditor-img-zoom-out]") as HTMLButtonElement;
    const zoomInBtn = wrap.querySelector("[data-vditor-img-zoom-in]") as HTMLButtonElement;
    applyInlineStyles(wrap, scroller, zoomBox, imgEl, closeBtn, zoomWrap, zoomOutBtn, zoomInBtn, pctEl, theme);

    imgEl.src = oldImgElement.getAttribute("src") || "";
    const oldAlt = oldImgElement.getAttribute("alt");
    if (oldAlt) {
        imgEl.setAttribute("alt", oldAlt);
    }

    const MIN = 0.2;
    const MAX = 6;
    const STEP = 1.2;
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    const updateTransform = () => {
        zoomBox.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        pctEl.textContent = `${Math.round(scale * 100)}%`;
        scroller.style.cursor = scale > 1 ? "grab" : "default";
    };
    const setScale = (next: number, anchorClientX?: number, anchorClientY?: number) => {
        const prevScale = scale;
        scale = Math.min(MAX, Math.max(MIN, next));
        if (anchorClientX !== undefined && anchorClientY !== undefined && prevScale > 0 && scale !== prevScale) {
            const rect = scroller.getBoundingClientRect();
            const dx = anchorClientX - rect.left - rect.width / 2;
            const dy = anchorClientY - rect.top - rect.height / 2;
            const ratio = scale / prevScale;
            translateX = ratio * translateX + (1 - ratio) * dx;
            translateY = ratio * translateY + (1 - ratio) * dy;
        }
        if (scale <= 1) {
            translateX = 0;
            translateY = 0;
        }
        updateTransform();
    };
    setScale(1);

    const onImgLayout = () => {
        if (!imgEl.naturalWidth) {
            return;
        }
        const maxW = scroller.clientWidth;
        const maxH = scroller.clientHeight;
        const nw = imgEl.naturalWidth;
        const nh = imgEl.naturalHeight;
        const r = Math.min(1, maxW / nw, maxH / nh);
        imgEl.style.maxWidth = `${nw * r}px`;
        imgEl.style.maxHeight = `${nh * r}px`;
        imgEl.style.width = "auto";
        imgEl.style.height = "auto";
        zoomBox.style.transformOrigin = "center center";
    };

    const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    };
    const onResize = () => onImgLayout();
    const onWheel = (e: WheelEvent) => {
        // Prevent browser/page zoom or scroll while operating inside image modal.
        e.preventDefault();
        e.stopPropagation();
        const ratio = e.deltaY < 0 ? STEP : 1 / STEP;
        setScale(scale * ratio, e.clientX, e.clientY);
    };
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    const onPointerMove = (e: PointerEvent) => {
        if (!dragging) {
            return;
        }
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
            moved = true;
        }
        translateX += dx;
        translateY += dy;
        startX = e.clientX;
        startY = e.clientY;
        scroller.style.cursor = "grabbing";
        updateTransform();
    };
    const onPointerUp = () => {
        if (!dragging) {
            return;
        }
        dragging = false;
        scroller.style.cursor = scale > 1 ? "grab" : "default";
        if (moved) {
            // Suppress one click so drag release won't close modal.
            scroller.setAttribute("data-vditor-img-dragged", "1");
            window.setTimeout(() => scroller.removeAttribute("data-vditor-img-dragged"), 0);
        }
    };

    const close = () => {
        // Clean up all side effects introduced by the overlay.
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", onResize);
        scroller.removeEventListener("wheel", onWheel);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        document.body.style.overflow = "";
        if (wrap.parentNode) {
            wrap.remove();
        }
    };

    closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
    });
    zoomInBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rect = scroller.getBoundingClientRect();
        setScale(scale * STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    zoomOutBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rect = scroller.getBoundingClientRect();
        setScale(scale / STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    scroller.addEventListener("wheel", onWheel, {passive: false});
    scroller.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || scale <= 1) {
            return;
        }
        e.preventDefault();
        dragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        scroller.style.cursor = "grabbing";
    });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    scroller.addEventListener("click", (e) => {
        if (scroller.getAttribute("data-vditor-img-dragged") === "1") {
            return;
        }
        if (e.target === scroller) {
            close();
        }
    });
    imgEl.addEventListener("click", (e) => e.stopPropagation());
    zoomBox.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    const scheduleLayout = () => requestAnimationFrame(() => onImgLayout());
    if (imgEl.complete) {
        scheduleLayout();
    } else {
        imgEl.addEventListener("load", () => scheduleLayout(), {once: true});
    }
};
