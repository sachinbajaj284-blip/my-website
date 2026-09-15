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
  /*
    Internal documentation, not pages. These are runbooks written for
    whoever operates the site — docs/manual-entitlements.md walks through
    the admin route that hands out paid product and names the environment
    variable that arms it, and the others describe how access, coupons and
    owner notifications actually work. None of it is secret in the sense
    of containing a credential, but publishing the operations manual for
    your own payment and entitlement system at a guessable path is free
    reconnaissance for anyone poking at it. Nothing on the site links
    here and nothing in the sitemap points here, so excluding it costs
    nothing.
  */
  "docs",
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
  if(/^(create-order|order-status|webhook)\.js$/i.test(name)) return false;
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

/*
  Freshness stamping.

  dateModified in the JSON-LD and <lastmod> in sitemap.xml were both
  maintained by hand. The sitemap was kept in good shape, but the schema
  dates were not: the newest dateModified in the repo was 2026-07-28, months
  behind pages that had genuinely changed since, and on most pages it had
  simply been left equal to datePublished. Recency is a real input to how
  search and AI answer engines pick sources, so a page that under-reports
  its own freshness is competing with a handicap.

  Both are now derived at build time from the last commit that touched each
  file, so they agree with each other and with reality without anyone
  editing a date again.

  If git is not available (or the file is untracked), the existing value is
  left exactly as it is — a wrong date is better than no date, and silently
  stamping every page with "today" would be a freshness claim we cannot
  back up.
*/
const { execFileSync } = require("child_process");

function gitAvailable(){
  try{
    execFileSync("git", ["rev-parse", "--git-dir"], { cwd: root, stdio: "ignore" });
    return true;
  }catch(err){
    return false;
  }
}

// Last commit date (YYYY-MM-DD) that touched a file, or null when git does
// not know about it — a new file that has never been committed included.
function lastCommitDate(relPath){
  try{
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", relPath], {
      cwd: root,
      encoding: "utf8"
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  }catch(err){
    return null;
  }
}

function stampDates(){
  if(!gitAvailable()){
    console.log("Freshness stamping skipped: no git metadata in the build environment.");
    return;
  }

  const dateCache = new Map();
  function dateFor(relPath){
    if(!dateCache.has(relPath)) dateCache.set(relPath, lastCommitDate(relPath));
    return dateCache.get(relPath);
  }

  let pagesStamped = 0;

  for(const name of fs.readdirSync(target)){
    if(!name.endsWith(".html")) continue;
    const committed = dateFor(name);
    if(!committed) continue;

    const file = path.join(target, name);
    let html = fs.readFileSync(file, "utf8");
    let changed = false;

    html = html.replace(/("dateModified"\s*:\s*")(\d{4}-\d{2}-\d{2})(")/g, (match, open, current, close) => {
      // A page cannot have been modified before it was published. Where the
      // two disagree the published date wins, so a file whose only commit
      // predates its stated datePublished is left alone rather than being
      // stamped backwards.
      const published = (html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1];
      const stamped = published && committed < published ? published : committed;
      if(stamped === current) return match;
      changed = true;
      return open + stamped + close;
    });

    if(changed){
      fs.writeFileSync(file, html);
      pagesStamped++;
    }
  }

  // The footer copyright year was hardcoded and had gone stale — it read 2025
  // into 2026. A visibly out-of-date footer is a small thing that reads as an
  // abandoned site, to visitors and to anyone assessing the site as a source.
  // Stamp it from the build clock so it cannot drift again.
  const buildYear = String(new Date().getFullYear());
  let footersStamped = 0;

  for(const name of fs.readdirSync(target)){
    if(!name.endsWith(".html")) continue;
    const file = path.join(target, name);
    const html = fs.readFileSync(file, "utf8");
    const stamped = html.replace(
      /(&copy;|©)(\s*)(20\d{2})(\s*Lume Live)/g,
      (match, sym, gapA, year, tail) => year === buildYear ? match : sym + gapA + buildYear + tail
    );
    if(stamped !== html){
      fs.writeFileSync(file, stamped);
      footersStamped++;
    }
  }

  const sitemap = path.join(target, "sitemap.xml");
  let urlsStamped = 0;

  if(fs.existsSync(sitemap)){
    let xml = fs.readFileSync(sitemap, "utf8");

    xml = xml.replace(/<loc>([^<]+)<\/loc>(\s*)<lastmod>([^<]+)<\/lastmod>/g, (match, loc, gap, current) => {
      // Map the published URL back to the file it is served from. A URL
      // ending in "/" is the site root, which is index.html.
      let rel = loc.replace(/^https?:\/\/[^/]+\//, "");
      if(rel === "" || rel.endsWith("/")) rel += "index.html";

      const committed = dateFor(rel);
      if(!committed || committed === current) return match;
      urlsStamped++;
      return "<loc>" + loc + "</loc>" + gap + "<lastmod>" + committed + "</lastmod>";
    });

    if(urlsStamped) fs.writeFileSync(sitemap, xml);
  }

  console.log(
    "Stamped freshness dates from git: " + pagesStamped + " page(s), " + urlsStamped + " sitemap URL(s)."
  );
  console.log("Stamped copyright year " + buildYear + " into " + footersStamped + " footer(s).");
}

stampDates();
