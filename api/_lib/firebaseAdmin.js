/*
  Shared Firebase Admin SDK init for server-side entitlement records.

  This file lives under api/_lib/ — the underscore prefix tells Vercel
  NOT to turn it into a route (https://vercel.com/docs/functions/functions-api-reference
  — folders/files prefixed with "_" are excluded from routing). It's a
  plain module other /api functions require().

  Required environment variables (Vercel -> Project -> Settings -> Environment):
  FIREBASE_PROJECT_ID
  FIREBASE_CLIENT_EMAIL
  FIREBASE_PRIVATE_KEY   (paste the full private key from the service
                          account JSON; \n line breaks are normalised below)
*/

const admin = require("firebase-admin");

let app = null;

function getAdmin(){
  if(app) return app;
  if(admin.apps.length){ app = admin.app(); return app; }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if(!projectId || !clientEmail || !privateKey){
    throw new Error("Firebase Admin credentials are not configured (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).");
  }

  app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
  });
  return app;
}

function db(){
  return getAdmin().firestore();
}

module.exports = { getAdmin, db };
