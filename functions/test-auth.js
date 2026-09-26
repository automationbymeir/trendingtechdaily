const admin = require('firebase-admin');
const sa = require('./sa.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
admin.auth().createCustomToken('admin-user', { admin: true })
  .then(token => console.log('Token:', token))
  .catch(console.error);
