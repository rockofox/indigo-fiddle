import { LitElement, html, css, unsafeCSS } from 'lit';
import { basicSetup, EditorView } from "codemirror"
import { keymap } from "@codemirror/view"
import { Compartment, EditorState } from "@codemirror/state"
import { WASI, File, PreopenDirectory, Fd } from "@bjorn3/browser_wasi_shim"
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { indentWithTab } from "@codemirror/commands"
import Split from 'split-grid'
import "@xterm/xterm/css/xterm.css";
import * as fflate from 'fflate';
import { indigo } from "codemirror-lang-indigo"

import indigoInit from "./indigo-init.wasm";
import indigoPrelude from "./indigo-lib/share/std/prelude.in";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"

const BG_COLOR = "#191724";
class FiddleElement extends LitElement {
  static properties = {
    code: {
      type: String
    },
    editorView: { attribute: false }
  };
  /**
   * @param {string} value
   */
  set code(value) {
    this._code = value;
    if (this.editorView) {
      this.editorView.dispatch({
        changes: {
          from: 0,
          to: this.editorView.state.doc.length,
          insert: value
        }
      })
    }
  }
  static styles = css`
  #toolbar button {
    appearance: none;
    outline: none;
    border:none;
    background: none;
    /* border: 1px solid gray; */
      color: white;
    cursor: pointer;
    border-radius: 5px;
    font-size: 20px;
    width: 24px;
    height:26px;
    vertical-align: top;
    padding:0;
    margin:0;
  }
  #flexContainer {
    /* height:100vh; */
      height:100%;
    width:100%;
      display: grid;
    overflow:hidden;
    grid-template-rows: 1fr 30px 1fr;
  }
  #flexContainer > div {
    /* border: 1px solid white; */
  }
    .gutter-row {
      grid-column: 1/-1;
      cursor: row-resize;
    }
    .gutter-row-1 {
      grid-row: 2;
    }
  #editor {
    min-height:0;
  }
  .cm-editor {
    height: 100%;
    min-height:0;
  }
  #toolbar {
    background-color: #282a36;
    overflow:hidden;
    border: 1px solid gray;
  }
  #output {
    min-height:0;
  }
  #output > *{
    height:100%;
  }

[data-tooltip]:before {
  content: attr(data-tooltip);
  position: absolute;
  /* top: -30px; */
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,.8);
  color: #fff;
  padding: 5px 10px;
  border-radius: 5px;
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  /* transition: .2s ease-in-out; */
}

[data-tooltip]:hover:before {
  opacity: 1;
}
  `;

  render() {
    return html`
    <style>
      ${FiddleElement.styles}
    </style>
      <div id="flexContainer">
        <div id="editor"></div>
        <div class="gutter-row gutter-row-1" id="toolbar">
        <button id="runButton" data-tooltip="Run">▶️</button>
        <button id="inputButton" data-tooltip="Run with input">📥</button>
        <button id="copyUrlButton" data-tooltip="Copy URL to clipboard">🔗</button>
        <button id="clearOutputButton" data-tooltip="Clear output">🧹</button>
        </div>
        <div id="output"></div>
      </div>
      `;
  }

  constructor() {
    super();
  }

