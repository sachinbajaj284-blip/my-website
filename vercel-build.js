const fs = require("fs");
const path = require("path");

const root = __dirname;
const source = path.join(root, "outputs");
const target = path.join(root, "public");

function copyDir(from, to){
  fs.mkdirSync(to, { recursive: true });
  for(const entry of fs.readdirSync(from, { withFileTypes: true })){
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if(entry.isDirectory()){
      copyDir(src, dest);
    }else{
      fs.copyFileSync(src, dest);
    }
  }
}

if(!fs.existsSync(source)){
  throw new Error("Missing outputs folder. The website files must be inside outputs/.");
}

fs.rmSync(target, { recursive: true, force: true });
copyDir(source, target);
console.log("Copied outputs/ to public/ for Vercel.");
