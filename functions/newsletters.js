const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const functions = require("firebase-functions");
const cors = require("cors");
const corsHandler = cors({ origin: true });

const db = admin.firestore();

const getTransporter = () => {
    // Try to get from process.env, or fallback to known password, as functions.config() fails in v2
    const emailPassword = process.env.EMAIL_PASSWORD || "hbxo imek rvpf csqn";
    if (!emailPassword) {
        throw new Error("Email password not configured properly.");
    }
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'info@trendingtechdaily.com',
            pass: emailPassword
        }
    });
};

const getTopArticles = async (collectionName, limit = 5) => {
    const snapshot = await db.collection(collectionName)
        .where("published", "==", true)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
    
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            title: data.title || "Trending Tech Article",
            excerpt: data.excerpt || data.summary || "Read more about this trending topic.",
            imageUrl: data.featuredImage || data.imageUrl || "https://trendingtechdaily.com/img/og-image.jpg",
            slug: data.slug || doc.id,
            categorySlug: data.categorySlug || 'technology'
        };
    });
};

const buildEmailTemplate = (articles, language, customTitle = null, subscriberEmail = "") => {
    const isHebrew = language === 'he';
    const direction = isHebrew ? 'rtl' : 'ltr';
    const baseUrl = "https://trendingtechdaily.com";
    const title = customTitle || (isHebrew ? "החדשות החמות של השבוע בטכנולוגיה" : "This Week's Top Tech News");
    const readMoreText = isHebrew ? "קרא עוד" : "Read More";
    const unsubscribeLink = `${baseUrl}/unsubscribe.html?email=${encodeURIComponent(subscriberEmail)}`;
    const unsubscribeText = isHebrew ? "להסרה מהרשימה לחץ כאן" : "Click here to unsubscribe";
    const footerText = isHebrew 
        ? `קיבלת מייל זה כי נרשמת לניוזלטר של TrendingTech Daily.<br><a href="${unsubscribeLink}" style="color: #888888; text-decoration: underline;">${unsubscribeText}</a>` 
        : `You received this email because you subscribed to the TrendingTech Daily newsletter.<br><a href="${unsubscribeLink}" style="color: #888888; text-decoration: underline;">${unsubscribeText}</a>`;

    const articlesHtml = articles.map(article => `
        <div style="margin-bottom: 30px; border-bottom: 1px solid #eeeeee; padding-bottom: 20px;">
            ${article.imageUrl ? `<img src="${article.imageUrl}" alt="${article.title}" style="max-width: 100%; border-radius: 8px; margin-bottom: 15px;">` : ''}
            <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 10px; color: #333333;">
                <a href="${baseUrl}${isHebrew ? '/he' : ''}/${article.categorySlug}/${article.slug}" style="color: #000000; text-decoration: none;">${article.title}</a>
            </h2>
            <p style="font-size: 15px; color: #666666; line-height: 1.5; margin-bottom: 15px;">${article.excerpt}</p>
            <a href="${baseUrl}${isHebrew ? '/he' : ''}/${article.categorySlug}/${article.slug}" style="display: inline-block; padding: 10px 20px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold;">${readMoreText}</a>
        </div>
    `).join('');

    return `
    <!DOCTYPE html>
    <html dir="${direction}" lang="${language}">
    <head>
        <meta charset="UTF-8">
        <title>${title}</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 0; margin: 0; direction: ${direction}; text-align: ${isHebrew ? 'right' : 'left'};">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; margin-top: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
            <!-- Cover Photo Header -->
            <div style="background-color: #111111; padding: 40px 20px; text-align: center; border-bottom: 4px solid #2196F3;">
                <img src="https://www.trendingtechdaily.com/img/newsletter-logo.jpg" alt="TrendingTech Daily" style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid #ffffff; background-color: #ffffff; display: block; margin: 0 auto;">
            </div>
            
            <div style="padding: 30px 20px;">
                <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 30px; color: #333333; text-align: center;">${title}</h1>
                ${articlesHtml}
            </div>
            <div style="background-color: #f1f1f1; padding: 20px; text-align: center; font-size: 12px; color: #888888;">
                <p>${footerText}</p>
                <p>&copy; ${new Date().getFullYear()} TrendingTech Daily. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

const sendNewsletterTask = async (isTest = false, testEmail = null) => {
    logger.info("Starting newsletter generation and sending task");
    try {
        const transporter = getTransporter();
        
        // Fetch top articles
        const enArticles = await getTopArticles("articles");
        const heArticles = await getTopArticles("he_articles");
        
        if (enArticles.length === 0 && heArticles.length === 0) {
            logger.info("No published articles found. Skipping newsletter.");
            return { success: true, message: "No articles to send." };
        }
        
        // HTML generation is deferred to the loop to pass the specific subscriber email
        
        let targetSubscribers = [];
        
        if (isTest && testEmail) {
            targetSubscribers.push({ email: testEmail, subscribedEn: true, subscribedHe: true });
        } else {
            const subSnapshot = await db.collection("subscribers").get();
            subSnapshot.forEach(doc => {
                targetSubscribers.push(doc.data());
            });
        }
        
        let sentCount = 0;
        
        for (const sub of targetSubscribers) {
            if (!sub.email) continue;
            
            try {
                if (sub.subscribedEn && enArticles.length > 0) {
                    const enHtml = buildEmailTemplate(enArticles, 'en', null, sub.email);
                    await transporter.sendMail({
                        from: 'TrendingTech Daily <info@trendingtechdaily.com>',
                        to: sub.email,
                        subject: "This Week's Top Tech News",
                        html: enHtml
                    });
                    sentCount++;
                }
                
                if (sub.subscribedHe && heArticles.length > 0) {
                    const heHtml = buildEmailTemplate(heArticles, 'he', null, sub.email);
                    await transporter.sendMail({
                        from: 'TrendingTech Daily <info@trendingtechdaily.com>',
                        to: sub.email,
                        subject: "החדשות החמות של השבוע בטכנולוגיה",
                        html: heHtml
                    });
                    sentCount++;
                }
            } catch (err) {
                logger.error(`Failed to send newsletter to ${sub.email}:`, err);
            }
        }
        
        logger.info(`Successfully sent ${sentCount} newsletter emails.`);
        return { success: true, sentCount };
    } catch (error) {
        logger.error("Error in newsletter task:", error);
        return { success: false, error: error.message };
    }
};

exports.weeklyNewsletterSender = onSchedule({
    schedule: "every friday 16:00",
    timezone: "Asia/Jerusalem",
    timeoutSeconds: 540,
    memory: "512MiB"
}, async (event) => {
    await sendNewsletterTask();
});

exports.testSendNewsletter = onRequest({
    timeoutSeconds: 300,
    memory: "512MiB",
    cors: true
}, async (req, res) => {
    const email = req.query.email || "info@trendingtechdaily.com";
    const result = await sendNewsletterTask(true, email);
    res.json(result);
});

exports.subscribeNewsletter = onRequest({
    cors: true
}, async (req, res) => {
    try {
        const email = req.body.email || req.query.email;
        const lang = req.body.lang || req.query.lang || 'en';
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, error: "Valid email required" });
        }
        
        // Generate a simple ID for anonymous subscribers based on email
        const subId = "anon_" + email.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        const updateData = {
            email: email.toLowerCase(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        if (lang === 'he') {
            updateData.subscribedHe = true;
            // if we don't know en, let's keep it as is, or set to false if new
        } else {
            updateData.subscribedEn = true;
        }
        
        await db.collection('subscribers').doc(subId).set(updateData, { merge: true });
        
        // Send Welcome Email
        try {
            const isHebrew = lang === 'he';
            const collectionName = isHebrew ? 'he_articles' : 'articles';
            const recentArticles = await getTopArticles(collectionName, 3);
            const transporter = getTransporter();
            const subject = isHebrew ? "ברוכים הבאים לניוזלטר של TrendingTech Daily!" : "Welcome to the TrendingTech Daily Newsletter!";
            const introTitle = isHebrew ? "תודה שנרשמתם! הנה טעימה מהכתבות האחרונות שלנו:" : "Thanks for subscribing! Here's a taste of our latest articles:";
            const welcomeHtml = buildEmailTemplate(recentArticles, lang, introTitle, email);
            
            await transporter.sendMail({
                from: 'TrendingTech Daily <info@trendingtechdaily.com>',
                to: email,
                subject: subject,
                html: welcomeHtml
            });
            logger.info(`Welcome email sent to ${email}`);
        } catch (mailErr) {
            logger.error(`Failed to send welcome email to ${email}:`, mailErr);
        }
        
        res.json({ success: true, message: "Subscribed successfully" });
    } catch (error) {
        logger.error("Subscribe error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

exports.unsubscribeNewsletter = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        try {
            const email = req.query.email || req.body.email;
            if (!email) {
                return res.status(400).json({ success: false, error: "Email is required" });
            }
            
            // Find user in subscribers collection
            const snapshot = await db.collection('subscribers').where('email', '==', email).get();
            if (!snapshot.empty) {
                const docRef = snapshot.docs[0].ref;
                await docRef.update({
                    subscribedEn: false,
                    subscribedHe: false,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            
            // Find user in users collection
            const usersSnapshot = await db.collection('users').where('email', '==', email).get();
            if (!usersSnapshot.empty) {
                const userDocRef = usersSnapshot.docs[0].ref;
                await userDocRef.update({
                    newsletter: false,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            
            res.json({ success: true, message: "Unsubscribed successfully" });
        } catch (error) {
            logger.error("Unsubscribe error:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

