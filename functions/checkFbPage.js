const fetch = require('node-fetch');

const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || "EAAXSLPA21hsBRRWf4ghtkTz0abnZB6udl8oYMt5NO2bai1ZC5w2YEBHMZCeaI2ZCn1FEuzsPEVfetoTuhxglj7lH546HgMaSvryvilWR3zu1nMCCGdFNX65PZBVg2yZCDEsA9pB9WoQzMtt3MaAUqJseJMT0lkvyAtflgjTjRC1AyWZBfeEao3rhGwJLzqdgAZDZD";
const FB_PAGE_ID = "1015383948335262";

const PAGE_ACCESS_TOKEN = "EAAXSLPA21hsBRZAdqMaQZCeuNnaU7EL75DZBeQGcfmp0VkqVeKyWSQ55pbcWfibQILaZBXOd68NtXtSlH8GAUEVc6wAQUzA1c43UXJmProfm75ZAefCqsnYmEOH3Wt2zr4EWO3Wd88CL03JEoOP1m2M1dBZBg7ZCAM3WaOQiK0yLCEjVU8UvRbMZCK7VxdKMxWZCfcAZDZD";

const main = async () => {
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${FB_PAGE_ID}?fields=about,description,website,emails,phone,company_overview,general_info,location&access_token=${PAGE_ACCESS_TOKEN}`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch(e) {
    console.error(e);
  }
};
main();
