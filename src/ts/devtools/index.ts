import {getMarkdown} from "../markdown/getMarkdown";

export class DevTools {
    public element: HTMLDivElement;

    constructor() {
        this.element = document.createElement("div");
        this.element.className = "vditor-devtools";
        this.element.innerHTML = '<div class="vditor-reset--error"></div><div style="height: 100%;"></div>';
    }

    public renderEchart(vditor: IVditor) {
        if (vditor.devtools.element.style.display !== "block") {
            return;
        }
        (this.element.lastElementChild as HTMLElement).style.display = "none";
        this.element.firstElementChild.innerHTML = `ECharts devtools is disabled. Markdown length: ${getMarkdown(vditor).length}`;
    }
}
