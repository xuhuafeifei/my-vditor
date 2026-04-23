import {previewImage} from "../preview/image";
import {isVditorEmptyImagePlaceholderSrc} from "../util/emptyImagePlaceholder";

/** 右上角「预览」按钮（VditorI18n.imageBlockPreview，或各语言包） */
const getImageBlockPreviewButtonTitle = (): string => {
    const I = typeof window !== "undefined" && (window as Window & {VditorI18n?: {imageBlockPreview?: string}}).VditorI18n;
    return (I && I.imageBlockPreview) || "预览大图";
};

/** 预览区 title：编辑与预览入口说明 */
const getImageBlockHintTitle = (): string => {
    const I = typeof window !== "undefined" && (window as Window & {VditorI18n?: {imageBlockEditHint?: string}}).VditorI18n;
    return (I && I.imageBlockEditHint) || "单击图片可编辑 Markdown；右上角可预览大图；亦可双击图片预览";
};

const appendImageMdBlockChrome = (wrap: HTMLDivElement, preview: HTMLDivElement, vditor: IVditor) => {
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.setAttribute("contenteditable", "false");
    openBtn.className = "vditor-wysiwyg__image-md__open";
    openBtn.setAttribute("data-vditor-wysiwyg-image-md-open", "true");
    openBtn.setAttribute("title", getImageBlockPreviewButtonTitle());
    openBtn.setAttribute("aria-label", getImageBlockPreviewButtonTitle());
    openBtn.innerHTML = '<svg class="vditor-wysiwyg__image-md__open-svg"><use xlink:href="#vditor-icon-fullscreen"></use></svg>';
    openBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const img = preview.querySelector("img") as HTMLImageElement | null;
        if (img) {
            previewImage(img, vditor.options.lang, vditor.options.theme);
        }
    });
    wrap.appendChild(openBtn);
    preview.setAttribute("title", getImageBlockHintTitle());
};

export const buildMarkdownImageFromImgElement = (img: HTMLImageElement): string => {
    const alt = img.getAttribute("alt") || "";
    let src = (img.getAttribute("src") || "").trim();
    if (isVditorEmptyImagePlaceholderSrc(src)) {
        src = "";
    }
    const title = (img.getAttribute("title") || "").trim();
    const dest = linkDest(src);
    if (title) {
        const escTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return `![${alt}](${dest} "${escTitle}")`;
    }
    return `![${alt}](${dest})`;
};

const linkDest = (src: string): string => {
    if (!src) {
        return "";
    }
    if (src.indexOf(")") > -1 && src.indexOf(">") !== 0) {
        return `<${src}>`;
    }
    return src;
};

/** Spin 前：把带源码块的图片结构还原为 Lute 能吃的 DOM（优先用 code 里的 Markdown） */
export const unwrapImageMdBlocksForSpin = (html: string, vditor: IVditor): string => {
    if (!html.includes("image-md-block")) {
        return html;
    }
    const div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll('[data-type="image-md-block"]').forEach((b) => {
        const code = b.querySelector(".vditor-wysiwyg__image-md__code");
        const md = (code as HTMLElement | null)?.textContent?.trim() || "";
        if (md) {
            try {
                const out = vditor.lute.Md2VditorDOM(md);
                const t = document.createElement("div");
                t.innerHTML = out;
                const inner = t.firstElementChild;
                if (inner) {
                    b.replaceWith(inner);
                    return;
                }
            } catch (e) {
                /* 与 export 一致：非法时保留为段落文本 */
                const p = document.createElement("p");
                p.setAttribute("data-block", "0");
                p.textContent = md;
                b.replaceWith(p);
                return;
            }
        }
        const pr = b.querySelector(".vditor-wysiwyg__image-md__preview");
        const img = pr?.querySelector("img");
        if (img) {
            const p = document.createElement("p");
            p.setAttribute("data-block", "0");
            p.appendChild(img.cloneNode(true));
            b.replaceWith(p);
        } else {
            b.remove();
        }
    });
    return div.innerHTML;
};

/**
 * Spin 后：仅含一个普通图片的段落包成与代码块类似的「pre 源码 + 预览」
 * 不处理 link-ref 图
 */
