const STATUS = {
  UPLOADING: "UPLOADING",
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  OPTIMISING: "OPTIMISING",
  READY: "READY",
  FAILED: "FAILED",
};

const ACTIVE = new Set([STATUS.UPLOADING, STATUS.QUEUED, STATUS.PROCESSING, STATUS.OPTIMISING]);

const MESSAGES = {
  [STATUS.UPLOADING]: "Uploading the file…",
  [STATUS.QUEUED]: "Waiting to convert…",
  [STATUS.PROCESSING]: "Converting the model…",
  [STATUS.OPTIMISING]: "Preparing the model for the browser…",
  [STATUS.READY]: "Ready to view",
  [STATUS.FAILED]: "Conversion failed",
};

module.exports = { STATUS, ACTIVE, MESSAGES };
