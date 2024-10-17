import express from 'express';
import mysql from 'mysql2/promise';
import fs from 'fs';
import xml2js from 'xml2js';
import cron from 'node-cron';
import fetch from 'node-fetch';

const app = express();
const port = 3000;

// Обернем основной код в асинхронную функцию
async function startServer() {
    // Создаем подключение к базе данных
    const db = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'registration'
    });

    // Остальной код работы с базой данных, XML и другими операциями
    // Транслитерация для формирования URL
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

    // Функция для получения цены с Kaspi.kz и URL
    async function checkKaspiPriceByUrl(productName, sku) {
    const productNameForUrl = transliterate(productName);
    const productUrl = `https://kaspi.kz/shop/p/${productNameForUrl}-${sku}/`;

    try {
        const response = await fetch(productUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
            }
        });
        const text = await response.text();
        console.log(`Запрос по URL: ${productUrl}`);

        const priceMatch = text.match(/"product:price:amount" content="(\d+)"/);
        if (priceMatch) {
            const kaspiPrice = parseInt(priceMatch[1], 10);
            console.log(kaspiPrice);
            return { kaspiPrice, productUrl };
        } else {
            console.error(`Цена не найдена на странице ${productUrl}`);
            return { kaspiPrice: null, productUrl };
        }
    } catch (error) {
        console.error(`Ошибка при запросе страницы Kaspi по URL ${productUrl}:`, error);
        return { kaspiPrice: null, productUrl };
    }
}


    // Обработка XML для каждого пользователя
    async function processUserXML(userId) {
        const xmlFilePath = `/home/ubuntu/reduce.io/price/${userId}prices.xml`;
        fs.readFile(xmlFilePath, (err, data) => {
            if (err) {
                console.error(`Ошибка при чтении XML файла пользователя ${userId}:`, err);
                return;
            }

            const parser = new xml2js.Parser({ ignoreAttrs: false, explicitArray: false });
            parser.parseString(data, async (err, result) => {
                if (err) {
                    console.error(`Ошибка при парсинге XML файла пользователя ${userId}:`, err);
                    return;
                }

                if (!result.kaspi_catalog || !result.kaspi_catalog.offers || !result.kaspi_catalog.offers.offer) {
                    console.error(`Ошибка: структура XML файла пользователя ${userId} не содержит offers.offer`);
                    return;
                }

                const offers = Array.isArray(result.kaspi_catalog.offers.offer)
                    ? result.kaspi_catalog.offers.offer
                    : [result.kaspi_catalog.offers.offer];

                const productCount = offers.length;

                let delay = 0;
                if (productCount < 10) {
                    delay = 50000;
                } else if (productCount < 100) {
                    delay = 5000;
                } else {
                    delay = 1000;
                }

                console.log(`Количество товаров в XML пользователя ${userId}: ${productCount}. Установленный интервал: ${delay} мс`);

                for (let i = 0; i < offers.length; i++) {
                    const offer = offers[i];
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

                const builder = new xml2js.Builder();
                const updatedXml = builder.buildObject(result);

                fs.writeFile(`/home/ubuntu/reduce.io/price/${userId}upload.xml`, updatedXml, (err) => {
                    if (err) {
                        console.error(`Ошибка при записи обновленного XML файла для пользователя ${userId}:`, err);
                    } else {
                        console.log(`XML файл успешно обновлен для пользователя ${userId}`);
                    }
                });
            });
        });
    }

    // Функция для обработки всех зарегистрированных пользователей
    async function processAllUsers() {
        const [users] = await db.query('SELECT id FROM users');
        for (const user of users) {
            const userId = user.id;
            console.log(`Запуск обработки для пользователя с ID: ${userId}`);
            await processUserXML(userId);
        }
    }

    // Планировщик для обработки всех пользователей каждые 5 минут
    cron.schedule('*/10 * * * *', async () => {
        console.log('Запуск проверки цен для всех пользователей...');
        await processAllUsers();
    });

    // API для получения данных из базы данных по ID пользователя
    app.get('/get-offers/:userId', async (req, res) => {
        const { userId } = req.params;
        const [rows] = await db.query('SELECT * FROM offers WHERE user_id = ?', [userId]);
        res.json(rows);
    });

    // Запуск сервера
    app.listen(port, () => {
        console.log(`Сервер запущен на http://localhost:${port}`);
    });
}

// Вызов асинхронной функции для старта сервера
startServer().catch(error => {
    console.error('Ошибка при запуске сервера:', error);
});

