/*
  One serverless function per route group, instead of one per route.

  Vercel turns every file under api/ into its own function, and the Hobby
  plan deploys at most twelve of them. The site was already sitting on
  exactly twelve, so the agent's nine routes and the assessment's three
  took the deployment to twenty-four and it stopped building — which is
  also why PR #60, which adds a single route, has been failing since 15
  August.

  So the handlers moved under api/_lib/, where the leading underscore
  keeps them out of routing, and each group is reached through one
  catch-all that dispatches on the last path segment. The handlers
  themselves are unchanged: same signature, same behaviour, still
  individually requirable by the tests.
*/

function segment(url){
  const path = String(url || "").split("?")[0].replace(/\/+$/, "");
  return path.slice(path.lastIndexOf("/") + 1);
}

/*
  routes maps a path segment to a handler. An unknown segment is a 404
  and not a crash, because the catch-all receives everything under the
  prefix — including paths nobody defined.
*/
function dispatcher(prefix, routes){
  return async function handler(req, res){
    const name = segment(req.url);
    const route = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : null;
    if(!route){
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "NOT_FOUND", message: "No such endpoint: /api/" + prefix + "/" + name }));
      return;
    }
    return route(req, res);
  };
}

module.exports = { dispatcher, segment };
