const cds = require("@sap/cds");
const bodyParser = require("body-parser");

cds.on("bootstrap", app => {
  // Increase limit to 20 MB
  app.use(bodyParser.json({ limit: "50mb" }));
  app.use(bodyParser.raw({ limit: "50mb" }));
  app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
});

module.exports = cds.server;
