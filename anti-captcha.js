const puppeteer = require("puppeteer");
const ac = require("@antiadmin/anticaptchaofficial");

(async () => {
  //Configurar AntiCaptcha
  ac.setAPIKey("1060747c51feabed77dd791515029f49");
  ac.setSoftId(0);

  const token = await ac.solveRecaptchaV3(
    "https://pagostarjetadecredito.apps.bancolombia.com/#/inicio",
    "6LcPAH8eAAAAACfaqTXBXzhPz8Og3iS1ZRk0OTef",
    0.3,
    "initialForm"
  );
  console.log("✅ Token resuelto:", token);

  const browser = await puppeteer.launch({
    headless: false,
    devtools: false,
    args: ['--window-size=1920,1080']
  });

  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await page.setRequestInterception(true);
  page.on("request", (interceptedRequest) => {
    if (
      interceptedRequest
        .url()
        .includes("https://www.google.com/recaptcha/api.js")
    ) {
      interceptedRequest.abort();
      console.log("🛑 Bloqueado:", interceptedRequest.url());
    } else {
      interceptedRequest.continue();
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await page.goto(
    "https://pagostarjetadecredito.apps.bancolombia.com/#/inicio",
    {
      waitUntil: "domcontentloaded",
    }
  );

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Inyectar reCAPTCHA resuelto
  await page.evaluate((token) => {
    window["grecaptcha"] = {
      execute: function (sitekey, parameters) {
        console.log(
          `called execute function with sitekey ${sitekey} and parameters`,
          parameters
        );
        return new Promise((resolve) => resolve(token));
      },
      ready: function (callback) {
        callback();
      },
    };
  }, token);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("✅ Página cargada, diligenciando formulario...");

  // Esperar que cargue el input del tipo de documento
  await page.waitForSelector("#documentType-input", { visible: true });
  await page.click("#documentType-input");

  // Esperar que se muestren las opciones del select
  await page.waitForSelector(
    ".bc-input-select-content-active .bc-input-select-item",
    { visible: true }
  );

  // Seleccionar "Cédula de ciudadanía"
  await page.evaluate(() => {
    const opciones = document.querySelectorAll(
      ".bc-input-select-content-active .bc-input-select-item"
    );
    for (const opcion of opciones) {
      const span = opcion.querySelector(".bc-span-single");
      if (span && span.textContent.trim() === "Cédula de ciudadanía") {
        opcion.click();
        break;
      }
    }
  });

  // Esperar y escribir número de documento
  await page.waitForSelector("#documentNumber", { visible: true });
  await page.type("#documentNumber", "8466342");

  // Escribir los últimos 5 dígitos de la tarjeta
  await page.waitForSelector("#last5DigitsCard", { visible: true });
  await page.type("#last5DigitsCard", "96211");

  // Aceptar términos y condiciones
  await page.evaluate(() => {
    const checkbox = document.querySelector("span.bc-checkbox");
    if (checkbox) checkbox.click();
  });

  // Esperar y hacer clic en botón Continuar
  await new Promise((resolve) => setTimeout(resolve, 2000)); // Espera a que el botón se habilite
  await page.evaluate(() => {
    const botones = document.querySelectorAll("button");
    for (const boton of botones) {
      const texto = boton.textContent.trim();
      const estaDeshabilitado = boton.disabled;

      if (texto.includes("Continuar")) {
        if (!estaDeshabilitado) {
          boton.click();
          console.log("🚀 Formulario enviado");
        } else {
          console.warn('⚠️ El botón "Continuar" está deshabilitado.');
        }
        return;
      }
    }

    console.error('❌ Botón "Continuar" no encontrado.');
  });

  // Esperar para ver resultados
  await new Promise((resolve) => setTimeout(resolve, 8000));

  await browser.close();
})();
