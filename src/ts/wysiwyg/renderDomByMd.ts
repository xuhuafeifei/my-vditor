import {expandEmptyImageInMarkdown, patchEmptyImageInElement} from "../util/emptyImagePlaceholder";
import {processCodeRender} from "../util/processCode";
import {decodeTableCellBrInElement, encodeTableCellBrInMarkdown} from "../util/tableBr";
import {afterRenderEvent} from "./afterRenderEvent";
import {refreshFencedCodeIn} from "./fencedCodeEdit";
import {applyWrapStandaloneImageBlocks} from "./imageMdBlock";

export const renderDomByMd = (vditor: IVditor, md: string, options = {
    enableAddUndoStack: true,
    enableHint: false,
    enableInput: true,
}) => {
    const editorElement = vditor.wysiwyg.element;
    editorElement.innerHTML = vditor.lute.Md2VditorDOM(
        expandEmptyImageInMarkdown(encodeTableCellBrInMarkdown(md)));
    decodeTableCellBrInElement(editorElement);
    patchEmptyImageInElement(editorElement);
    applyWrapStandaloneImageBlocks(editorElement, vditor);

    editorElement.querySelectorAll(".vditor-wysiwyg__preview[data-render='2']").forEach((item: HTMLElement) => {
        processCodeRender(item, vditor);
        item.previousElementSibling.setAttribute("style", "display:none");
    });

    // 编程语言的 code-block：显示 pre>code 并启用 hljs 可编辑高亮；
    // mermaid/math 等渲染语言上面已被藏了 pre（经典路径），这里不会再影响它们。
    refreshFencedCodeIn(editorElement, vditor);

    afterRenderEvent(vditor, options);
};
