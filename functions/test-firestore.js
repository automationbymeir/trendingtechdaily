const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'trendingtech-daily' });
const db = admin.firestore();
async function main() {
    const snap = await db.collection('stories').get();
    snap.forEach(doc => console.log(doc.id, doc.data()));
}
main();
