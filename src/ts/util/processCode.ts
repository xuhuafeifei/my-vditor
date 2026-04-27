import {codeRender} from "../markdown/codeRender";
import {highlightRender} from "../markdown/highlightRender";
import {mathRender} from "../markdown/mathRender";
import {mermaidRender} from "../markdown/mermaidRender";
import {markmapRender} from "../markdown/markmapRender";
import {plantumlRender} from "../markdown/plantumlRender";

export const processPasteCode = (html: string, text: string, type = "sv") => {
    const tempElement = document.createElement("div");
    tempElement.innerHTML = html;
    let isCode = false;
    if (tempElement.childElementCount === 1 &&
        (tempElement.lastElementChild as HTMLElement).style.fontFamily.indexOf("monospace") > -1) {
        // VS Code
        isCode = true;
    }
    const pres = tempElement.querySelectorAll("pre");
    if (tempElement.childElementCount === 1 && pres.length === 1
        && pres[0].className !== "vditor-wysiwyg"
        && pres[0].className !== "vditor-sv") {
        // IDE
        isCode = true;
    }
    if (html.indexOf('\n<p class="p1">') === 0) {
        // Xcode
        isCode = true;
    }
    if (tempElement.childElementCount === 1 && tempElement.firstElementChild.tagName === "TABLE" &&
        tempElement.querySelector(".line-number") && tempElement.querySelector(".line-content")) {
        // 网页源码
        isCode = true;
    }

    if (isCode) {
        const code = text || html;
        const hasNewline = /\r?\n/.test(code);
        // IDE 复制单行通常也会包一层 <pre>，但这类内容不应强制转为代码块
        if (pres.length === 1 && !hasNewline) {
            return false;
        }
        if (hasNewline || pres.length === 1) {
            if (type === "wysiwyg") {
                return `<div class="vditor-wysiwyg__block" data-block="0" data-type="code-block"><pre><code>${
                    code.replace(/&/g, "&amp;").replace(/</g, "&lt;")}<wbr></code></pre></div>`;
            }
            return "\n```\n" + code.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "\n```";
        } else {
            if (type === "wysiwyg") {
                return `<code>${code.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code><wbr>`;
            }
            return `\`${code}\``;
        }
    }
    return false;
};

export const processCodeRender = (previewPanel: HTMLElement, vditor: IVditor) => {
    if (!previewPanel) {
        return;
    }
    if (previewPanel.parentElement.getAttribute("data-type") === "html-block") {
        previewPanel.setAttribute("data-render", "1");
        return;
    }
    const language = previewPanel.firstElementChild.className.replace("language-", "");
    if (language === "mermaid") {
        mermaidRender(previewPanel, vditor.options.cdn, vditor.options.theme);
    } else if (language === "markmap") {
        markmapRender(previewPanel, vditor.options.cdn);
    } else if (language === "plantuml") {
        plantumlRender(previewPanel, vditor.options.cdn);
    } else if (language === "math") {
        mathRender(previewPanel, {cdn: vditor.options.cdn, math: vditor.options.preview.math});
    } else {
        const cRender = vditor.options.customRenders.find((item) => {
            if (item.language === language) {
                item.render(previewPanel, vditor);
                return true
            }
        })
        if (!cRender) {
            highlightRender(Object.assign({}, vditor.options.preview.hljs), previewPanel, vditor.options.cdn);
            codeRender(previewPanel, vditor.options.preview.hljs);
        }
    }

    previewPanel.setAttribute("data-render", "1");
};

/**
 * 「非代码」渲染语言集合：这些语言不是给人读的源码，而是被专门的 render 函数
 * （mermaid、math 等）转成图像/公式/图表，因此不应该走可编辑高亮路径，
 * 必须保留 Vditor 原有的「藏 pre、显 preview」切换。
 * 这张清单需要与本文件上方 processCodeRender 的 if-else 分支保持同步。
 */
const NON_CODE_RENDER_LANGUAGES = new Set([
    "plantuml", "mermaid",
    "math", "markmap", "smiles",
]);

/**
 * 常见语言别名 → hljs 规范名的映射。
 * 用户往往写 `js`/`py`/`c#` 等惯用缩写，而 hljs.getLanguage 只认 `javascript`/`python`/
 * `csharp`。这一层只做"归一"，不做"是否存在"的判断。
 */
const LANG_ALIASES: Record<string, string> = {
    "c#": "csharp",
    "c++": "cpp",
    js: "javascript",
    ts: "typescript",
    py: "python",
    sh: "bash",
    yml: "yaml",
    md: "markdown",
    rs: "rust",
    kt: "kotlin",
};

/**
 * 把用户写的语言 id 规整成小写、去空格、过别名表的形式。
 * 所有后续"是否代码 / 能否高亮"的判定都应该先过这个函数。
 */
export const normalizeCodeLang = (raw: string): string => {
    const t = (raw || "").trim().toLowerCase();
    if (!t) {
        return "";
    }
    return LANG_ALIASES[t] || t;
};

/** 语言是否属于「必须走 processCodeRender 渲染为图表/公式」的一类。 */
export const isNonCodeRenderLanguage = (rawLang: string): boolean => {
    return NON_CODE_RENDER_LANGUAGES.has(normalizeCodeLang(rawLang));
};

/**
 * 判断一个代码块是否应该进入「可编辑高亮」路径（内部仍沿用 island 这个旧名字）。
 * 决策树：
 *   1. 明确是 mermaid/math 等渲染语言 → false（让 processCodeRender 接手）；
 *   2. 命中用户注册的 customRenders → false（交给用户自己的渲染函数）；
 *   3. 空语言（```\n...\n```） → true，按纯文本处理仍然可编辑；
 *   4. hljs 已加载：getLanguage 认识就 true；txt/text/plain 回退 plaintext；其它 false；
 *   5. hljs 未加载（首屏）：按"看起来像合法语言 id"兜底放行，等脚本加载完再重绘一次即可。
 */
export const isIslandCodeBlockLanguage = (rawLang: string, vditor: IVditor): boolean => {
    if (isNonCodeRenderLanguage(rawLang)) {
        return false;
    }
    const lang = normalizeCodeLang(rawLang);
    if (vditor.options.customRenders?.some((item) => (item.language || "") === lang)) {
        return false;
    }
    if (!lang) {
        return true;
    }
    const w = window as Window & {hljs?: {getLanguage: (l: string) => unknown; listLanguages?: () => string[]}};
    if (w.hljs && typeof w.hljs.getLanguage === "function") {
        if (w.hljs.getLanguage(lang)) {
            return true;
        }
        // 常见的 plain/text 别名在许多 hljs build 里叫 plaintext
        if (lang === "txt" || lang === "text" || lang === "plain") {
            return !!w.hljs.getLanguage("plaintext");
        }
        return false;
    }
    // hljs 脚本还没加载完：允许看起来像语言 id 的字符串先进可编辑路径，避免首屏闪烁
    return lang.length < 32 && /^\w[\w\-#+]*$/.test(lang);
};
