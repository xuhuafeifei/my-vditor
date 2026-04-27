import {addScript} from "../util/addScript";
import {isIslandCodeBlockLanguage, normalizeCodeLang} from "../util/processCode";

/**
 * 围栏代码块「所见即所得」高亮编辑（Typora / MarkText 思路）
 * =====================================================
 *
 * 背景
 * ----
 * Vditor 原本对围栏代码块的处理是「源码 pre + 渲染 preview」两个兄弟节点之间切换：光标进入
 * 时展示 pre（可编辑源码、无高亮），光标离开时展示 preview（只读、有高亮）。这带来体验割裂：
 * 编辑时看不到颜色。
 *
 * 本模块把编程语言的代码块（java/json/python…）改造成「pre>code 自身就是 hljs 渲染区」，
 * 并保持 contenteditable 可编辑。mermaid/math 等非代码的渲染语言不受影响，继续
 * 走原有 processCodeRender + preview 的经典路径。
 *
 * 数据流
 * ------
 *   用户敲键
 *     │
 *     ▼
 *   code 上的 input 事件（节流 80ms）
 *     │
 *     ├─ 读 code.textContent（纯文本 = 唯一真相，与 Lute 导出一致）
 *     ├─ 记录 caret 在 textContent 中的 [start,end] offset
 *     ├─ hljs.highlight(text, lang) → span 化的 HTML
 *     ├─ code.innerHTML = html
 *     └─ TreeWalker 按 offset 还原 caret
 *
 * 关键不变量
 * ---------
 * 1. code.textContent 始终等于用户实际输入的源码（hljs 的 span 不改变 textContent）。
 * 2. Vditor 导出 Markdown 走 lute.VditorDOM2Md，对 `<pre><code>` Lute 只认 textContent，
 *    所以 span 不会污染 markdown。
 * 3. 光标位置用「相对 code 根节点的 textContent offset」表示，span 重建后仍能精确还原。
 *
 * 为什么不是 textarea + 透明叠层
 * -----------------------------
 * 叠层方案要求两层字体 metrics / 换行 / tab-size 完全一致，IME 与搜索体验也差，
 * 且会塌陷为 0 高度。这里直接让 code 自身 contenteditable，metrics 天然一致，
 * 就是 Typora 的做法。代价是每次输入都要重建 innerHTML，但节流 80ms 对常规文件性能够用。
 */

// ============ 常量 ============

/** 已经绑定过 input/paste/compositionend 事件监听的 code 元素会打这个标，避免重复绑定。 */
const HL_BOUND_ATTR = "data-vditor-hl-bound";
/** 记录 code 当前使用的原始语言 id，调试/排查时能快速看到。 */
const HL_LANG_ATTR = "data-vditor-hl-lang";
/**
 * 标记「这个 code-block 由本模块接管，走可编辑高亮路径」。
 * Vditor 其它地方有若干「光标不在代码块内就把 pre 藏起来」的逻辑（高亮工具栏、
 * 列表缩进修正、Esc 等），都需要读这个标记来跳过，否则鼠标一移出代码块就消失。
 */
export const EDIT_FLAG_ATTR = "data-vditor-code-edit";
/**
 * 节流窗口。太短会在连续敲击时频繁重建 DOM 导致卡顿，太长会让颜色"跟手"感差。
 * 80ms 是折中：单次按键几乎察觉不到延迟，连击时把多次键入合并成一次重绘。
 */
const HL_DEBOUNCE_MS = 80;

/**
 * 判断一个 .vditor-wysiwyg__block 节点是否处于「可编辑高亮」模式。
 * 提供给 Vditor 既有逻辑（highlightToolbar / processKeydown / listIndent）做分叉。
 */
export const isEditableCodeBlock = (block: Element | null): boolean => {
    return !!block && (block as HTMLElement).getAttribute(EDIT_FLAG_ATTR) === "1";
};

// ============ caret 工具：基于 textContent offset ============
//
// 浏览器 Selection/Range 指向的是具体 Text 节点 + 节点内偏移；一旦我们重写 innerHTML，
// 原来的 Text 节点就不存在了，Range 也会失效。所以重绘前先把「Range 在整个 code 文本流里
// 的字符偏移」记下来，重绘后按偏移在新 DOM 里找到对应 Text 节点，重建 Range。
//

/**
 * 读取当前 Selection 相对于 root 的字符偏移区间 [start, end)。
 * 若 Selection 不落在 root 内部或不存在，返回 null。
 *
 * 实现：克隆一个 Range，把起点扩展到 root 开头，终点仍为原 Range 的 start，
 * 这段子串的长度就是 start 偏移；再加上 Range 本身的字符串长度得到 end。
 */
const getCaretOffset = (root: HTMLElement): {start: number; end: number} | null => {
    const sel = root.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0) {
        return null;
    }
    const range = sel.getRangeAt(0);
    // 若用户点在别的 block 里了，不要误把别处的偏移当成自己的
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        return null;
    }
    const pre = range.cloneRange();
    pre.selectNodeContents(root);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    return {start, end: start + range.toString().length};
};

