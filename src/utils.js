// Small utilities used across the project
const sleep = ms => new Promise(r => setTimeout(r, ms));
const randBetween = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

module.exports = { sleep, randBetween };
