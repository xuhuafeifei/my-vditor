import {Constants} from "../constants";
import {hidePanel} from "../toolbar/setToolbar";
import {isCtrl, isFirefox} from "../util/compatibility";
import {
    blurEvent,
    copyEvent, cutEvent, dblclickEvent,
    dropEvent,
    focusEvent,
    hotkeyEvent,
    scrollCenter,
    selectEvent,
} from "../util/editorCommonEvent";
import {isHeadingMD, isHrMD, paste} from "../util/fixBrowserBehavior";
import {
    hasClosestBlock, hasClosestByAttribute,
    hasClosestByClassName, hasClosestByMatchTag,
} from "../util/hasClosest";
import {hasClosestByHeadings} from "../util/hasClosestByHeadings";
import {
    getCursorPosition,
    getEditorRange,
    getSelectPosition,
    setRangeByWbr, setSelectionFocus,
} from "../util/selection"
import {clickToc, renderToc} from "../util/toc";
import {afterRenderEvent} from "./afterRenderEvent";
import {genLinkRefPopover, highlightToolbarWYSIWYG} from "./highlightToolbarWYSIWYG";
import {syncImageMdBlockFromCode, unwrapImageMdBlocksForSpin, wrapStandaloneImageBlocksAfterSpin} from "./imageMdBlock";
import {patchEmptyImageSrcInHtml} from "../util/emptyImagePlaceholder";
import {getRenderElementNextNode, modifyPre} from "./inlineTag";
import {input} from "./input";
import {showCode} from "./showCode";
import {getMarkdown} from "../markdown/getMarkdown";
import {previewImage} from "../preview/image";

class WYSIWYG {
    public range: Range;
    public element: HTMLPreElement;
    public popover: HTMLDivElement;
    public selectPopover: HTMLDivElement;
    public afterRenderTimeoutId: number;
    public hlToolbarTimeoutId: number;
    public preventInput: boolean;
    public composingLock = false;
    public commentIds: string[] = [];
    private scrollListener: () => void;

