import {processCodeRender} from "../util/processCode";
import {decodeTableCellBrInElement, encodeTableCellBrInMarkdown} from "../util/tableBr";
import {afterRenderEvent} from "./afterRenderEvent";

export const renderDomByMd = (vditor: IVditor, md: string, options = {
    enableAddUndoStack: true,
    enableHint: false,
    enableInput: true,
}) => {
    const editorElement = vditor.wysiwyg.element;
    editorElement.innerHTML = vditor.lute.Md2VditorDOM(encodeTableCellBrInMarkdown(md));
    decodeTableCellBrInElement(editorElement);

    editorElement.querySelectorAll(".vditor-wysiwyg__preview[data-render='2']").forEach((item: HTMLElement) => {
        processCodeRender(item, vditor);
        item.previousElementSibling.setAttribute("style", "display:none");
    });

    afterRenderEvent(vditor, options);
};
