import {code160to32} from "../util/code160to32";
import {stripEmptyImagePlaceholderFromMarkdown} from "../util/emptyImagePlaceholder";
import {decodeTableCellBrInMarkdown, encodeTableCellBrInHTML} from "../util/tableBr";
import {unwrapImageMdBlocksForExport} from "../wysiwyg/imageMdBlock";

export const getMarkdown = (vditor: IVditor) => {
    if (vditor.currentMode === "sv") {
        return code160to32(`${vditor.sv.element.textContent}\n`.replace(/\n\n$/, "\n"));
    } else if (vditor.currentMode === "wysiwyg") {
        let html = encodeTableCellBrInHTML(vditor.wysiwyg.element.innerHTML);
        html = unwrapImageMdBlocksForExport(html, vditor);
        return stripEmptyImagePlaceholderFromMarkdown(
            decodeTableCellBrInMarkdown(vditor.lute.VditorDOM2Md(html)),
        );
    } else if (vditor.currentMode === "ir") {
        const html = encodeTableCellBrInHTML(vditor.ir.element.innerHTML);
        return stripEmptyImagePlaceholderFromMarkdown(
            decodeTableCellBrInMarkdown(vditor.lute.VditorIRDOM2Md(html)),
        );
    }
    return "";
};
