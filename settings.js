const fs = require('fs');
const chalk = require('chalk');

// Global Settings
global.owner = ['6285119841423']; // Nomor owner
global.nomorowner = '6285119841423';
global.namabot = 'LAVIATHAN BOT';
global.pairing_code = true; // Pakai pairing code
global.number_bot = '6285119841423'; // Nomor bot

// Telegram config
global.telegram = {
  token: '8017305405:AAETz9BP9RA95kTbdSobYMi0PboRjhXqfGY',
  ownerId: '7761172551',
  enable: true
};

// Fitur limit
global.limit = {
  free: 25,
  premium: Infinity
};

// Media folder
global.media = {
  menu: './media/menu.gif',
  no: './media/no.gif',
  done: './media/done.gif',
  tag: './media/tag.jpg'
};

// Database paths
global.tempatDB = './database/database.json';
global.tempatStore = './database/store.json';

// APIs
global.APIs = {
  naze: 'https://api.naze.my.id'
};
global.APIKeys = {
  'https://api.naze.my.id': 'nazedev'
};

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.redBright(`Update'${__filename}'`));
  delete require.cache[file];
  require(file);
});
