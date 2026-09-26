const fetch = require('node-fetch');

const PAGE_ACCESS_TOKEN = "EAAXSLPA21hsBRZAdqMaQZCeuNnaU7EL75DZBeQGcfmp0VkqVeKyWSQ55pbcWfibQILaZBXOd68NtXtSlH8GAUEVc6wAQUzA1c43UXJmProfm75ZAefCqsnYmEOH3Wt2zr4EWO3Wd88CL03JEoOP1m2M1dBZBg7ZCAM3WaOQiK0yLCEjVU8UvRbMZCK7VxdKMxWZCfcAZDZD";
const FB_PAGE_ID = "1015383948335262";

const main = async () => {
  try {
    const params = new URLSearchParams({
      access_token: PAGE_ACCESS_TOKEN,
      company_overview: "TrendingTechDaily is an AI-powered tech news aggregator & publisher.",
      general_info: "Tech News Without the Fluff 🚀"
    });

    const res = await fetch(`https://graph.facebook.com/v20.0/${FB_PAGE_ID}`, {
      method: 'POST',
      body: params
    });
    const data = await res.json();
    console.log("Update Page Response:", JSON.stringify(data, null, 2));
  } catch(e) {
    console.error(e);
  }
};
main();
