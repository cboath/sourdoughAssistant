/** No test may depend on the machine's time zone (ADR 0013). */
module.exports = async () => {
  process.env.TZ = 'UTC';
};
