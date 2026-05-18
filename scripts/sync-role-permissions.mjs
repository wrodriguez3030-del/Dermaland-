#!/usr/bin/env node
// Helper opcional para regenerar 0005_dgii_role_permissions_seed.sql desde
// roleDefinitions. NO se ejecuta en CI — el test ya verifica que ambos
// estén en sync. Sirve cuando se cambian asignaciones y quieres regenerar
// el SQL sin escribirlo a mano.
//
//   node scripts/sync-role-permissions.mjs
console.log("Helper aún no implementado — escribe el SQL a mano y deja que el test verifique sync.");
