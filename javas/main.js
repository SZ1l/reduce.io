/*function loadXMLDoc(filename) {
  fetch(filename)
    .then(response => response.text())
    .then(data => {
      parseXML(data);
    })
    .catch(error => console.log(error));
}

function parseXML(xmlStr) {
  // Parse the XML string
  var parser = new DOMParser();
  var xmlDoc = parser.parseFromString(xmlStr, "text/xml");

  // Define the namespace
  var ns = "kaspiShopping";
  var offers = xmlDoc.getElementsByTagNameNS(ns, "offer");

  // Extract model and price
  for (var i = 0; i < offers.length; i++) {
    var model = offers[i].getElementsByTagNameNS(ns, "model")[0].textContent;
    var price = offers[i].getElementsByTagNameNS(ns, "price")[0].textContent;
    console.log("Model: " + model + ", Price: " + price);
  }
}
console.log("Name: " + name + ", Model: " + model + ", Price: " + price);

// Call the function with the path to your XML file
loadXMLDoc("pricelist/17342053_66d5b64439a90d7e590919e2.xml");


var min;

if (min == True){
    lower(price)
}
function lower(price){
    return price -= 2;
    
}*/


document.getElementById('upload-form').addEventListener('submit', function(event) {
    event.preventDefault();

    const fileInput = document.getElementById('xmlFile');
    const file = fileInput.files[0];

    if (file) {
        const reader = new FileReader();

        reader.onload = async function(e) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(e.target.result, "text/xml");

            // Извлечение всех товаров
            const offers = Array.from(xmlDoc.getElementsByTagName('offer'));
            let checkCount = 0;

            // Функция для проверки цен на Kaspi.kz
            async function checkKaspiPrice(productName) {
    try {
        const response = await fetch(`https://kaspi.kz/shop/api/products/search?q=${encodeURIComponent(productName)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Bearer 0brigbWq/0WSnkYhQ87wTs1P32q12buvZ+sbGc7ttnU=' // Замените на ваш реальный токен
            }
        });

        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }

        const data = await response.json();
        const product = data.items[0]; // Допустим, вы берете первый результат поиска

        if (product) {
            const kaspiPrice = product.price; // Предполагается, что цена доступна в объекте продукта
            return kaspiPrice;
        } else {
            console.error("Товар не найден в API Kaspi.kz");
            return null;
        }
    } catch (error) {
        console.error("Ошибка при обращении к API Kaspi.kz:", error);
        return null;
    }
}

// Пример использования функции
checkKaspiPrice("название_товара").then(price => {
    console.log("Цена на Kaspi.kz:", price);
});


            // Функция для отображения всех товаров
            async function renderAllItems() {
                const itemsContainer = document.getElementById('items-container');
                itemsContainer.innerHTML = '';

                for (let i = 0; i < offers.length; i++) {
                    const modelName = offers[i].getElementsByTagName('model')[0].textContent;
                    const priceTag = offers[i].getElementsByTagName('price')[0];
                    let price = parseInt(priceTag.textContent, 10);

                    // Проверка цены на Kaspi.kz
                    const kaspiPrice = await checkKaspiPrice(modelName);
                    let updatedPrice = price;

                    if (kaspiPrice && price > kaspiPrice) {
                        updatedPrice = kaspiPrice - 1;
                    }

                    // Отображение товара
                    const itemDiv = document.createElement('div');
                    itemDiv.classList.add('item');
                    itemDiv.innerHTML = `
                        <div class="names">Товар: ${modelName}</div>
                        <div class="prices">
                            Текущая цена: ${price} ₸
                            <br> Цена на Kaspi: ${kaspiPrice} ₸
                            <br> Обновленная цена: ${updatedPrice} ₸
                            <br> Минимальная цена: <input type="number" id="min-price-${i}" value="{price}" step="1"> ₸
                        </div>
                    `;
                    itemsContainer.appendChild(itemDiv);
                }
            }
            async function checkKaspiAttributes() {
    try {
        const response = await fetch(`https://kaspi.kz/shop/api/products/classification/attributes?c=Master - Exercise notebooks`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Auth-Token': '0brigbWq/0WSnkYhQ87wTs1P32q12buvZ+sbGc7ttnU=' // Замените на ваш реальный токен
            }
        });

        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }

        const data = await response.json();
        console.log("Данные атрибутов с Kaspi.kz:", data);
        return data;
    } catch (error) {
        console.error("Ошибка при обращении к API Kaspi:", error);
        return null;
    }
}

// Пример вызова функции
checkKaspiAttributes();


            // Отображаем все товары
            renderAllItems();

            // Функция для запуска проверки каждые 5 минут
            function startPriceCheck() {
                setInterval(async function() {
                    checkCount++;
                    document.getElementById('checkCount').textContent = `Обновления: ${checkCount}`;

                    console.log("Запуск проверки цен...");
                    for (let i = 0; i < offers.length; i++) {
                        const modelName = offers[i].getElementsByTagName('model')[0].textContent;
                        const priceTag = offers[i].getElementsByTagName('price')[0];
                        let price = parseInt(priceTag.textContent, 10);

                        const minPriceInput = document.getElementById(`min-price-${i}`);
                        const minPrice = minPriceInput ? parseInt(minPriceInput.value, 10) : 120000;

                        const kaspiPrice = await checkKaspiPrice(modelName);

                        if (price > kaspiPrice && (kaspiPrice - 1) >= minPrice) {
                            priceTag.textContent = kaspiPrice - 1;
                            console.log(`Цена на ${modelName} обновлена до ${kaspiPrice - 1}`);
                        }
                    }
                    renderAllItems();
                }, 5 * 60 * 1000);
            }

            startPriceCheck();
        };

        reader.readAsText(file);
    }
    
});





console.log('JavaScript работает!');

