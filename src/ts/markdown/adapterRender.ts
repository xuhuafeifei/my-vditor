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
export const plantumlRenderAdapter = {
    getCode: (el: Element) => el.textContent,
    getElements: (element: HTMLElement | Document) => element.querySelectorAll(".language-plantuml"),
};