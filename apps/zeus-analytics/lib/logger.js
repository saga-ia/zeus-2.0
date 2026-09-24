function ts() {
  return new Date().toISOString();
}
function fmt(level, scope, msg, extra) {
  const e = extra ? ' ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '';
  return `[${ts()}] [${level}] [${scope}] ${msg}${e}`;
}
module.exports = {
  info:  (scope, msg, extra) => console.log(fmt('INFO',  scope, msg, extra)),
  warn:  (scope, msg, extra) => console.warn(fmt('WARN',  scope, msg, extra)),
  error: (scope, msg, extra) => console.error(fmt('ERROR', scope, msg, extra)),
};