/**
 * 在 root 的新 DOM 里按 [start, end] 字符偏移重建 Selection。
 *
 * 用 TreeWalker 只遍历文本节点，累加每个 Text 的 data.length，当累加值覆盖到目标偏移时，
 * 就把起点/终点落在该 Text 节点内。这样不管 hljs 把 DOM 切成多少层 span 嵌套，定位都是
 * 线性的，且永远走文本流。
 *
 * 若偏移越过了末尾（例如删除后长度变短），就回落到"文本末尾"，避免 Range 抛异常。
 */
const setCaretOffset = (root: HTMLElement, start: number, end: number) => {
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let acc = 0;                                // 已累加的字符数
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    let n: Node | null = walker.nextNode();
    while (n) {
        const t = n as Text;
        const len = t.data.length;
        // 第一次覆盖到 start：把 start 锚定在这个 Text 上
        if (!startNode && start <= acc + len) {
            startNode = t;
            startOffset = Math.max(0, start - acc);
        }
        // 第一次覆盖到 end：锚定 end，提早 break
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
        // 偏移越界：collapse 到内容最末尾
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

// ============ hljs 懒加载与语言兜底 ============

/**
 * 首次用到代码块时才加载 hljs（以及第三方语言扩展）。
 * 与 Vditor 既有 markdown/highlightRender.ts 走同样的 CDN 路径与脚本 id，
 * 这样两边只会各加载一份，script 元素通过 id 去重。
 */
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

/**
 * 把用户写的语言 id 规整成 hljs 真正能识别的语言名：
 * - 先过一层别名表（js→javascript、py→python…）；
 * - 如果 hljs 仍不认，回退到 plaintext（只转义、不上色）。
 * 不用 getLanguage() 报错链路，而是用"返回 plaintext"兜底，保证 highlight() 一定有结果。
 */
const resolveHljsLang = (rawLang: string): string => {
    const w = window as Window & {hljs?: {getLanguage: (l: string) => unknown}};
    const n = normalizeCodeLang(rawLang) || "plaintext";
    if (!w.hljs) {
        return n;
    }
    if (w.hljs.getLanguage(n)) {
        return n;
    }
    return w.hljs.getLanguage("plaintext") ? "plaintext" : n;
};

/** 纯文本 → HTML 安全转义。hljs 未就绪时作为降级展示（至少不会把 `<` 吞掉）。 */
const escapeHtml = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * 调 hljs 得到带 span 的 HTML；失败或未加载时降级为转义文本。
 * ignoreIllegals: true —— 用户写到一半的代码往往语法不合法，不能因此抛错影响输入。
 */
const highlightHTML = (text: string, rawLang: string): string => {
    const w = window as Window & {hljs?: {highlight: (code: string, opts: {language: string; ignoreIllegals: boolean}) => {value: string}}};
    const lang = resolveHljsLang(rawLang);
    if (!w.hljs) {
        return escapeHtml(text);
    }
    try {
        return w.hljs.highlight(text, {language: lang, ignoreIllegals: true}).value;
    } catch {
        return escapeHtml(text);
    }
};

// ============ 重绘 ============

/** 从 code.className 里提取 `language-xxx` 的 xxx；没有就返回 ''。 */
const getRawLang = (code: HTMLElement): string => {
    const m = (code.getAttribute("class") || "").match(/language-([\w#+\-]+)/);
    return m ? m[1] : "";
};

/**
 * 用当前 textContent + 当前语言 id 重建 code.innerHTML，并按需保持光标。
 *
 * preserveCaret: 只有当 Selection 落在 code 内部时才应该传 true；否则会错误地把用户
 *                在别处的光标拉进代码块。
 *
 * 注意：本函数是幂等的 —— 即便 innerHTML 原本就已是高亮后的 span，我们读 textContent
 *      仍是正确源码，再画一次结果相同。所以「重复刷新」是安全的。
 */
const repaint = (code: HTMLElement, options: {preserveCaret: boolean}) => {
    const text = code.textContent || "";
    const rawLang = getRawLang(code);
    const html = highlightHTML(text, rawLang);

    // 先读 caret，再覆盖 innerHTML，最后还原。顺序不能颠倒。
    let caret: {start: number; end: number} | null = null;
    if (options.preserveCaret) {
        caret = getCaretOffset(code);
    }
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
            // 单次失败不应影响用户继续输入，静默忽略
        }
    }
};

/**
 * 给一个 code 元素绑上输入相关的监听：input、compositionend、paste。
 * 用 HL_BOUND_ATTR 做幂等，避免在 refreshFencedCode 多次被调用时叠加监听。
 *
 * 节流：setTimeout 替代 rAF 是因为 rAF 在后台 tab 里会被冻结，而我们希望
 *      即便 tab 不在前台，后续切回来也能看到最终颜色。
 */
const bindCode = (code: HTMLElement, vditor: IVditor) => {
    if (code.getAttribute(HL_BOUND_ATTR) === "1") {
        return;
    }
    code.setAttribute(HL_BOUND_ATTR, "1");

    let timer: number | undefined;
    const schedule = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
            // 用户可能已经把块删了（比如全选 Backspace），此时不要再 repaint
            if (!code.isConnected) {
                return;
            }
            repaint(code, {preserveCaret: true});
        }, HL_DEBOUNCE_MS);
    };

    // 普通键入
    code.addEventListener("input", schedule);
    // IME 中文输入：compositionend 才是最终确认的时刻，input 事件里会有中间态
    code.addEventListener("compositionend", schedule);

    // 粘贴：强制 text/plain，避免把 IDE/网页带样式的 HTML 粘进 code，
    // 那会破坏「code.textContent 即源码」这个不变量。
    code.addEventListener("paste", (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData("text/plain");
        if (text == null) {
            return;
        }
        e.preventDefault();
        const sel = code.ownerDocument.getSelection();
        if (!sel || sel.rangeCount === 0) {
            return;
        }
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        schedule();
    });
};

