import {addScript} from "../util/addScript";
import {normalizeCodeLang} from "../util/processCode";

const HL_LANG_ATTR = "data-vditor-ir-hl-lang";

const getCaretOffset = (root: HTMLElement): {start: number; end: number} | null => {
    const sel = root.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0) {
        return null;
    }
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        return null;
    }
    const pre = range.cloneRange();
    pre.selectNodeContents(root);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    return {start, end: start + range.toString().length};
};

const setCaretOffset = (root: HTMLElement, start: number, end: number) => {
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let acc = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    let n: Node | null = walker.nextNode();
    while (n) {
        const t = n as Text;
        const len = t.data.length;
        if (!startNode && start <= acc + len) {
            startNode = t;
            startOffset = Math.max(0, start - acc);
        }
        if (!endNode && end <= acc + len) {
            endNode = t;
            endOffset = Math.max(0, end - acc);
            break;
        }
        acc += len;
        n = walker.nextNode();
    }

    const range = doc.createRange();
    if (startNode && endNode) {
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
    } else {
        range.selectNodeContents(root);
        range.collapse(false);
    }
    const sel = doc.getSelection();
    if (!sel) {
        return;
    }
    sel.removeAllRanges();
    sel.addRange(range);
};

const escapeHtml = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const getRawLang = (code: HTMLElement): string => {
    const m = (code.getAttribute("class") || "").match(/language-([\w#+\-]+)/);
    return m ? m[1] : "";
};

const shouldHighlightInIR = (rawLang: string): boolean => {
    const lang = normalizeCodeLang(rawLang);
    if (!lang) {
        return true;
    }
    // 非源码渲染语言仍走 preview，不在 marker 区高亮
    if (["mermaid", "plantuml", "math", "markmap", "smiles"].includes(lang)) {
        return false;
    }
    return true;
};

const ensureHljs = (cdn: string): Promise<void> => {
    const w = window as Window & {hljs?: unknown};
    if (w.hljs) {
        return Promise.resolve();
    }
    return addScript(
        `${cdn}/dist/js/highlight.js/highlight.min.js?v=11.7.0`,
        "vditorHljsScript",
    ).then(() => addScript(
        `${cdn}/dist/js/highlight.js/third-languages.js?v=1.0.1`,
        "vditorHljsThirdScript",
    )).then(() => undefined);
};

const highlightCode = (code: HTMLElement, preserveCaret: boolean) => {
    const text = code.textContent || "";
    const rawLang = getRawLang(code);
    if (!shouldHighlightInIR(rawLang)) {
        code.classList.remove("hljs");
        code.removeAttribute(HL_LANG_ATTR);
        return;
    }

    const w = window as Window & {hljs?: {highlight: (src: string, opts: {language: string; ignoreIllegals: boolean}) => {value: string}; getLanguage: (lang: string) => unknown}};
    const lang = normalizeCodeLang(rawLang) || "plaintext";
    const resolvedLang = w.hljs?.getLanguage(lang) ? lang : "plaintext";
    const html = w.hljs ? w.hljs.highlight(text, {language: resolvedLang, ignoreIllegals: true}).value : escapeHtml(text);
    const caret = preserveCaret ? getCaretOffset(code) : null;
    code.innerHTML = html;
    code.classList.add("hljs");
    if (rawLang) {
        code.setAttribute(HL_LANG_ATTR, rawLang);
    } else {
        code.removeAttribute(HL_LANG_ATTR);
    }
    if (caret) {
        try {
            setCaretOffset(code, caret.start, caret.end);
        } catch {
            // ignore caret restore errors
        }
    }
};

export const refreshIRFencedCodeIn = (root: Element | null, vditor: IVditor) => {
    if (!root) {
        return;
    }
    const run = () => {
        root.querySelectorAll<HTMLElement>(".vditor-ir__marker--pre > code").forEach((code) => {
            const sel = code.ownerDocument.getSelection();
            const preserveCaret = !!sel && sel.rangeCount > 0 &&
                code.contains(sel.getRangeAt(0).startContainer) &&
                code.contains(sel.getRangeAt(0).endContainer);
            highlightCode(code, preserveCaret);
        });
    };
    run();
    void ensureHljs(vditor.options.cdn).then(() => {
        if (!root.isConnected) {
            return;
        }
        run();
    });
};

