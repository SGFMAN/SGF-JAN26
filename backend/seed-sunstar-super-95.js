/**
 * One-shot seed scripts for colour catalogues are disabled.
 * Manage colours only via Colour Settings / the DB — never auto-reseed.
 */
console.error(
  "Colour catalogue seed scripts are disabled. Add/edit/delete colours in Colour Settings; they are stored in the DB only."
);
process.exit(1);
