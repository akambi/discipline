module.exports = {
  defaultProvider: () => async () => ({ accessKeyId: 'test', secretAccessKey: 'test' }),
  fromEnv: () => async () => ({ accessKeyId: 'test', secretAccessKey: 'test' }),
  fromIni: () => async () => ({ accessKeyId: 'test', secretAccessKey: 'test' }),
};
