const { shouldGenerateArticle, generateArticle, generateTrendingArticles } = require("./scheduledArticles");

async function test() {
  try {
    const res = await generateTrendingArticles(1);
    console.log("Success:", res.length);
  } catch (e) {
    console.error("Error:", e);
  }
}
test();