  _createEditorView() {
    let myTheme = EditorView.theme({
      "&": {
        fontSize: "14px",
        color: "white",
        backgroundColor: BG_COLOR
      },
      ".cm-content": {
        caretColor: "#0e9"
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: "#0e9"
      },
      "&.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "#074"
      },
      ".cm-gutters": {
        backgroundColor: BG_COLOR,
        color: "#ddd",
        border: "none"
      }
    }, { dark: true })
    const myHighlightStyle = HighlightStyle.define([
      {
        tag: t.keyword,
        color: "#f6c177"
      },
      {
        tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName],
        color: "#e06c75"
      },
      {
        tag: [t.function(t.variableName), t.labelName],
        color: "#61afef"
      },
      {
        tag: [t.color, t.constant(t.name), t.standard(t.name)],
        color: "#d19a66"
      },
      {
        tag: [t.definition(t.name), t.separator],
        color: "#abb2bf"
      },
      {
        tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace],
        color: "#56b6c2"
      },
      {
        tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)],
        color: "#98c379"
      },
      {
        tag: [t.meta, t.comment],
        color: "#6e6a86"
      },
      {
        tag: t.strong,
        fontWeight: "bold"
      },
      {
        tag: t.emphasis,
        fontStyle: "italic"
      },
      {
        tag: t.strikethrough,
        textDecoration: "line-through"
      },
      {
        tag: t.link,
        color: "#61afef",
        textDecoration: "underline"
      },
      {
        tag: t.heading,
        fontWeight: "bold",
        color: "#61afef"
      },
      {
        tag: [t.atom, t.bool, t.special(t.variableName)],
        color: "blue"
      },
      {
        tag: [t.processingInstruction, t.string, t.inserted],
        color: "#31748f"
      },
      {
        tag: t.invalid,
        color: "red"
      },
    ])

    const languageConf = new Compartment

    return new EditorView({
      doc: this.code,
      lineWrapping: true,
      extensions: [
        basicSetup,
        // autocompletion({ override: [myCompletions] }),
        keymap.of([indentWithTab]),
        // StreamLanguage.define(julia),
        languageConf.of(indigo()),
        EditorView.lineWrapping,
        myTheme,
        syntaxHighlighting(myHighlightStyle)
      ],
      parent: this.renderRoot.querySelector("#editor"),
    });
  }


  firstUpdated() {
    this.editorView = this._createEditorView();
    const view = this.editorView

    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: this._code
      }
    })

    Split({
      minSize: 50,
      rowGutters: [{
        track: 1,
        element: this.renderRoot.querySelector('.gutter-row-1'),
      }]
    })

    class XTermStdio extends Fd {
      constructor(term) {
        super();
        this.term = term;
      }
      fd_write(view8/*: Uint8Array*/, iovs/*: [wasi.Iovec]*/)/*: {ret: number, nwritten: number}*/ {
        let nwritten = 0;
        for (let iovec of iovs) {
          console.log(iovec.buf_len, iovec.buf_len, view8.slice(iovec.buf, iovec.buf + iovec.buf_len));
          let buffer = view8.slice(iovec.buf, iovec.buf + iovec.buf_len);
          this.term.write(buffer);
          nwritten += iovec.buf_len;
        }
        return { ret: 0, nwritten };
      }
    }
    const term = new Terminal({
      theme: {
        background: BG_COLOR,
        foreground: '#f8f8f2',
        cursor: '#f8f8f0',
        selectionBackground: '#44475a',
      },
      convertEol: true
    });
    const fitAddon = new FitAddon();
    let stdin = "";
    term.loadAddon(fitAddon);
    term.open(this.renderRoot.querySelector("#output"));
    fitAddon.fit();
    window.addEventListener('resize', function(event) {
      fitAddon.fit();
    });

    function runCurrentProgram() {
      runProgram(view.state.doc.toString()).catch(e => {
        console.error(e);
      });
    }
    function copyUrl() {
      let url = new URL(window.standaloneFiddle === true ? window.location.href : "https://indigo-fiddle.fox.boo");
      let compressedB64 = base64ToUrlFriendly(bufferToBase64(fflate.zlibSync(encoder.encode(view.state.doc.toString()))))
      url.pathname = compressedB64;
      navigator.clipboard.writeText(url.toString());
      term.write("Copied URL to clipboard.\n");
    }
    function setStdin() {
      stdin = "";
      term.clear();
      term.write("Enter stdin:\n");
      const disponsable = term.onData((data) => {
        if (data.charCodeAt(0) === 13) {
          term.write("\n");
          disponsable.dispose();
          stdin += "\n";
          console.log(stdin)
          runProgram(view.state.doc.toString()).catch(e => {
            console.error(e);
          });
        } else {
          stdin += data;
          term.write(data);
        }
      });
    }
    function clearOutput() {
      term.clear();
    }
    this.renderRoot.querySelector("#runButton").addEventListener("mousedown", runCurrentProgram);
    this.renderRoot.querySelector("#runButton").addEventListener("touchstart", runCurrentProgram);
    this.renderRoot.querySelector("#copyUrlButton").addEventListener("mousedown", copyUrl);
    this.renderRoot.querySelector("#copyUrlButton").addEventListener("touchstart", copyUrl);
    this.renderRoot.querySelector("#inputButton").addEventListener("mousedown", setStdin);
    this.renderRoot.querySelector("#inputButton").addEventListener("touchstart", setStdin);
    this.renderRoot.querySelector("#clearOutputButton").addEventListener("mousedown", clearOutput);
    this.renderRoot.querySelector("#clearOutputButton").addEventListener("touchstart", clearOutput);


    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let url = new URL(window.location.href);
    let compressedB64 = url.pathname.slice(1);
    if (compressedB64) {
      let compressedBuffer = base64ToBuffer(urlFriendlyToBase64(compressedB64));
      let input = decoder.decode(fflate.unzlibSync(compressedBuffer));
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: input
        }
      });
    }
    function bufferToBase64(bytes) {
      return btoa(
        bytes.reduce((acc, current) => acc + String.fromCharCode(current), "")
      );
    }
    function base64ToBuffer(base64) {
      return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }
    function base64ToUrlFriendly(base64) {
      return base64.replaceAll('+', '~').replaceAll('/', '_').replaceAll('=', '-');
    }
    function urlFriendlyToBase64(urlFriendly) {
      return urlFriendly.replaceAll('~', '+').replaceAll('_', '/').replaceAll('-', '=');
    }

    async function runProgram(prog) {
      let compressedB64 = base64ToUrlFriendly(bufferToBase64(fflate.zlibSync(encoder.encode(prog))))
      if (window.standaloneFiddle === true) {
        window.history.replaceState({}, "", compressedB64);
      }

      const wasi = new WASI([], [], [
        new XTermStdio(term),
        new XTermStdio(term),
        new XTermStdio(term),
        new PreopenDirectory("/usr/local/lib/indigo/std", {
          "prelude.in": new File(new TextEncoder("utf-8").encode(await fetch(indigoPrelude).then(r => r.text()))), // FIXME
        })
      ]);
      const wasiImportObj = { wasi_snapshot_preview1: wasi.wasiImport };
      const wasm = await WebAssembly.instantiateStreaming(fetch(indigoInit), wasiImportObj);
      wasi.inst = wasm.instance;
      const exports = wasm.instance.exports;
      const memory = exports.memory;
      const outputPtrPtr = exports.mallocPtr();
      const progLen = prog.length;
      const progPtr = exports.mallocBytes(progLen);
      const progArr = new Uint8Array(memory.buffer, progPtr, progLen);
      encoder.encodeInto(prog, progArr);
      const stdinLen = stdin.length;
      const stdinPtr = exports.mallocBytes(stdinLen);
      const stdinArr = new Uint8Array(memory.buffer, stdinPtr, stdinLen);
      encoder.encodeInto(stdin, stdinArr);
      const outputLen = exports.runProgramRawBuffered(progPtr, progLen, stdinPtr, stdinLen, outputPtrPtr);
      const outputPtrArr = new Uint32Array(memory.buffer, outputPtrPtr, 1);
      const outputPtr = outputPtrArr[0];
      const outputArr = new Uint8Array(memory.buffer, outputPtr, outputLen);
      const output = decoder.decode(outputArr);
      term.reset();
      fitAddon.fit();
      term.write(output);
      exports.free_(outputPtr);
    }

  }
  createRenderRoot() {
    return this;
  }
}
customElements.define('indigo-fiddle', FiddleElement);
