import {Constants} from "../constants";
import {addScript} from "../util/addScript";
import {addStyle} from "../util/addStyle";
import {code160to32} from "../util/code160to32";
import {mathRenderAdapter} from "./adapterRender";

declare const katex: {
    renderToString(math: string, option: {
        displayMode: boolean;
        output: string;
        macros: object;
    }): string;
};

export const mathRender = (element: (HTMLElement | Document) = document, options?: { cdn?: string, math?: IMath }) => {
    const mathElements = mathRenderAdapter.getElements(element);

    if (mathElements.length === 0) {
        return;
    }

    const defaultOptions = {
        cdn: Constants.CDN,
        math: {
            engine: "KaTeX",
            inlineDigit: false,
            macros: {},
        },
    };

    if (options && options.math) {
        options.math =
            Object.assign({}, defaultOptions.math, options.math);
    }
    options = Object.assign({}, defaultOptions, options);

    addStyle(`${options.cdn}/dist/js/katex/katex.min.css?v=0.16.9`, "vditorKatexStyle");
    addScript(`${options.cdn}/dist/js/katex/katex.min.js?v=0.16.9`, "vditorKatexScript").then(() => {
        addScript(`${options.cdn}/dist/js/katex/mhchem.min.js?v=0.16.9`, "vditorKatexChemScript").then(() => {
            mathElements.forEach((mathElement) => {
                if (mathElement.parentElement.classList.contains("vditor-wysiwyg__pre") ||
                    mathElement.parentElement.classList.contains("vditor-ir__marker--pre")) {
                    return;
                }
                if (mathElement.getAttribute("data-math")) {
                    return;
                }
                const math = code160to32(mathRenderAdapter.getCode(mathElement));
                mathElement.setAttribute("data-math", math);
                try {
                    mathElement.innerHTML = katex.renderToString(math, {
                        displayMode: mathElement.tagName === "DIV",
                        output: "html",
                        macros: options.math.macros,
                    });
                } catch (e) {
                    mathElement.innerHTML = e.message;
                    mathElement.className = "language-math vditor-reset--error";
                }

                mathElement.addEventListener("copy", (event: ClipboardEvent) => {
                    event.stopPropagation();
                    event.preventDefault();
                    const vditorMathElement = (event.currentTarget as HTMLElement).closest(".language-math");
                    event.clipboardData.setData("text/html", vditorMathElement.innerHTML);
                    event.clipboardData.setData("text/plain",
                        vditorMathElement.getAttribute("data-math"));
                });
            });
        });
    });
};
