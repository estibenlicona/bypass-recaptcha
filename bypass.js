const puppeteer = require("puppeteer");
const axios = require("axios");

(async () => {
  const browser = await puppeteer.launch({ headless: false }); // para ver lo que ocurre
  const page = await browser.newPage();

  // Inyecta la función grecaptcha.execute antes de que se cargue la página
  await page.evaluateOnNewDocument(() => {
    window.grecaptcha = {
      execute: async (siteKey, options) => {
        // La función devuelve un token almacenado globalmente
        return window.__injectedCaptchaToken;
      },
    };
  });

  const targetUrl = "https://pagostarjetadecredito.apps.bancolombia.com/#/inicio";
  await page.goto(targetUrl, { waitUntil: "networkidle2" });

  // Solicita un token válido desde la API de Anti-Captcha
  const apiKey = "1060747c51feabed77dd791515029f49";
  const siteKey = "6LcPAH8eAAAAACfaqTXBXzhPz8Og3iS1ZRk0OTef"; // extraer desde el formulario
  const response = await axios.post("https://api.anti-captcha.com/createTask", {
    clientKey: apiKey,
    task: {
      type: "RecaptchaV3TaskProxyless",
      websiteURL: targetUrl,
      websiteKey: siteKey,
    },
  });
  const taskId = response.data.taskId;

  // Espera y obtiene la solución del token 
  let token;
  while (true) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await axios.post('https://api.anti-captcha.com/getTaskResult', {
      clientKey: apiKey,
      taskId: taskId
    });
    if (res.data.status === 'ready') {
      token = res.data.solution.gRecaptchaResponse;
      break;
    }
  }

  // Inyecta el token válido dentro de la página
  await page.evaluate((captchaToken) => {
    window.__injectedCaptchaToken = captchaToken;
  }, token);

  // Envía el formulario (ajustar al selector correspondiente)
  await page.click('#submit-button');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  await browser.close();
})();
