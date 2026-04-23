/**
 * 空图片语法 `![]()` 在 Lute 中会被整段去掉，导致无法再编辑。
 * 使用内联 SVG data URL 作占位，导出 Markdown 时再还原为 `![]()`。
 */
const VDITOR_EMPTY_IMAGE_PLACEHOLDER_SVG = [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\">",
    '<path d="M967.107765 120.470588C998.520471 120.470588 1024 145.950118 1024 177.362824V876.724706A56.892235 56.892235 0 0 1 967.107765 933.647059H56.922353A56.892235 56.892235 0 0 1 0 876.754824V177.392941C0 145.950118 25.479529 120.470588 56.892235 120.470588H967.077647z m0 56.892236H56.922353V876.724706H967.077647V177.392941z" fill="#a6e0aa"/>',
    '<path d="M910.215529 641.385412c0-6.234353-3.011765-12.047059-7.951058-15.269647l-178.838589-117.458824a15.811765 15.811765 0 0 0-21.473882 3.97553l-78.817882 103.454117-1.054118 1.355294a15.992471 15.992471 0 0 1-11.745882 5.240471 15.992471 15.992471 0 0 1-11.745883-5.240471l-262.144-281.750588a15.781647 15.781647 0 0 0-22.919529-0.572235l-194.319059 190.765176a18.492235 18.492235 0 0 0-5.421176 13.221647v282.142118h796.431058v-179.862588z m-147.877647-340.992a68.035765 68.035765 0 0 0 68.246589 67.794823 68.035765 68.035765 0 0 0 68.246588-67.794823 68.005647 68.005647 0 0 0-68.246588-67.764706 68.005647 68.005647 0 0 0-68.276706 67.764706z" fill="#a6e0aa"/>',
    "</svg>",
].join("");

export const VDITOR_EMPTY_IMAGE_PLACEHOLDER_SRC =
    "data:image/svg+xml," + encodeURIComponent(VDITOR_EMPTY_IMAGE_PLACEHOLDER_SVG);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const isVditorEmptyImagePlaceholderSrc = (src: string | null | undefined): boolean =>
    (src || "").trim() === VDITOR_EMPTY_IMAGE_PLACEHOLDER_SRC;

/** 将正文里的 `![]()` / `![x]()` 等空地址语法在 Spin 前替换为可保留的 <img> */
export const injectEmptyMarkdownImagesAsHtml = (html: string): string =>
    html.replace(
        /!\[([^\]]*)\]\(\s*\)/g,
        (_all, alt: string) =>
            `<img alt="${alt.replace(/"/g, "&quot;")}" class="vditor-img--placeholder" src="${VDITOR_EMPTY_IMAGE_PLACEHOLDER_SRC}">`,
    );

const patchImgs = (root: Element) => {
    root.querySelectorAll("img").forEach((img) => {
        const s = (img.getAttribute("src") || "").trim();
        if (!s) {
            img.setAttribute("src", VDITOR_EMPTY_IMAGE_PLACEHOLDER_SRC);
            img.classList.add("vditor-img--placeholder");
        } else if (s === VDITOR_EMPTY_IMAGE_PLACEHOLDER_SRC) {
            img.classList.add("vditor-img--placeholder");
        }
    });
};

export const patchEmptyImageSrcInHtml = (html: string): string => {
    if (!html || (!html.includes("<img") && !html.includes("IMG"))) {
        return html;
    }
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    patchImgs(wrap);
    return wrap.innerHTML;
};

export const patchEmptyImageInElement = (root: Element | null | undefined) => {
    if (!root) {
        return;
    }
    patchImgs(root);
};

/** 将 Markdown 中「仅空链接」的写法展开为内联 data URL，供 Md2Vditor* 稳定生成 <img> */
export const expandEmptyImageInMarkdown = (md: string): string =>
    md.replace(
        /!\[([^\]]*)\]\(\s*\)/g,
        (_all, alt: string) => `![${alt}](${VDITOR_EMPTY_IMAGE_PLACEHOLDER_SRC})`,
    );

export const stripEmptyImagePlaceholderFromMarkdown = (md: string): string =>
    md.replace(
        new RegExp(
            `!\\[([^\\]]*)\\]\\(\\s*${escapeRe(VDITOR_EMPTY_IMAGE_PLACEHOLDER_SRC)}\\s*\\)`,
            "g",
        ),
        (_all, alt: string) => (alt ? `![${alt}]()` : `![]()`),
    );

/** 小工具条里编辑地址：占位符不展示成长 data URL */
export const displaySrcInImagePopover = (src: string | null | undefined): string => {
    if (isVditorEmptyImagePlaceholderSrc(src)) {
        return "";
    }
    return (src || "").trim();
};

export const valueToImageSrcForUpdate = (value: string): string => {
    const t = value.trim();
    return t || VDITOR_EMPTY_IMAGE_PLACEHOLDER_SRC;
};
