import {
    getTopList,
    hasClosestBlock, hasClosestByAttribute, hasClosestByMatchTag, hasTopClosestByTag,
} from "../util/hasClosest";
import {hasClosestByTag} from "../util/hasClosestByHeadings";
import {log} from "../util/log";
import {processCodeRender} from "../util/processCode";
import {setRangeByWbr} from "../util/selection";
import {renderToc} from "../util/toc";
import {
    injectEmptyMarkdownImagesAsHtml,
    patchEmptyImageSrcInHtml,
} from "../util/emptyImagePlaceholder";
import {decodeTableCellBrInHTML, encodeTableCellBrInHTML} from "../util/tableBr";
import {afterRenderEvent} from "./afterRenderEvent";
import {refreshFencedCodeIn} from "./fencedCodeEdit";
import {unwrapImageMdBlocksForSpin, wrapStandaloneImageBlocksAfterSpin} from "./imageMdBlock";
import {previoueIsEmptyA} from "./inlineTag";

export const input = (vditor: IVditor, range: Range, event?: InputEvent) => {
    let blockElement = hasClosestBlock(range.startContainer);
    const tableElement = hasClosestByMatchTag(range.startContainer, "TABLE") as HTMLElement;
    const tableScrollLeft = tableElement ? tableElement.scrollLeft : 0;

    if (!blockElement) {
        // 使用顶级块元素，应使用 innerHTML
        blockElement = vditor.wysiwyg.element;
    }

    if (event && event.inputType !== "formatItalic"
        && event.inputType !== "deleteByDrag"
        && event.inputType !== "insertFromDrop"
        && event.inputType !== "formatBold"
        && event.inputType !== "formatRemove"
        && event.inputType !== "formatStrikeThrough"
        && event.inputType !== "insertUnorderedList"
        && event.inputType !== "insertOrderedList"
        && event.inputType !== "formatOutdent"
        && event.inputType !== "formatIndent"
        && event.inputType !== ""   // document.execCommand('unlink', false)
        || !event
    ) {
        const previousAEmptyElement = previoueIsEmptyA(range.startContainer);
        if (previousAEmptyElement) {
            // 链接结尾回车不应该复制到下一行 https://github.com/Vanessa219/vditor/issues/163
            previousAEmptyElement.remove();
        }

        // 保存光标
        vditor.wysiwyg.element.querySelectorAll("wbr").forEach((wbr) => {
            wbr.remove();
        });
        range.insertNode(document.createElement("wbr"));

        // 在行首进行删除，后面的元素会带有样式，需清除
        blockElement.querySelectorAll("[style]").forEach((item) => {
            item.removeAttribute("style");
        });

        // === 可编辑高亮：送给 Lute 前，把 code-block 内 pre>code 的 hljs span 铲平为纯文本 ===
        // 原因：下面会把 blockElement.innerHTML/outerHTML 交给 lute.SpinVditorDOM → VditorDOM2Md，
        // 若 code 里留着 <span class="hljs-keyword">public</span> 这样的结构，Lute 会把它
        // 当成 markdown 里的内联元素来序列化，输出的 md 就被污染了。
        // 所以在 spin 前铲平，spin 后 refreshFencedCodeIn 会按新文本重新上色。
        // wbr 是 Vditor 用来记光标位置的"标记元素"（void element），不能丢；用一个
        // 文本占位符 WBR_MARK 先替换 wbr → 读出纯 textContent → 再按占位符切分、重建 wbr。
        blockElement.querySelectorAll(`[data-type="code-block"] > pre > code`).forEach((code: HTMLElement) => {
            if (!code.querySelector("span, br")) {
                return;                                       // 没有高亮结构就没必要处理
            }
            const hasWbr = !!code.querySelector("wbr");
            if (hasWbr) {
                const WBR_MARK = "\u0001WBR\u0001";           // 用不可见控制字符，不会出现在用户源码里
                const wbr = code.querySelector("wbr") as HTMLElement;
                wbr.replaceWith(document.createTextNode(WBR_MARK));
                const text = code.textContent || "";
                code.textContent = "";                        // 清空所有子节点
                const parts = text.split(WBR_MARK);
                code.appendChild(document.createTextNode(parts[0] ?? ""));
                code.appendChild(document.createElement("wbr"));
                if (parts.length > 1) {
                    // 理论上只会有两段，但若源码里真的出现了 WBR_MARK，拼回去也不丢字符
                    code.appendChild(document.createTextNode(parts.slice(1).join(WBR_MARK)));
                }
            } else {
                // 没有光标锚点，就最简单的一步：把所有子 DOM 塌成一个 Text 节点
                code.textContent = code.textContent || "";
            }
        });

        // 移除空评论
        blockElement.querySelectorAll(".vditor-comment").forEach((item) => {
            if (item.textContent.trim() === "") {
                item.classList.remove("vditor-comment", "vditor-comment--focus");
                item.removeAttribute("data-cmtids");
            }
        });
        //  在有评论的行首换行后，该行的前一段会带有评论标识
        blockElement.previousElementSibling?.querySelectorAll(".vditor-comment").forEach((item) => {
            if (item.textContent.trim() === "") {
                item.classList.remove("vditor-comment", "vditor-comment--focus");
                item.removeAttribute("data-cmtids");
            }
        });

        let html = "";
        if (blockElement.getAttribute("data-type") === "link-ref-defs-block") {
            // 修改链接引用
            blockElement = vditor.wysiwyg.element;
        }

        const isWYSIWYGElement = blockElement.isEqualNode(vditor.wysiwyg.element);
        const footnoteElement = hasClosestByAttribute(blockElement, "data-type", "footnotes-block");

        if (!isWYSIWYGElement) {
            // 列表需要到最顶层
            const topListElement = getTopList(range.startContainer);
            if (topListElement && !footnoteElement) {
                const blockquoteElement = hasClosestByTag(range.startContainer, "BLOCKQUOTE");
                if (blockquoteElement) {
                    // li 中有 blockquote 就只渲染 blockquote
                    blockElement = hasClosestBlock(range.startContainer) || blockElement;
                } else {
                    blockElement = topListElement;
                }
            }

            // 修改脚注
            if (footnoteElement) {
                blockElement = footnoteElement;
            }

            html = blockElement.outerHTML;

            if (blockElement.tagName === "UL" || blockElement.tagName === "OL") {
                // 如果为列表的话，需要把上下的列表都重绘
                const listPrevElement = blockElement.previousElementSibling;
                const listNextElement = blockElement.nextElementSibling;
                if (listPrevElement && (listPrevElement.tagName === "UL" || listPrevElement.tagName === "OL")) {
                    html = listPrevElement.outerHTML + html;
                    listPrevElement.remove();
                }
                if (listNextElement && (listNextElement.tagName === "UL" || listNextElement.tagName === "OL")) {
                    html = html + listNextElement.outerHTML;
                    listNextElement.remove();
                }
                // firefox 列表回车不会产生新的 list item https://github.com/Vanessa219/vditor/issues/194
                html = html.replace("<div><wbr><br></div>", "<li><p><wbr><br></p></li>");
            }

            if (!blockElement.innerText.startsWith("```")) {
                // 添加链接引用
                vditor.wysiwyg.element.querySelectorAll("[data-type='link-ref-defs-block']").forEach((item) => {
                    if (item && !(blockElement as HTMLElement).isEqualNode(item)) {
                        html += item.outerHTML;
                        item.remove();
                    }
                });

                // 添加脚注
                vditor.wysiwyg.element.querySelectorAll("[data-type='footnotes-block']").forEach((item) => {
                    if (item && !(blockElement as HTMLElement).isEqualNode(item)) {
                        html += item.outerHTML;
                        item.remove();
                    }
                });
            }
        } else {
            html = blockElement.innerHTML;
        }

        // 合并多个 em， strong，s。以防止多个相同元素在一起时不满足 commonmark 规范，出现标记符
        html = html.replace(/<\/(strong|b)><strong data-marker="\W{2}">/g, "")
            .replace(/<\/(em|i)><em data-marker="\W{1}">/g, "")
            .replace(/<\/(s|strike)><s data-marker="~{1,2}">/g, "");

        if (html === '<p data-block="0">```<wbr></p>' && vditor.hint.recentLanguage) {
            html = '<p data-block="0">```<wbr></p>'.replace("```", "```" + vditor.hint.recentLanguage);
        }

        html = encodeTableCellBrInHTML(html);
        html = injectEmptyMarkdownImagesAsHtml(html);
        html = unwrapImageMdBlocksForSpin(html, vditor);
        log("SpinVditorDOM", html, "argument", vditor.options.debugger);
        html = vditor.lute.SpinVditorDOM(html);
        log("SpinVditorDOM", html, "result", vditor.options.debugger);
        html = decodeTableCellBrInHTML(html);
        html = patchEmptyImageSrcInHtml(html);
        html = wrapStandaloneImageBlocksAfterSpin(html, vditor);

        if (isWYSIWYGElement) {
            blockElement.innerHTML = html;
        } else {
            blockElement.outerHTML = html;

            if (footnoteElement) {
                // 更新正文中的 tip
                const footnoteItemElement = hasTopClosestByTag(vditor.wysiwyg.element.querySelector("wbr"), "LI");
                if (footnoteItemElement) {
                    const footnoteRefElement = vditor.wysiwyg.element.querySelector(`sup[data-type="footnotes-ref"][data-footnotes-label="${footnoteItemElement.getAttribute("data-marker")}"]`);
                    if (footnoteRefElement) {
                        footnoteRefElement.setAttribute("aria-label",
                            footnoteItemElement.textContent.trim().substr(0, 24));
                    }
                }
            }
        }

        let firstLinkRefDefElement: Element;
        const allLinkRefDefsElement = vditor.wysiwyg.element.querySelectorAll("[data-type='link-ref-defs-block']");
        allLinkRefDefsElement.forEach((item, index) => {
            if (index === 0) {
                firstLinkRefDefElement = item;
            } else {
                firstLinkRefDefElement.insertAdjacentHTML("beforeend", item.innerHTML);
                item.remove();
            }
        });
        if (allLinkRefDefsElement.length > 0) {
            vditor.wysiwyg.element.insertAdjacentElement("beforeend", allLinkRefDefsElement[0]);
        }

        // 脚注合并后添加的末尾
        let firstFootnoteElement: Element;
        const allFootnoteElement = vditor.wysiwyg.element.querySelectorAll("[data-type='footnotes-block']");
        allFootnoteElement.forEach((item, index) => {
            if (index === 0) {
                firstFootnoteElement = item;
            } else {
                firstFootnoteElement.insertAdjacentHTML("beforeend", item.innerHTML);
                item.remove();
            }
        });
        if (allFootnoteElement.length > 0) {
            vditor.wysiwyg.element.insertAdjacentElement("beforeend", allFootnoteElement[0]);
        }

        // 设置光标
        setRangeByWbr(vditor.wysiwyg.element, range);
        const currentTableElement = hasClosestByMatchTag(range.startContainer, "TABLE") as HTMLElement;
        if (currentTableElement) {
            currentTableElement.scrollLeft = tableScrollLeft;
        }

        vditor.wysiwyg.element.querySelectorAll(".vditor-wysiwyg__preview[data-render='2']")
            .forEach((item: HTMLElement) => {
                processCodeRender(item, vditor);
            });
        // spin 之后 DOM 已重建，code 里是纯文本 → 再跑一次可编辑高亮路径，重新上色
        refreshFencedCodeIn(vditor.wysiwyg.element, vditor);

        if (event && (event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward") &&
            vditor.options.comment.enable) {
            vditor.wysiwyg.triggerRemoveComment(vditor);
            vditor.options.comment.adjustTop(vditor.wysiwyg.getComments(vditor, true));
        }
    }
    renderToc(vditor);
    afterRenderEvent(vditor, {
        enableAddUndoStack: true,
        enableHint: true,
        enableInput: true,
    });
};