    constructor(vditor: IVditor) {
        const divElement = document.createElement("div");
        divElement.className = "vditor-wysiwyg";

        divElement.innerHTML = `<pre class="vditor-reset" placeholder="${vditor.options.placeholder}"
 contenteditable="true" spellcheck="false"></pre>
<div class="vditor-panel vditor-panel--none"></div>
<div class="vditor-panel vditor-panel--none">
    <button type="button" aria-label="${window.VditorI18n.comment}" class="vditor-icon vditor-tooltipped vditor-tooltipped__n">
        <svg><use xlink:href="#vditor-icon-comment"></use></svg>
    </button>
</div>`;

        this.element = divElement.firstElementChild as HTMLPreElement;
        this.popover = divElement.firstElementChild.nextElementSibling as HTMLDivElement;
        this.selectPopover = divElement.lastElementChild as HTMLDivElement;

        this.bindEvent(vditor);

        /* contenteditable 内嵌按钮：阻止默认行为，避免选区/焦点抢掉导致 click 不触发预览 */
        this.element.addEventListener("mousedown", (e: MouseEvent) => {
            const from = e.target instanceof Element ? e.target : (e.target as Node).parentElement;
            if (from && from.closest?.("[data-vditor-wysiwyg-image-md-open]")) {
                e.preventDefault();
            }
        }, true);

        focusEvent(vditor, this.element);
        dblclickEvent(vditor, this.element);
        blurEvent(vditor, this.element);
        hotkeyEvent(vditor, this.element);
        selectEvent(vditor, this.element);
        dropEvent(vditor, this.element);
        copyEvent(vditor, this.element, this.copy);
        cutEvent(vditor, this.element, this.copy);

        if (vditor.options.comment.enable) {
            this.selectPopover.querySelector("button").onclick = () => {
                const id = Lute.NewNodeID();
                const range = getSelection().getRangeAt(0);
                const rangeClone = range.cloneRange();
                const contents = range.extractContents();
                let blockStartElement: HTMLElement;
                let blockEndElement: HTMLElement;
                let removeStart = false;
                let removeEnd = false;
                contents.childNodes.forEach((item: HTMLElement, index: number) => {
                    let wrap = false;
                    if (item.nodeType === 3) {
                        wrap = true;
                    } else if (!item.classList.contains("vditor-comment")) {
                        wrap = true;
                    } else if (item.classList.contains("vditor-comment")) {
                        item.setAttribute("data-cmtids", item.getAttribute("data-cmtids") + " " + id);
                    }
                    if (wrap) {
                        if (item.nodeType !== 3 && item.getAttribute("data-block") === "0"
                            && index === 0 && rangeClone.startOffset > 0) {
                            item.innerHTML =
                                `<span class="vditor-comment" data-cmtids="${id}">${item.innerHTML}</span>`;
                            blockStartElement = item;
                        } else if (item.nodeType !== 3 && item.getAttribute("data-block") === "0"
                            && index === contents.childNodes.length - 1
                            && rangeClone.endOffset < rangeClone.endContainer.textContent.length) {
                            item.innerHTML =
                                `<span class="vditor-comment" data-cmtids="${id}">${item.innerHTML}</span>`;
                            blockEndElement = item;
                        } else if (item.nodeType !== 3 && item.getAttribute("data-block") === "0") {
                            if (index === 0) {
                                removeStart = true;
                            } else if (index === contents.childNodes.length - 1) {
                                removeEnd = true;
                            }
                            item.innerHTML =
                                `<span class="vditor-comment" data-cmtids="${id}">${item.innerHTML}</span>`;
                        } else {
                            const commentElement = document.createElement("span");
                            commentElement.classList.add("vditor-comment");
                            commentElement.setAttribute("data-cmtids", id);
                            item.parentNode.insertBefore(commentElement, item);
                            commentElement.appendChild(item);
                        }
                    }
                });
                const startElement = hasClosestBlock(rangeClone.startContainer);
                if (startElement) {
                    if (blockStartElement) {
                        startElement.insertAdjacentHTML("beforeend", blockStartElement.innerHTML);
                        blockStartElement.remove();
                    } else if (startElement.textContent.trim().replace(Constants.ZWSP, "") === "" && removeStart) {
                        startElement.remove();
                    }
                }
                const endElement = hasClosestBlock(rangeClone.endContainer);
                if (endElement) {
                    if (blockEndElement) {
                        endElement.insertAdjacentHTML("afterbegin", blockEndElement.innerHTML);
                        blockEndElement.remove();
                    } else if (endElement.textContent.trim().replace(Constants.ZWSP, "") === "" && removeEnd) {
                        endElement.remove();
                    }
                }
                range.insertNode(contents);
                vditor.options.comment.add(id, range.toString(), this.getComments(vditor, true));
                afterRenderEvent(vditor, {
                    enableAddUndoStack: true,
                    enableHint: false,
                    enableInput: false,
                });
                this.hideComment();
            };
        }
    }

    public getComments(vditor: IVditor, getData = false) {
        if (vditor.currentMode === "wysiwyg" && vditor.options.comment.enable) {
            this.commentIds = [];
            this.element.querySelectorAll(".vditor-comment").forEach((item) => {
                this.commentIds =
                    this.commentIds.concat(item.getAttribute("data-cmtids").split(" "));
            });
            this.commentIds = Array.from(new Set(this.commentIds));

            const comments: ICommentsData[] = [];
            if (getData) {
                this.commentIds.forEach((id) => {
                    comments.push({
                        id,
                        top:
                        (this.element.querySelector(`.vditor-comment[data-cmtids="${id}"]`) as HTMLElement).offsetTop,
                    });
                });
                return comments;
            }
        } else {
            return [];
        }
    }

    public triggerRemoveComment(vditor: IVditor) {
        const difference = (a: string[], b: string[]) => {
            const s = new Set(b);
            return a.filter((x) => !s.has(x));
        };
        if (vditor.currentMode === "wysiwyg" && vditor.options.comment.enable && vditor.wysiwyg.commentIds.length > 0) {
            const oldIds = JSON.parse(JSON.stringify(this.commentIds));
            this.getComments(vditor);
            const removedIds = difference(oldIds, this.commentIds);
            if (removedIds.length > 0) {
                vditor.options.comment.remove(removedIds);
            }
        }
    }

    public showComment() {
        const position = getCursorPosition(this.element);
        this.selectPopover.setAttribute("style", `left:${position.left}px;display:block;top:${Math.max(-8, position.top - 21)}px`);
    }

    public hideComment() {
        this.selectPopover.setAttribute("style", "display:none");
    }

    public unbindListener() {
        window.removeEventListener("scroll", this.scrollListener);
    }

