function getLocalDate(timezoneOffset = -4) {
  const local = new Date(Date.now() + timezoneOffset * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

module.exports = { getLocalDate };
