export const mathRenderAdapter = {
    getCode: (el: Element) => el.textContent,
    getElements: (element: HTMLElement | Document) => element.querySelectorAll(".language-math"),
};
export const mermaidRenderAdapter = {
    /** 不仅要返回code，并且需要将 code 设置为 el 的 innerHTML */
    getCode: (el: Element) => el.textContent,
    getElements: (element: HTMLElement | Document) => element.querySelectorAll(".language-mermaid"),
};
export const markmapRenderAdapter = {
    getCode: (el: Element) => el.textContent,
    getElements: (element: HTMLElement | Document) => element.querySelectorAll(".language-markmap"),
};
export const mindmapRenderAdapter = {
    getCode: (el: Element) => el.getAttribute("data-code"),
    getElements: (element: HTMLElement | Document) => element.querySelectorAll(".language-mindmap"),
};
export const chartRenderAdapter = {
    getCode: (el: HTMLElement) => el.innerText,
    getElements: (element: HTMLElement | Document) => element.querySelectorAll(".language-echarts"),
};
export const graphvizRenderAdapter = {
    getCode: (el: Element) => el.textContent,
    getElements: (element: HTMLElement | Document) => element.querySelectorAll(".language-graphviz"),
};
export const plantumlRenderAdapter = {
    getCode: (el: Element) => el.textContent,
    getElements: (element: HTMLElement | Document) => element.querySelectorAll(".language-plantuml"),
};