// Pont entre Electron et l'interface. Rien n'est exposé pour l'instant :
// l'interface n'a pas accès au disque ni au système (contextIsolation).
// C'est ici qu'on ajoutera plus tard, par exemple, la sauvegarde de fichiers ou le réseau.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('gwb', {
  platform: process.platform,
});
