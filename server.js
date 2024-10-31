import express from 'express';
import mysql from 'mysql2/promise';
import fs from 'fs';
import xml2js from 'xml2js';
import cron from 'node-cron';
import fetch from 'node-fetch';

const app = express();
const port = 3000;

const db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'registration'
});

// Transliteration for URL formation
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

// Modified checkKaspiPriceByUrl function with retry mechanism
async function checkKaspiPriceByUrl(productName, sku, retries = 3) {
    const productNameForUrl = transliterate(productName);
    const productUrl = `https://kaspi.kz/shop/p/${productNameForUrl}-${sku}/`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(productUrl);
            const text = await response.text();
            console.log(`Requesting URL: ${productUrl} (attempt ${attempt})`);

            const priceMatch = text.match(/"product:price:amount" content="(\d+)"/);
            if (priceMatch) {
                const kaspiPrice = parseInt(priceMatch[1], 10);
                console.log(kaspiPrice);
                return { kaspiPrice, productUrl };
            } else {
                console.error(`Price not found on page ${productUrl}`);
                return { kaspiPrice: null, productUrl };
            }
        } catch (error) {
            console.error(`Error requesting Kaspi page at URL ${productUrl} (attempt ${attempt}):`, error);

            if (attempt === retries) {
                return { kaspiPrice: null, productUrl };
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Delay before retrying
        }
    }
}

// Process XML for each user in batches
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

            // Recursive batch processor
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
                    await processBatch(batchIndex + 1);  // Process next batch
                } else {
                    // All batches processed, save the XML
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

            await processBatch();  // Start batch processing
        });
    });
}

// Function to process all registered users
async function processAllUsers() {
    const [users] = await db.query('SELECT id FROM users');

    for (const user of users) {
        const userId = user.id;
        console.log(`Starting processing for user with ID: ${userId}`);
        await processUserXML(userId);  // Process each user's XML
    }
}

// Scheduler to process all users every 15 minutes
cron.schedule('*/2 * * * *', async () => {
    console.log('Starting price check for all users...');
    await processAllUsers();
});

// API to retrieve data from the database by user ID
app.get('/get-offers/:userId', async (req, res) => {
    const { userId } = req.params;
    const [rows] = await db.query('SELECT * FROM offers WHERE user_id = ?', [userId]);
    res.json(rows);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


