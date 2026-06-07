function getLocalDate(timezoneOffset = -4) {
  const local = new Date(Date.now() + timezoneOffset * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

function getHeureLocale(timezoneOffset = -4) {
  if (process.env.FORCE_HEURE) return parseInt(process.env.FORCE_HEURE, 10);
  const local = new Date(Date.now() + timezoneOffset * 3600 * 1000);
  return local.getUTCHours();
}

module.exports = { getLocalDate, getHeureLocale };