    private copy(event: ClipboardEvent, vditor: IVditor) {
        const range = getSelection().getRangeAt(0);
        if (range.toString() === "") {
            return;
        }
        event.stopPropagation();
        event.preventDefault();

        const codeElement = hasClosestByMatchTag(range.startContainer, "CODE");
        const codeEndElement = hasClosestByMatchTag(range.endContainer, "CODE");
        if (codeElement && codeEndElement && codeEndElement.isSameNode(codeElement)) {
            let codeText = "";
            if (codeElement.parentElement.tagName === "PRE") {
                codeText = range.toString();
            } else {
                codeText = "`" + range.toString() + "`";
            }
            event.clipboardData.setData("text/plain", codeText);
            event.clipboardData.setData("text/html", "");
            return;
        }

        const aElement = hasClosestByMatchTag(range.startContainer, "A");
        const aEndElement = hasClosestByMatchTag(range.endContainer, "A");
        if (aElement && aEndElement && aEndElement.isSameNode(aElement)) {
            let aTitle = aElement.getAttribute("title") || "";
            if (aTitle) {
                aTitle = ` "${aTitle}"`;
            }
            event.clipboardData.setData("text/plain",
                `[${range.toString()}](${aElement.getAttribute("href")}${aTitle})`);
            event.clipboardData.setData("text/html", "");
            return;
        }

        const tempElement = document.createElement("div");
        tempElement.appendChild(range.cloneContents());

        event.clipboardData.setData("text/plain", vditor.lute.VditorDOM2Md(tempElement.innerHTML).trim());
        event.clipboardData.setData("text/html", "");
    }

