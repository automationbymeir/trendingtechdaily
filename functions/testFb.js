const fetch = require('node-fetch');

const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || "EAAXSLPA21hsBRfV0a9s64bR4MfitEaZCRrxll3BFCiygHZBuu8yaIZCR1CeDROGKfwZBYyqQ9bYc9K8jRAZBECKoplUKpFrFcb2fWP8sFw3J7LLervmLqT9Mz8s3RKeZCW1oZAetlwb592CPrMelXTLBvZA9bZBdwZCTjfKvh6jiubkkRdsHdfAVwn9rAPPEPsHlsjTgZDZD";
const FB_PAGE_ID = "1015383948335262";

const main = async () => {
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${FB_PAGE_ID}/photos`, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://trendingtechdaily.com/images/default-featured-image.jpg", // Just a dummy test image if real is not available
        message: "Test clickbait! Read more: https://trendingtechdaily.com\n\n#TechNews",
        access_token: IG_ACCESS_TOKEN
      })
    });
    const data = await res.json();
    console.log(data);
  } catch(e) {
    console.error(e);
  }
};
main();
