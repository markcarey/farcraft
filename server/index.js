global.__base = __dirname + '/';

var functions = require('firebase-functions');
var firebase = require('firebase-admin');
firebase.initializeApp();

var farcraft = require(__base + 'farcraft');
exports.farcraftApi = functions.runWith({secrets: ["FARCRAFT_MINTER_PRIV"]}).https.onRequest((req, res) => {
  return farcraft.api(req, res);
}); // farcraftApi
exports.farcraftCron = functions.runWith({secrets: ["FARCRAFT_MINTER_PRIV"]}).pubsub.schedule('every 5 minutes').onRun((context) => {
  return farcraft.cron(context);
}); // farcraftCron
exports.farcraftNewUser = functions.runWith({secrets: ["FARCRAFT_MINTER_PRIV"]}).firestore.document('farcraft/1/users/{fid}').onCreate((snap, context) => {
  return farcraft.newUser(snap, context);
}); // farcraftNewUser
exports.farcraftUpdateUser = functions.runWith({secrets: ["FARCRAFT_MINTER_PRIV"]}).firestore.document('farcraft/1/users/{fid}').onUpdate((change, context) => {
  return farcraft.updateUser(change, context);
}); // farcraftNewUser
exports.farcraftNewToken = functions.firestore.document('farcraft/1/tokens/{tokenId}').onCreate((snap, context) => {
  return farcraft.newToken(snap, context);
}); // farcraftNewToken