    private bindEvent(vditor: IVditor) {
        this.unbindListener();
        window.addEventListener("scroll", this.scrollListener = () => {
            hidePanel(vditor, ["hint"]);
            if (this.popover.style.display !== "block" || this.selectPopover.style.display !== "block") {
                return;
            }
            const top = parseInt(this.popover.getAttribute("data-top"), 10);
            if (vditor.options.height !== "auto") {
                if (vditor.options.toolbarConfig.pin && vditor.toolbar.element.getBoundingClientRect().top === 0) {
                    const popoverTop = Math.max(window.scrollY - vditor.element.offsetTop - 8,
                        Math.min(top - vditor.wysiwyg.element.scrollTop, this.element.clientHeight - 21)) + "px";
                    if (this.popover.style.display === "block") {
                        this.popover.style.top = popoverTop;
                    }
                    if (this.selectPopover.style.display === "block") {
                        this.selectPopover.style.top = popoverTop;
                    }
                }
                return;
            } else if (!vditor.options.toolbarConfig.pin) {
                return;
            }
            const popoverTop1 = Math.max(top, (window.scrollY - vditor.element.offsetTop - 8)) + "px";
            if (this.popover.style.display === "block") {
                this.popover.style.top = popoverTop1;
            }
            if (this.selectPopover.style.display === "block") {
                this.selectPopover.style.top = popoverTop1;
            }
        });

        this.element.addEventListener("scroll", () => {
            hidePanel(vditor, ["hint"]);
            if (vditor.options.comment && vditor.options.comment.enable && vditor.options.comment.scroll) {
                vditor.options.comment.scroll(vditor.wysiwyg.element.scrollTop);
            }
            if (this.popover.style.display !== "block") {
                return;
            }
            const top = parseInt(this.popover.getAttribute("data-top"), 10) - vditor.wysiwyg.element.scrollTop;
            let max = -8;
            if (vditor.options.toolbarConfig.pin && vditor.toolbar.element.getBoundingClientRect().top === 0) {
                max = window.scrollY - vditor.element.offsetTop + max;
            }
            const topPx = Math.max(max, Math.min(top, this.element.clientHeight - 21)) + "px";
            this.popover.style.top = topPx;
            this.selectPopover.style.top = topPx;
        });

        this.element.addEventListener("focusout", (e: FocusEvent) => {
            const t = e.target as Node;
            if (t.nodeType === 1) {
                const el = t as HTMLElement;
                if (el.classList.contains("vditor-wysiwyg__image-md__code")) {
                    const block = el.closest?.('[data-type="image-md-block"]') as HTMLElement | null;
                    if (!block) {
                        return;
                    }
                    const rt = e.relatedTarget as Node | null;
                    if (rt && block.contains(rt)) {
                        return;
                    }
                    syncImageMdBlockFromCode(block, vditor);
                }
            }
        }, true);

        this.element.addEventListener("paste", (event: ClipboardEvent & { target: HTMLElement }) => {
            // 浮层打开时焦点常仍在 contenteditable 上，Cmd/Ctrl+V 会进正文；将纯文本改写入浮层内「主」输入框（超链 href，图片为 Typora 式源码编辑）
            if (this.popover.style.display === "block") {
                const redirect = this.popover.querySelector<HTMLInputElement>("[data-vditor-redirect-paste]");
                const trg = event.target;
                if (redirect && trg && this.element.contains(trg as Node) && !this.popover.contains(trg as Node)) {
                    const text = event.clipboardData?.getData("text/plain") ?? "";
                    if (text) {
                        event.preventDefault();
                        event.stopPropagation();
                        redirect.focus();
                        const s = typeof redirect.selectionStart === "number" ? redirect.selectionStart : redirect.value.length;
                        const e = typeof redirect.selectionEnd === "number" ? redirect.selectionEnd : s;
                        redirect.value = redirect.value.substring(0, s) + text + redirect.value.substring(e);
                        const pos = s + text.length;
                        redirect.setSelectionRange(pos, pos);
                        redirect.dispatchEvent(new Event("input", {bubbles: true}));
                        return;
                    }
                }
            }
            paste(vditor, event, {
                pasteCode: (code: string) => {
                    const range = getEditorRange(vditor);
                    const node = document.createElement("template");
                    node.innerHTML = code;
                    range.insertNode(node.content.cloneNode(true));
                    const blockElement = hasClosestByAttribute(range.startContainer, "data-block", "0");
                    if (blockElement) {
                        let h = blockElement.outerHTML;
                        h = unwrapImageMdBlocksForSpin(h, vditor);
                        h = vditor.lute.SpinVditorDOM(h);
                        h = patchEmptyImageSrcInHtml(h);
                        h = wrapStandaloneImageBlocksAfterSpin(h, vditor);
                        blockElement.outerHTML = h;
                    } else {
                        let h = vditor.wysiwyg.element.innerHTML;
                        h = unwrapImageMdBlocksForSpin(h, vditor);
                        h = vditor.lute.SpinVditorDOM(h);
                        h = patchEmptyImageSrcInHtml(h);
                        h = wrapStandaloneImageBlocksAfterSpin(h, vditor);
                        vditor.wysiwyg.element.innerHTML = h;
                    }
                    setRangeByWbr(vditor.wysiwyg.element, range);
                },
            });
        });

        // 中文处理
        this.element.addEventListener("compositionstart", () => {
            this.composingLock = true;
        });

        this.element.addEventListener("compositionend", (event: InputEvent) => {
            const headingElement = hasClosestByHeadings(getSelection().getRangeAt(0).startContainer);
            if (headingElement && headingElement.textContent === "") {
                // heading 为空删除 https://github.com/Vanessa219/vditor/issues/150
                renderToc(vditor);
                return;
            }
            if (!isFirefox()) {
                input(vditor, getSelection().getRangeAt(0).cloneRange(), event);
            }
            this.composingLock = false;
        });

        this.element.addEventListener("input", (event: InputEvent) => {
            if (event.inputType === "deleteByDrag" || event.inputType === "insertFromDrop") {
                // https://github.com/Vanessa219/vditor/issues/801 编辑器内容拖拽问题
                return;
            }
            if (this.preventInput) {
                this.preventInput = false;
                afterRenderEvent(vditor);
                return;
            }
            if (this.composingLock || event.data === "‘" || event.data === "“" || event.data === "《") {
                afterRenderEvent(vditor);
                return;
            }
            const range = getSelection().getRangeAt(0);
            let blockElement = hasClosestBlock(range.startContainer);
            if (!blockElement) {
                // 没有被块元素包裹
                modifyPre(vditor, range);
                blockElement = hasClosestBlock(range.startContainer);
            }
            if (!blockElement) {
                return;
            }

            // 前后空格处理
            const startOffset = getSelectPosition(blockElement, vditor.wysiwyg.element, range).start;

            // 开始可以输入空格
            let startSpace = true;
            for (let i = startOffset - 1; i > blockElement.textContent.substr(0, startOffset).lastIndexOf("\n"); i--) {
                if (blockElement.textContent.charAt(i) !== " " &&
                    // 多个 tab 前删除不形成代码块 https://github.com/Vanessa219/vditor/issues/162 1
                    blockElement.textContent.charAt(i) !== "\t") {
                    startSpace = false;
                    break;
                }
            }
            if (startOffset === 0) {
                startSpace = false;
            }

            // 结尾可以输入空格
            let endSpace = true;
            for (let i = startOffset - 1; i < blockElement.textContent.length; i++) {
                if (blockElement.textContent.charAt(i) !== " " && blockElement.textContent.charAt(i) !== "\n") {
                    endSpace = false;
                    break;
                }
            }

            // https://github.com/Vanessa219/vditor/issues/729
            if (endSpace && /^#{1,6} $/.test(blockElement.textContent)) {
                endSpace = false;
            }

            const headingElement = hasClosestByHeadings(getSelection().getRangeAt(0).startContainer);
            if (headingElement && headingElement.textContent === "") {
                // heading 为空删除 https://github.com/Vanessa219/vditor/issues/150
                renderToc(vditor);
                headingElement.remove();
            }

            if ((startSpace && blockElement.getAttribute("data-type") !== "code-block")
                || endSpace || isHeadingMD(blockElement.innerHTML) ||
                (isHrMD(blockElement.innerHTML) && blockElement.previousElementSibling)) {
                if (typeof vditor.options.input === "function") {
                    vditor.options.input(getMarkdown(vditor));
                }
                return;
            }
            // https://github.com/Vanessa219/vditor/issues/1565
            if (event.inputType === "insertParagraph" && this.element.innerHTML === '<p><br></p><p><br></p>') {
                blockElement.previousElementSibling.remove();
            }

            input(vditor, range, event);
        });

        this.element.addEventListener("click", (event: MouseEvent & { target: HTMLElement }) => {
            const tEl = event.target instanceof Element ? event.target : (event.target as Node).parentElement;
            const openMdPreview = tEl && tEl.closest?.("[data-vditor-wysiwyg-image-md-open]");
            if (openMdPreview) {
                event.preventDefault();
                event.stopPropagation();
                const block = (openMdPreview as HTMLElement).closest?.('[data-type="image-md-block"]') as HTMLElement | null;
                const img = block?.querySelector(".vditor-wysiwyg__image-md__preview img") as HTMLImageElement | null;
                if (img) {
                    // Keep this button deterministic: always open built-in fullscreen overlay.
                    // This avoids downstream config/CSS differences breaking the entry.
                    previewImage(img, vditor.options.lang, vditor.options.theme);
                }
                return;
            }

            if (event.target.tagName === "INPUT") {
                const checkElement = event.target as HTMLInputElement;
                if (checkElement.checked) {
                    checkElement.setAttribute("checked", "checked");
                } else {
                    checkElement.removeAttribute("checked");
                }
                this.preventInput = true;
                if (getSelection().rangeCount > 0) {
                    setSelectionFocus(getSelection().getRangeAt(0));
                }
                afterRenderEvent(vditor);
                return;
            }

            if (event.target.tagName === "IMG") {
                const previewElement = hasClosestByClassName(event.target, "vditor-wysiwyg__preview");
                if (previewElement) {
                    showCode(previewElement, vditor);
                    return;
                }
                if (event.target.getAttribute("data-type") === "link-ref") {
                    genLinkRefPopover(vditor, event.target);
                }
                return;
            }

            // 打开链接
            const a = hasClosestByMatchTag(event.target, "A");
            if (a) {
                if (vditor.options.link.click) {
                    vditor.options.link.click(a);
                } else if (vditor.options.link.isOpen) {
                    window.open(a.getAttribute("href"));
                }
                event.preventDefault();
                return;
            }

            const range = getEditorRange(vditor);
            if (event.target.isEqualNode(this.element) && this.element.lastElementChild && range.collapsed) {
                const lastRect = this.element.lastElementChild.getBoundingClientRect();
                if (event.y > lastRect.top + lastRect.height) {
                    if (this.element.lastElementChild.tagName === "P" &&
                        this.element.lastElementChild.textContent.trim().replace(Constants.ZWSP, "") === "") {
                        range.selectNodeContents(this.element.lastElementChild);
                        range.collapse(false);
                    } else {
                        this.element.insertAdjacentHTML("beforeend",
                            `<p data-block="0">${Constants.ZWSP}<wbr></p>`);
                        setRangeByWbr(this.element, range);
                    }
                }
            }

            highlightToolbarWYSIWYG(vditor);

            // 点击后光标落于预览区，需展开代码块
            let previewElement = hasClosestByClassName(event.target, "vditor-wysiwyg__preview");
            if (!previewElement) {
                previewElement =
                    hasClosestByClassName(getEditorRange(vditor).startContainer, "vditor-wysiwyg__preview");
            }
            if (previewElement) {
                showCode(previewElement, vditor);
            }

            clickToc(event, vditor);
        });

        this.element.addEventListener("keyup", (event: KeyboardEvent & { target: HTMLElement }) => {
            if (event.isComposing || isCtrl(event)) {
                return;
            }
            // 除 md 处理、cell 内换行、table 添加新行/列、代码块语言切换、block render 换行、跳出/逐层跳出 blockquote、h6 换行、
            // 任务列表换行、软换行外需在换行时调整文档位置
            if (event.key === "Enter") {
                scrollCenter(vditor);
            }
            if ((event.key === "Backspace" || event.key === "Delete") &&
                vditor.wysiwyg.element.innerHTML !== "" && vditor.wysiwyg.element.childNodes.length === 1 &&
                vditor.wysiwyg.element.firstElementChild && vditor.wysiwyg.element.firstElementChild.tagName === "P"
                && vditor.wysiwyg.element.firstElementChild.childElementCount === 0
                && (vditor.wysiwyg.element.textContent === "" || vditor.wysiwyg.element.textContent === "\n")) {
                // 为空时显示 placeholder
                vditor.wysiwyg.element.innerHTML = "";
            }
            const range = getEditorRange(vditor);
            if (event.key === "Backspace") {
                // firefox headings https://github.com/Vanessa219/vditor/issues/211
                if (isFirefox() && range.startContainer.textContent === "\n" && range.startOffset === 1) {
                    range.startContainer.textContent = "";
                }
            }

            // 没有被块元素包裹
            modifyPre(vditor, range);

            highlightToolbarWYSIWYG(vditor);

            if (event.key !== "ArrowDown" && event.key !== "ArrowRight" && event.key !== "Backspace"
                && event.key !== "ArrowLeft" && event.key !== "ArrowUp") {
                return;
            }

            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                vditor.hint.render(vditor);
            }

            // 上下左右，删除遇到块预览的处理
            let previewElement = hasClosestByClassName(range.startContainer, "vditor-wysiwyg__preview");
            if (!previewElement && range.startContainer.nodeType !== 3 && range.startOffset > 0) {
                // table 前删除遇到代码块
                const blockRenderElement = range.startContainer as HTMLElement;
                if (blockRenderElement.classList.contains("vditor-wysiwyg__block")) {
                    previewElement = blockRenderElement.lastElementChild as HTMLElement;
                }
            }
            if (!previewElement) {
                return;
            }
            const previousElement = previewElement.previousElementSibling as HTMLElement;
            if (previousElement.style.display === "none") {
                if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                    showCode(previewElement, vditor);
                } else {
                    showCode(previewElement, vditor, false);
                }
                return;
            }

            let codeElement = previewElement.previousElementSibling as HTMLElement;
            if (codeElement.tagName === "PRE") {
                codeElement = codeElement.firstElementChild as HTMLElement;
            }

            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                const blockRenderElement = previewElement.parentElement;
                let nextNode = getRenderElementNextNode(blockRenderElement) as HTMLElement;
                if (nextNode && nextNode.nodeType !== 3) {
                    // 下一节点依旧为代码渲染块
                    const nextRenderElement = nextNode.querySelector(".vditor-wysiwyg__preview") as HTMLElement;
                    if (nextRenderElement) {
                        showCode(nextRenderElement, vditor);
                        return;
                    }
                }
                // 跳过渲染块，光标移动到下一个节点
                if (nextNode.nodeType === 3) {
                    // inline
                    while (nextNode.textContent.length === 0 && nextNode.nextSibling) {
                        // https://github.com/Vanessa219/vditor/issues/100 2
                        nextNode = nextNode.nextSibling as HTMLElement;
                    }
                    range.setStart(nextNode, 1);
                } else {
                    // block
                    range.setStart(nextNode.firstChild, 0);
                }
            } else {
                range.selectNodeContents(codeElement);
                range.collapse(false);
            }
        });
    }
}

export {WYSIWYG};
