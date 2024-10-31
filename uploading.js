import puppeteer from 'puppeteer';
import cron from 'node-cron';
import mysql from 'mysql2/promise';

// Path to XML file
const xmlFilePath = 'C:/Users/olzha/CeoHTML/javas/5upload.xml';

// Kaspi login credentials
const login = 'szjmlj@gmail.com';  
const password = '#fQcA"LL8P';  

// Database connection
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'registration',
};

async function checkPauseStatus(userId) {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT status FROM offers WHERE user_id = ?', [userId]);
    await connection.end();
    return rows.length > 0 ? rows[0].status : 0;
}

async function uploadToKaspi(userId) {
    let browser;

    try {
        const status = await checkPauseStatus(userId);
        if (status === 0) {
            console.log('Upload paused by user.');
            return; // Skip upload if paused
        }

        browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        await page.goto('https://idmc.shop.kaspi.kz/login');
        await page.waitForSelector('#user_email_field', { timeout: 10000 });
        await page.type('#user_email_field', login, { delay: 100 });
        await page.click('button.button.is-primary');

        await page.waitForSelector('#password_field', { timeout: 10000 });
        await page.type('#password_field', password, { delay: 100 });
        await page.click('button.button.is-primary');

        await new Promise(resolve => setTimeout(resolve, 5000));
        await page.goto('https://kaspi.kz/mc/#/price-list');
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        const fileUploadExists = await page.$('label.upload.control input[type="file"]');
        
        if (!fileUploadExists) throw new Error('File upload element not found.');

        await new Promise(resolve => setTimeout(resolve, 5000));
        const [fileChooser] = await Promise.all([
            page.waitForFileChooser(),
            page.click('label.upload.control input[type="file"]')
        ]);

        await fileChooser.accept([xmlFilePath]);
        await page.waitForSelector('button.mb-1.is-primary', { timeout: 10000 });
        await page.click('button.mb-1.is-primary');

        console.log('Price list uploaded successfully.');
        await new Promise(resolve => setTimeout(resolve, 20000));

    } catch (error) {
        console.error('Error uploading price list:', error.message);
    } finally {
        if (browser) await browser.close();
        console.log('Browser closed.');
    }
}

// Schedule the job every 15 minutes
cron.schedule('*/15 * * * *', () => {
    console.log('Attempting to upload price list to Kaspi...');
    const userId = 5; // Replace with the actual user ID from session or config
    uploadToKaspi(userId);
});