export const wrapStandaloneImageBlocksAfterSpin = (html: string, vditor: IVditor): string => {
    if (!html.includes("<img") && !html.includes("IMG")) {
        return html;
    }
    const div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll('p[data-block="0"]').forEach((p) => {
        if (p.children.length !== 1 || p.children[0].tagName !== "IMG") {
            return;
        }
        const img = p.children[0] as HTMLImageElement;
        if (img.getAttribute("data-type") === "link-ref") {
            return;
        }
        const imgEl = p.removeChild(p.children[0]) as HTMLImageElement;
        const md = buildMarkdownImageFromImgElement(imgEl);
        const wrap = document.createElement("div");
        wrap.className = "vditor-wysiwyg__block";
        wrap.setAttribute("data-block", "0");
        wrap.setAttribute("data-type", "image-md-block");
        const pre = document.createElement("pre");
        pre.className = "vditor-wysiwyg__image-md__src";
        pre.style.display = "none";
        const code = document.createElement("code");
        code.className = "vditor-wysiwyg__image-md__code";
        code.textContent = md;
        pre.appendChild(code);
        const pr = document.createElement("div");
        pr.className = "vditor-wysiwyg__preview vditor-wysiwyg__image-md__preview";
        pr.setAttribute("data-render", "1");
        pr.appendChild(imgEl);
        wrap.appendChild(pre);
        wrap.appendChild(pr);
        appendImageMdBlockChrome(wrap, pr, vditor);
        p.replaceWith(wrap);
    });
    return div.innerHTML;
};

export const applyWrapStandaloneImageBlocks = (root: HTMLElement, vditor: IVditor) => {
    root.innerHTML = wrapStandaloneImageBlocksAfterSpin(root.innerHTML, vditor);
};

/** getMarkdown 前：用 code 中 Markdown 行还原为 Lute 能转的 DOM */
export const unwrapImageMdBlocksForExport = (html: string, vditor: IVditor): string => {
    if (!html.includes("image-md-block")) {
        return html;
    }
    const div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll('[data-type="image-md-block"]').forEach((b) => {
        const code = b.querySelector(".vditor-wysiwyg__image-md__code");
        const md = (code as HTMLElement | null)?.textContent?.trim() || "";
        if (!md) {
            const pr = b.querySelector(".vditor-wysiwyg__image-md__preview img") as HTMLImageElement | null;
            if (pr) {
                const p = document.createElement("p");
                p.setAttribute("data-block", "0");
                p.appendChild(pr.cloneNode(true));
                b.replaceWith(p);
            } else {
                b.remove();
            }
            return;
        }
        try {
            const out = vditor.lute.Md2VditorDOM(md);
            const t = document.createElement("div");
            t.innerHTML = out;
            const inner = t.firstElementChild;
            if (inner) {
                b.replaceWith(inner);
            } else {
                b.remove();
            }
        } catch (e) {
            const p = document.createElement("p");
            p.setAttribute("data-block", "0");
            p.textContent = md;
            b.replaceWith(p);
        }
    });
    return div.innerHTML;
};

/** 失焦时：用 Markdown 行更新 <img>，并同步到 code 文本；失败不隐藏 pre */
export const syncImageMdBlockFromCode = (block: HTMLElement, vditor: IVditor) => {
    const code = block.querySelector(".vditor-wysiwyg__image-md__code") as HTMLElement | null;
    const pre = block.querySelector(".vditor-wysiwyg__image-md__src") as HTMLElement | null;
    const preview = block.querySelector(".vditor-wysiwyg__image-md__preview") as HTMLElement | null;
    if (!code || !pre || !preview) {
        return;
    }
    const md = code.textContent?.trim() || "";
    if (!md) {
        return;
    }
    try {
        const out = vditor.lute.Md2VditorDOM(md);
        const t = document.createElement("div");
        t.innerHTML = out;
        const newImg = t.querySelector("img") as HTMLImageElement | null;
        if (newImg) {
            preview.innerHTML = "";
            preview.appendChild(newImg);
            code.textContent = buildMarkdownImageFromImgElement(
                preview.querySelector("img") as HTMLImageElement);
            pre.style.display = "none";
        }
    } catch (e) {
        /* 非法语法：保持 pre 可见 */
    }
};
