/*
  The plumbing every /api function repeats: a JSON reply, the CORS
  allow-list, and a size-capped JSON body reader.

  This was copied verbatim in create-order.js and order-status.js before
  the coupon endpoints needed a third copy. Same behaviour, one place —
  in particular the allow-list, which is a security control and should
  never be able to drift between endpoints.
*/

const DEFAULT_ALLOWED_ORIGINS = [
  "https://lumelive.co.in",
  "https://www.lumelive.co.in",
  "http://127.0.0.1:8765",
  "http://localhost:8765"
];

function json(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function allowedOrigins(){
  return new Set(DEFAULT_ALLOWED_ORIGINS.concat(
    String(process.env.LUME_ALLOWED_ORIGINS || "")
      .split(",")
      .map(function(origin){ return origin.trim(); })
      .filter(Boolean)
  ));
}

// `methods` is the Access-Control-Allow-Methods value for this endpoint,
// e.g. "POST,OPTIONS" — kept explicit so a GET-only route doesn't
// advertise POST.
function setCors(req, res, methods){
  const origin = req.headers.origin || "";
  if(origin && allowedOrigins().has(origin)){
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", methods || "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const MAX_BODY_BYTES = 16 * 1024; // 16 KB is far more than a checkout payload needs

function readBody(req){
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    let aborted = false;
    req.on("data", chunk => {
      if(aborted) return;
      size += chunk.length;
      if(size > MAX_BODY_BYTES){
        aborted = true;
        const err = new Error("Request body too large.");
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if(aborted) return;
      try{ resolve(raw ? JSON.parse(raw) : {}); }
      catch(err){ reject(err); }
    });
    req.on("error", reject);
  });
}

module.exports = { json, setCors, readBody, allowedOrigins, MAX_BODY_BYTES };
