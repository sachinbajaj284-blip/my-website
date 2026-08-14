/*
  A DOM small enough to run cashfree-payments.js in Node.

  The checkout helper is plain browser JavaScript, and the thing worth
  testing about it — does pressing Pay actually reach Cashfree? — needs no
  layout, no styling and no real parsing. It needs elements that accept
  innerHTML, hand back something for querySelector, and remember their
  listeners. So that is all this is.

  It is deliberately not a browser. It cannot tell you whether the modal
  looks right; it can tell you whether the code path from lumeCashfreePay()
  to Cashfree.checkout() completes, which is the part that has broken
  before and takes the whole site's revenue with it when it does.
*/

import vm from "node:vm";
import fs from "node:fs";

class FakeElement {
  constructor(tag){
    this.tagName = String(tag || "div").toUpperCase();
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.style = {};
    this.classList = new FakeClassList();
    this._innerHTML = "";
    this.textContent = "";
    this.value = "";
  }
  // Recorded rather than parsed: tests assert on the markup as a string,
  // and querySelector below answers structurally instead of by reading it.
  set innerHTML(html){ this._innerHTML = String(html); }
  get innerHTML(){ return this._innerHTML; }

  setAttribute(k, v){ this.attributes[k] = String(v); }
  getAttribute(k){ return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
  addEventListener(type, fn){ (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn){
    if(!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(f => f !== fn);
  }
  dispatch(type, event){
    (this.listeners[type] || []).slice().forEach(fn => fn.call(this, event || { type }));
  }
  appendChild(node){ this.children.push(node); node.parentElement = node.parentNode = this; return node; }
  removeChild(node){
    this.children = this.children.filter(c => c !== node);
    node.parentElement = node.parentNode = null;
    return node;
  }
  /*
    Every selector matches, and each distinct selector keeps returning the
    same element. The code under test looks up children it just wrote into
    innerHTML — so "found" is the truthful answer, and stability is what
    lets a test click the button a previous line registered a listener on.
  */
  querySelector(sel){
    this._found = this._found || {};
    if(!this._found[sel]){
      const el = new FakeElement("div");
      el.selector = sel;
      this._found[sel] = el;
    }
    return this._found[sel];
  }
  querySelectorAll(sel){ return [this.querySelector(sel)]; }
  focus(){}
  select(){}
  click(){ this.dispatch("click", { type:"click", preventDefault(){} }); }
}

class FakeClassList {
  constructor(){ this.set = new Set(); }
  add(...c){ c.forEach(x => this.set.add(x)); }
  remove(...c){ c.forEach(x => this.set.delete(x)); }
  contains(c){ return this.set.has(c); }
  toggle(c, on){ (on === undefined ? !this.set.has(c) : on) ? this.set.add(c) : this.set.delete(c); }
}

/*
  Loads cashfree-payments.js into a fresh fake window.

  options.onScript(scriptEl) is called whenever the code injects a <script>,
  which is how a test decides what the Cashfree SDK does: load and define
  window.Cashfree, fail, or say nothing at all.
  options.fetch stands in for the network.
*/
export function loadCheckoutHelper(file, options = {}){
  const doc = new FakeElement("html");
  doc.head = new FakeElement("head");
  doc.body = new FakeElement("body");
  doc.documentElement = new FakeElement("html");
  doc.byId = {};

  const scripts = [];
  doc.createElement = tag => {
    const el = new FakeElement(tag);
    // A script only counts as injected once it is in the document, so the
    // hook fires from appendChild rather than from here.
    if(String(tag).toLowerCase() === "script") el._isScript = true;
    return el;
  };
  doc.getElementById = id => doc.byId[id] || null;
  doc.addEventListener = FakeElement.prototype.addEventListener.bind(doc);
  doc.listeners = {};
  doc.querySelector = sel => {
    // Script lookups answer from what is currently in the document, so a
    // tag the helper removes stops being found — which is the behaviour
    // its retry path depends on.
    const m = /^script\[src="(.*)"\]$/.exec(sel);
    if(m) return doc.head.children.find(s => s._isScript && (s.src === m[1] || s.getAttribute("src") === m[1])) || null;
    return null;
  };

  const appendHead = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = node => {
    appendHead(node);
    if(node._isScript){
      scripts.push(node);
      if(options.onScript) options.onScript(node, win);
    }
    return node;
  };

  const store = {};
  const win = {
    document: doc,
    location: { protocol:"https:", href:"https://lumelive.co.in/index.html", pathname:"/index.html", search:"", hash:"" },
    navigator: { userAgent:"node-test", clipboard:null },
    localStorage: {
      getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    fetch: options.fetch || (() => Promise.reject(new Error("no fetch stub"))),
    /* The helper logs every failed checkout, and several tests are about
       failed checkouts — so its warnings are expected output, not signal.
       Pass options.verbose to see them while debugging one. */
    console: options.verbose ? console : { log(){}, warn(){}, error(){}, info(){} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, Error, Set, Map, RegExp,
    encodeURIComponent, decodeURIComponent, isNaN, parseInt, parseFloat,
    CustomEvent: class { constructor(type, init){ this.type = type; Object.assign(this, init || {}); } },
    dispatchEvent(){ return true; },
    addEventListener(){},
    open(){ return null; },
    scripts
  };
  win.window = win;
  win.globalThis = win;
  win.self = win;

  vm.createContext(win);
  vm.runInContext(fs.readFileSync(file, "utf8"), win, { filename: file });
  return win;
}

// The stock happy-path SDK: loads, and defines window.Cashfree the way the
// real one does. `record` collects what checkout() was handed.
export function sdkThatWorks(record){
  return (script, win) => {
    setTimeout(() => {
      win.Cashfree = function(cfg){
        record.mode = cfg && cfg.mode;
        return {
          checkout(opts){
            record.checkout = opts;
            // The real SDK settles only when the payment window closes.
            return new Promise(() => {});
          }
        };
      };
      script.dispatch("load");
    }, 0);
  };
}

export function sdkThatFails(){
  return script => { setTimeout(() => script.dispatch("error"), 0); };
}

// Served, executed, and left window.Cashfree undefined — a wrong file, or
// one an extension neutered.
export function sdkThatIsEmpty(){
  return script => { setTimeout(() => script.dispatch("load"), 0); };
}
