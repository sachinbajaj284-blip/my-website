/*
  A tiny in-memory Firestore, for tests only.

  The coupon rules that decide money — "one use per customer", "first
  session only" — are only meaningful when there is a database to count
  against, so testing them against the real fallback-to-catalogue path
  would prove nothing. This stub stands in for firebase-admin so those
  rules can be exercised for real: seed a redemption or an entitlement,
  then assert the coupon is refused.

  It implements exactly the surface api/_lib uses and no more:
    collection(name).doc(id).get() / .set(data, { merge })
    collection(name).get()
    collection(name).where(field, "==", value).get()
    runTransaction(fn) with tx.get / tx.set

  install() must be called before anything requires firebase-admin,
  because api/_lib/coupons.js caches "Firestore is unavailable" the
  first time it fails to load.
*/

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Module = require("node:module");

function snapshot(id, value){
  return { id, exists: value !== undefined, data: () => value };
}

export function createStore(){
  // "collection/docId" -> plain object
  const docs = new Map();

  function key(collection, id){ return collection + "/" + id; }

  function docRef(collection, id){
    return {
      _collection: collection,
      _id: id,
      get: async () => snapshot(id, docs.get(key(collection, id))),
      set: async (value, options) => {
        const prev = options && options.merge ? (docs.get(key(collection, id)) || {}) : {};
        docs.set(key(collection, id), Object.assign({}, prev, value));
      }
    };
  }

  function collectionRef(name){
    const all = () => Array.from(docs.entries())
      .filter(([k]) => k.startsWith(name + "/"))
      .map(([k, v]) => snapshot(k.slice(name.length + 1), v));

    const withFilters = (filters) => ({
      where: (field, op, value) => withFilters(filters.concat([[field, op, value]])),
      get: async () => {
        const rows = all().filter(s => filters.every(([f, , v]) => s.data()[f] === v));
        return { forEach: fn => rows.forEach(fn), docs: rows, size: rows.length };
      }
    });

    return Object.assign(withFilters([]), { doc: id => docRef(name, id) });
  }

  const firestore = {
    collection: collectionRef,
    runTransaction: async (fn) => {
      // Good enough for tests: the real thing retries on contention, but
      // nothing here runs concurrently.
      const writes = [];
      const tx = {
        get: ref => ref.get(),
        set: (ref, value, options) => writes.push([ref, value, options])
      };
      const result = await fn(tx);
      for(const [ref, value, options] of writes) await ref.set(value, options);
      return result;
    }
  };

  return {
    firestore,
    // Test helpers
    seed(collection, id, value){ docs.set(key(collection, id), value); },
    read(collection, id){ return docs.get(key(collection, id)); },
    clear(){ docs.clear(); },
    dump(){ return Object.fromEntries(docs); }
  };
}

/*
  Intercepts require("firebase-admin") process-wide and hands back a fake
  whose firestore() is the in-memory store. Also fills in the three
  credential variables firebaseAdmin.js insists on.
*/
export function install(){
  const store = createStore();

  process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "test-project";
  process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || "test@example.com";
  process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || "test-key";

  const app = { firestore: () => store.firestore, auth: () => ({}) };
  const fake = {
    apps: [],
    credential: { cert: () => ({}) },
    initializeApp: () => { fake.apps.push(app); return app; },
    app: () => app
  };

  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain){
    if(request === "firebase-admin") return fake;
    return originalLoad.apply(this, arguments);
  };

  return store;
}
