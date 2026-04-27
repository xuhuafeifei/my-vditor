import {code160to32} from "../util/code160to32";
import {stripEmptyImagePlaceholderFromMarkdown} from "../util/emptyImagePlaceholder";
import {decodeTableCellBrInMarkdown, encodeTableCellBrInHTML} from "../util/tableBr";
import {unwrapImageMdBlocksForExport} from "../wysiwyg/imageMdBlock";

const flattenCodeBlockHighlightDOM = (html: string) => {
    const container = document.createElement("div");
    container.innerHTML = html;
    container.querySelectorAll("pre > code").forEach((codeElement: HTMLElement) => {
        // 保存前仅做结构扁平化：把高亮 span/br 等节点还原成纯文本，避免 DOM2Md 只序列化首个 token
        codeElement.textContent = codeElement.textContent || "";
    });
    return container.innerHTML;
};

export const getMarkdown = (vditor: IVditor) => {
    if (vditor.currentMode === "sv") {
        return code160to32(`${vditor.sv.element.textContent}\n`.replace(/\n\n$/, "\n"));
    } else if (vditor.currentMode === "wysiwyg") {
        let html = flattenCodeBlockHighlightDOM(vditor.wysiwyg.element.innerHTML);
        html = encodeTableCellBrInHTML(html);
        html = unwrapImageMdBlocksForExport(html, vditor);
        return stripEmptyImagePlaceholderFromMarkdown(
            decodeTableCellBrInMarkdown(vditor.lute.VditorDOM2Md(html)),
        );
    } else if (vditor.currentMode === "ir") {
        const html = encodeTableCellBrInHTML(flattenCodeBlockHighlightDOM(vditor.ir.element.innerHTML));
        return stripEmptyImagePlaceholderFromMarkdown(
            decodeTableCellBrInMarkdown(vditor.lute.VditorIRDOM2Md(html)),
        );
    }
    return "";
};
