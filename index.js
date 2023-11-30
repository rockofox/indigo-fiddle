import { basicSetup, EditorView } from "codemirror"
import { keymap } from "@codemirror/view"
import { autocompletion } from "@codemirror/autocomplete"
import { WASI, File, OpenFile, PreopenDirectory, Fd, strace, Directory } from "@bjorn3/browser_wasi_shim";
import { Terminal } from "xterm";
import { StreamLanguage } from "@codemirror/language";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { dracula } from "thememirror";
import { FitAddon } from "xterm-addon-fit";
import { indentWithTab } from "@codemirror/commands"
import Split from 'split-grid'
import "./style.css";
import "xterm/css/xterm.css";
// import * as brotli from "brotli";
import brotliPromise from 'brotli-wasm'; // Import the default export

const brotli = await brotliPromise; // Import is async in browsers due to wasm requirements!

// Our list of completions (can be static, since the editor
/// will do filtering based on context).
const completions = [
  // { label: "panic", type: "keyword" },
  // { label: "park", type: "constant", info: "Test completion" },
  // { label: "password", type: "variable" },
]

Split({
  minSize: 50,
  rowGutters: [{
    track: 1,
    element: document.querySelector('.gutter-row-1'),
  }]
})

function myCompletions(context) {
  let before = context.matchBefore(/\w+/)
  // If completion wasn't explicitly started and there
  // is no word before the cursor, don't open completions.
  if (!context.explicit && !before) return null
  return {
    from: before ? before.from : context.pos,
    options: completions,
    validFor: /^\w*$/
  }
}



let view = new EditorView({
  doc: `let bottles (i: Int) => IO = do
    if i > 0 then do
        println ^i : " bottles of beer on the wall, " : ^i : " bottles of beer."
        println "Take one down and pass it around, " : ((i) - 1) as String : " bottles of beer on the wall.\\n"
        bottles (i)-1
    else do
        println "No more bottles of beer on the wall, no more bottles of beer."
        println "Go to the store and buy some more, 99 bottles of beer on the wall."
    end
end

let main => IO = do
    bottles 99
end`,
  extensions: [
    basicSetup,
    autocompletion({ override: [myCompletions] }),
    keymap.of([indentWithTab]),
    StreamLanguage.define(ruby),
    dracula
  ],
  // autoCloseParents: true,
  parent: document.getElementById("editor"),
})

class XTermStdio extends Fd {
  constructor(term) {
    super();
    this.term = term;
  }
  // fd_read(x, y) {
  //   console.log("Reading!", x, y)
  //   return { ret: 0 }
  // }
  // fd_fdstat_get() {
  //   console.log("FDSTAT")
  //   return { ret: -1, fdstat: new Fdstat() };
  // }
  // fd_write(view8, iovs) {
  //   let nwritten = 0;
  //   for (let iovec of iovs) {
  //     // console.log(iovec.buf_len, iovec.buf_len, view8.slice(iovec.buf, iovec.buf + iovec.buf_len));
  //     let buffer = view8.slice(iovec.buf, iovec.buf + iovec.buf_len);
  //     this.term.write(buffer);
  //     nwritten += iovec.buf_len;
  //   }
  //   return { ret: 0, nwritten };
  // }
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
    background: '#2d2f3f',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    selectionBackground: '#44475a',
  },
  convertEol: true
});
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("output"));
fitAddon.fit();
window.addEventListener('resize', function(event) {
  fitAddon.fit();
});
// document.getElementsByClassName("gutter-row")[0].addEventListener("mouseup", function(event) {
//   fitAddon.fit();
// });
document.getElementById("runButton").addEventListener("mousedown", () => {
  runProgram(view.state.doc.toString()).catch(e => {
    console.error(e);
  });

});
document.getElementById("copyUrlButton").addEventListener("mousedown", () => {
  let url = new URL(window.location.href);
  let brotliB64 = base64ToUrlFriendly(bufferToBase64(brotli.compress(encoder.encode(view.state.doc.toString()))))
  url.pathname = brotliB64;
  navigator.clipboard.writeText(url.toString());
  term.write("Copied URL to clipboard.\n");
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let url = new URL(window.location.href);
let brotliB64 = url.pathname.slice(1);
if (brotliB64) {
  let brotliBuffer = base64ToBuffer(urlFriendlyToBase64(brotliB64));
  let input = decoder.decode(brotli.decompress(brotliBuffer));
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

async function runProgram(input) {
  // input += "\nlet main => IO = do\n\nend"; // TODO
  let brotliB64 = base64ToUrlFriendly(bufferToBase64(brotli.compress(encoder.encode(input))))
  window.history.replaceState({}, "", brotliB64);

  const wasi = new WASI([], [], [
    new XTermStdio(term),
    new XTermStdio(term),
    new XTermStdio(term),
    new PreopenDirectory("/usr/local/lib/indigo/std", {
      "prelude.in": new File(new TextEncoder("utf-8").encode(await fetch("indigo-lib/share/std/prelude.in").then(r => r.text()))), // FIXME
    })
  ]);
  const wasiImportObj = { wasi_snapshot_preview1: wasi.wasiImport };
  const wasm = await WebAssembly.instantiateStreaming(fetch("indigo-init.wasm"), wasiImportObj);
  wasi.inst = wasm.instance;
  const exports = wasm.instance.exports;
  const memory = exports.memory;
  const outputPtrPtr = exports.mallocPtr();
  const inputLen = input.length;
  const inputPtr = exports.mallocBytes(inputLen);
  const inputArr = new Uint8Array(memory.buffer, inputPtr, inputLen);
  encoder.encodeInto(input, inputArr);
  const outputLen = exports.runProgramRawBuffered(inputPtr, inputLen, outputPtrPtr);
  const outputPtrArr = new Uint32Array(memory.buffer, outputPtrPtr, 1);
  const outputPtr = outputPtrArr[0];
  const outputArr = new Uint8Array(memory.buffer, outputPtr, outputLen);
  const output = decoder.decode(outputArr);
  term.reset();
  fitAddon.fit();
  term.write(output);
  exports.free_(outputPtr);
}

