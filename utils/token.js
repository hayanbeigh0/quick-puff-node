const crypto = require("crypto");

function generateInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = { generateInviteToken };