// ============ 对外 API ============

/**
 * 对一个 `.vditor-wysiwyg__block[data-type=code-block]` 节点执行「状态刷新」：
 *
 * 1. 读出 code 的语言：
 *    - 若属于「island 集合」（编程语言、非 mermaid/math/custom）→ 启用可编辑高亮；
 *    - 否则 → 拆除本模块的标记，回到经典 pre/preview 切换路径。
 *
 * 2. 对 island 块：
 *    - 打 EDIT_FLAG_ATTR；
 *    - 明确把 pre 设为可见、preview 设为隐藏（对抗 Vditor 别处的"藏 pre"副作用）；
 *    - 绑定输入监听（幂等）；
 *    - 立即画一次（hljs 可能还没加载，此时只转义）；
 *    - hljs 加载完成后再画一次真正的上色。
 *
 * 这个函数是幂等的，任何时候调用都能把块修正到正确状态。
 */
export const refreshFencedCode = (block: HTMLElement, vditor: IVditor) => {
    if (!block || block.getAttribute("data-type") !== "code-block") {
        return;
    }
    const code = block.querySelector(":scope > pre > code") as HTMLElement | null;
    if (!code) {
        return;
    }

    const rawLang = getRawLang(code);
    if (!isIslandCodeBlockLanguage(rawLang, vditor)) {
        // 当语言被改成 mermaid/math 这类渲染语言时，把我们之前加过的标记清掉，
        // 让 Vditor 原生的 preview 逻辑重新接管显示。
        code.removeAttribute(HL_LANG_ATTR);
        block.removeAttribute(EDIT_FLAG_ATTR);
        return;
    }

    // 进入可编辑高亮模式：pre 常驻显示、preview 藏
    block.setAttribute(EDIT_FLAG_ATTR, "1");
    const preview = block.querySelector(":scope > .vditor-wysiwyg__preview") as HTMLElement | null;
    if (preview) {
        preview.style.display = "none";
    }
    const pre = block.querySelector(":scope > pre") as HTMLElement | null;
    if (pre) {
        pre.style.display = "";
        // 加个 class 方便 less 精确选中
        pre.classList.add("vditor-wysiwyg__code-pre");
    }

    bindCode(code, vditor);

    // 只有光标真的落在当前 code 内部时，才把重绘时的 caret 保持住；
    // 否则（例如刚从别的 block 渲染过来）不要抢走光标。
    const selInCode = (): boolean => {
        const sel = code.ownerDocument.getSelection();
        if (!sel || sel.rangeCount === 0) {
            return false;
        }
        const r = sel.getRangeAt(0);
        return code.contains(r.startContainer) && code.contains(r.endContainer);
    };

    void ensureHljs(vditor.options.cdn).then(() => {
        if (!code.isConnected) {
            return;
        }
        repaint(code, {preserveCaret: selInCode()});
    });
    // 先同步画一次；hljs 还没来就是转义文本，避免首帧"无色闪烁"
    repaint(code, {preserveCaret: selInCode()});
};

/** 批量：对 root 下所有 code-block 调 refreshFencedCode。用于整体渲染/ spin 之后。 */
export const refreshFencedCodeIn = (root: Element | null, vditor: IVditor) => {
    if (!root) {
        return;
    }
    root.querySelectorAll<HTMLElement>(`[data-type="code-block"]`).forEach((b) => {
        refreshFencedCode(b, vditor);
    });
};

/**
 * 纯查询：一个 block 在当前语言下"应不应该走可编辑高亮"。
 * 外部路由逻辑可以据此提前分叉（比如在 refresh 之前就跳过某些旧逻辑）。
 */
export const isFencedCodeEditing = (block: Element | null, vditor: IVditor): boolean => {
    if (!block) {
        return false;
    }
    const code = (block as HTMLElement).querySelector(":scope > pre > code") as HTMLElement | null;
    if (!code) {
        return false;
    }
    return isIslandCodeBlockLanguage(getRawLang(code), vditor);
};
