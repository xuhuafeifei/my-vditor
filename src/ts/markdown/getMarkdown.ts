import {code160to32} from "../util/code160to32";
import {decodeTableCellBrInMarkdown, encodeTableCellBrInHTML} from "../util/tableBr";

export const getMarkdown = (vditor: IVditor) => {
    if (vditor.currentMode === "sv") {
        return code160to32(`${vditor.sv.element.textContent}\n`.replace(/\n\n$/, "\n"));
    } else if (vditor.currentMode === "wysiwyg") {
        const html = encodeTableCellBrInHTML(vditor.wysiwyg.element.innerHTML);
        return decodeTableCellBrInMarkdown(vditor.lute.VditorDOM2Md(html));
    } else if (vditor.currentMode === "ir") {
        const html = encodeTableCellBrInHTML(vditor.ir.element.innerHTML);
        return decodeTableCellBrInMarkdown(vditor.lute.VditorIRDOM2Md(html));
    }
    return "";
};
