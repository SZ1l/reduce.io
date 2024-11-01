import express from 'express';
import mysql from 'mysql2/promise';
import fs from 'fs';
import xml2js from 'xml2js';
import cron from 'node-cron';
import puppeteer from 'puppeteer';

const app = express();
const port = 3000;

const db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'your_new_password',
    database: 'registration'
});

function transliterate(text) {
    const cyrillicToLatinMap = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
        'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
        'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
        'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ы': 'y', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'ь': '', 'ъ': '', '/': '-', ' ': '-', ',': '', '.': '-', '-': '-', '(': '', ')': ''
    };
    return text.toLowerCase().split('').map(char => cyrillicToLatinMap[char] || char).join('');
}

async function checkKaspiPriceByUrl(productName, sku) {
    const productNameForUrl = transliterate(productName);
    const productUrl = `https://kaspi.kz/shop/p/${productNameForUrl}-${sku}/`;

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ru-RU,ru;q=0.9',
            'Referer': 'https://kaspi.kz/'
        });
        
        await page.goto(productUrl, { waitUntil: 'networkidle2' });
        const pageContent = await page.content();

        const priceMatch = pageContent.match(/"product:price:amount" content="(\d+)"/);
        const kaspiPrice = priceMatch ? parseInt(priceMatch[1], 10) : null;

        await browser.close();
        return { kaspiPrice, productUrl };

    } catch (error) {
        console.error(`Error fetching price for URL ${productUrl}:`, error);
        await browser.close();
        return { kaspiPrice: null, productUrl };
    }
}

async function processUserXML(userId) {
    const xmlFilePath = `/home/ubuntu/reduce.io/prices/${userId}prices.xml`;
    fs.readFile(xmlFilePath, (err, data) => {
        if (err) {
            console.error(`Error reading XML file for user ${userId}:`, err);
            return;
        }

        const parser = new xml2js.Parser({ ignoreAttrs: false, explicitArray: false });
        parser.parseString(data, async (err, result) => {
            if (err) {
                console.error(`Error parsing XML file for user ${userId}:`, err);
                return;
            }

            if (!result.kaspi_catalog || !result.kaspi_catalog.offers || !result.kaspi_catalog.offers.offer) {
                console.error(`Error: XML structure for user ${userId} lacks offers.offer`);
                return;
            }

            const offers = Array.isArray(result.kaspi_catalog.offers.offer)
                ? result.kaspi_catalog.offers.offer
                : [result.kaspi_catalog.offers.offer];

            const productCount = offers.length;
            const delay = productCount < 10 ? 10000 : productCount < 100 ? 2000 : 800;
            const batchSize = 10;

            console.log(`User ${userId} has ${productCount} products. Processing in batches with delay: ${delay} ms`);

            async function processBatch(batchIndex = 0) {
                const start = batchIndex * batchSize;
                const end = Math.min(start + batchSize, offers.length);

                const batch = offers.slice(start, end);
                for (let i = 0; i < batch.length; i++) {
                    const offer = batch[i];
                    const modelName = offer.model;
                    const sku = offer.$.sku;
                    let price = parseInt(offer.price, 10);

                    const { kaspiPrice, productUrl } = await checkKaspiPriceByUrl(modelName, sku);
                    await new Promise(resolve => setTimeout(resolve, delay));

                    if (kaspiPrice && price > kaspiPrice) {
                        const maxAllowedReduction = Math.floor(price * 0.1);
                        const minimumPrice = price - maxAllowedReduction;
                        price = Math.max(kaspiPrice - 1, minimumPrice);
                    }

                    await db.query(
                        `INSERT INTO offers (user_id, model, sku, price, kaspi_price, product_url)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                        price = VALUES(price), 
                        kaspi_price = VALUES(kaspi_price), 
                        product_url = VALUES(product_url), 
                        updated_at = CURRENT_TIMESTAMP`,
                        [userId, modelName, sku, price, kaspiPrice, productUrl]
                    );

                    offer.price = price;
                }

                if (end < offers.length) {
                    await processBatch(batchIndex + 1);
                } else {
                    const builder = new xml2js.Builder();
                    const updatedXml = builder.buildObject(result);
                    
                    fs.writeFile(`/home/ubuntu/reduce.io/prices/${userId}upload.xml`, updatedXml, (err) => {
                        if (err) {
                            console.error(`Error saving updated XML file for user ${userId}:`, err);
                        } else {
                            console.log(`XML file successfully updated for user ${userId}`);
                        }
                    });
                }
            }

            await processBatch();
        });
    });
}

async function processAllUsers() {
    const [users] = await db.query('SELECT id FROM users');
    for (const user of users) {
        const userId = user.id;
        console.log(`Starting processing for user with ID: ${userId}`);
        await processUserXML(userId);
    }
}

cron.schedule('*/2 * * * *', async () => {
    console.log('Starting price check for all users...');
    await processAllUsers();
});

app.get('/get-offers/:userId', async (req, res) => {
    const { userId } = req.params;
    const [rows] = await db.query('SELECT * FROM offers WHERE user_id = ?', [userId]);
    res.json(rows);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
