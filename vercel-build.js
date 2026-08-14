const fs = require("fs");
const path = require("path");

const root = __dirname;
const target = path.join(root, "public");

const skipDirs = new Set([
  ".git",
  // Workflow files are repository configuration, not pages. They were
  // being copied into public/ and served from lumelive.co.in, which
  // published the schedule and steps of every CI job to anyone who
  // guessed the path.
  ".github",
  ".vercel",
  "api",
  "godaddy-cashfree-node-app",
  "node_modules",
  "previews",
  "public",
  // Dataset build scripts and their raw-HTML cache. data/ IS published (the
  // predictor fetches it at runtime); the tooling that generates it is not.
  "tools",
  "work"
]);

const skipFiles = new Set([
  ".env",
  ".env.local",
  "APIKey.csv",
  "package.json",
  "package-lock.json",
  "vercel-build.js",
  "vercel.json",
  "GITHUB_PAGES_CASHFREE_SETUP.md",
  "GODADDY_CASHFREE_SETUP.md",
  "CASHFREE_SETUP.md",
  "LUMELENS_BACKEND_SETUP.md"
]);

function shouldCopyFile(name){
  if(skipFiles.has(name)) return false;
  if(name.startsWith(".env")) return false;
  if(/apikey/i.test(name)) return false;
  if(/\.(zip|psd|ai)$/i.test(name)) return false;
  // Backend/integration source files belong under api/ (which is never
  // copied into public/, see skipDirs above). A .js file with one of
  // these names sitting at the repo root is almost certainly a stray
  // duplicate, not a page script — don't publish it by accident.
  if(/^(create-order|order-status)\.js$/i.test(name)) return false;
  if(/\.example\.js$/i.test(name)) return false;
  return true;
}

function copyDir(from, to, isRootSource){
  fs.mkdirSync(to, { recursive: true });
  for(const entry of fs.readdirSync(from, { withFileTypes: true })){
    if(entry.isDirectory() && isRootSource && skipDirs.has(entry.name)) continue;
    if(entry.isFile() && isRootSource && !shouldCopyFile(entry.name)) continue;

    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if(entry.isDirectory()){
      copyDir(src, dest, false);
    }else{
      fs.copyFileSync(src, dest);
    }
  }
}

function findSource(){
  const outputs = path.join(root, "outputs");
  if(fs.existsSync(path.join(outputs, "index.html"))){
    return { path: outputs, isRootSource: false, label: "outputs/" };
  }
  if(fs.existsSync(path.join(root, "index.html"))){
    return { path: root, isRootSource: true, label: "repository root" };
  }
  throw new Error("Could not find index.html in outputs/ or repository root.");
}

const source = findSource();
fs.rmSync(target, { recursive: true, force: true });
copyDir(source.path, target, source.isRootSource);
console.log("Copied website files from " + source.label + " to public/ for Vercel.");
