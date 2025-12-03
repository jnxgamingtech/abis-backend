// Admin key middleware disabled for local development / ease of use.
// Previously this checked for a header matching ADMIN_API_KEY and returned 403.
// To allow admin endpoints to be used without a key, we simply call next().
module.exports = function (req, res, next) {
  return next();
};
