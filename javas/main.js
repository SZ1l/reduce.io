document.getElementById('upload-form').addEventListener('submit', function(event) {
    event.preventDefault();

    const fileInput = document.getElementById('xmlFile');
    const file = fileInput.files[0];
    let checkCount = 0; // Счетчик проверок

    if (file) {
        const reader = new FileReader();

        reader.onload = async function(e) {
            console.log("XML-файл загружен:", e.target.result);
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(e.target.result, "text/xml");

            const offers = Array.from(xmlDoc.getElementsByTagName('offer'));

            function transliterate(text) {
                const cyrillicToLatinMap = {
                    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
                    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
                    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
                    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ы': 'y', 'э': 'e', 'ю': 'yu', 'я': 'ya',
                    'ь': '', 'ъ': '', ' ': '-', ',': '', '.': '-', '-': '-', '(': '', ')': ''
                };
                
                return text.toLowerCase().split('').map(char => cyrillicToLatinMap[char] || char).join('');
            }

            async function checkKaspiPriceByUrl(productName, sku) {
                try {
                    const productNameForUrl = transliterate(productName);
                    const productUrl = `https://kaspi.kz/shop/p/${productNameForUrl}-${sku}/`;
                    const proxyUrl = `http://localhost:8080/${productUrl}`;
                    
                    console.log("Visiting URL:", proxyUrl);

                    const response = await fetch(proxyUrl, {
                        method: 'GET',
                        headers: {
                            'Origin': 'http://localhost:8080',
                            'x-requested-with': 'XMLHttpRequest'
                        }
                    });

                    const text = await response.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, 'text/html');
                    const priceElement = doc.querySelector('meta[property="product:price:amount"]');

                    if (priceElement) {
                        const kaspiPrice = parseInt(priceElement.getAttribute('content'), 10);
                        return kaspiPrice;
                    } else {
                        console.error("Цена не найдена на странице");
                        return null;
                    }
                } catch (error) {
                    console.error("Ошибка при запросе страницы Kaspi:", error);
                    return null;
                }
            }

            async function renderAllItems() {
                const itemsContainer = document.getElementById('items-container');
                itemsContainer.innerHTML = '';

                for (let i = 0; i < offers.length; i++) {
                    const offer = offers[i];
                    const sku = offer.getAttribute('sku');
                    const modelName = offer.getElementsByTagName('model')[0].textContent;
                    const priceTag = offer.getElementsByTagName('price')[0];
                    let price = parseInt(priceTag.textContent, 10);

                    const kaspiPrice = await checkKaspiPriceByUrl(modelName, sku);

                    let updatedPrice = price;
                    let minPriceInputValue = 120000; // Устанавливаем дефолтное значение минимальной цены

                    if (price > kaspiPrice) {
                        updatedPrice = Math.max(kaspiPrice - 1, minPriceInputValue); // Ограничение на минимальную цену
                        priceTag.textContent = updatedPrice;
                    }

                    const itemDiv = document.createElement('div');
                    itemDiv.classList.add('item');
                    itemDiv.innerHTML = `
                        <div class="names">Товар: ${modelName} (SKU: ${sku})</div>
                        <div class="prices">
                            Текущая цена: ${price} ₸
                            <br> Цена на Kaspi: ${kaspiPrice} ₸
                            <br> Обновленная цена: ${updatedPrice} ₸
                            <br> Минимальная цена: <input type="number" id="min-price-${i}" value="${minPriceInputValue}" step="1"> ₸
                        </div>
                    `;

                    itemsContainer.appendChild(itemDiv);

                    // Обновляем минимальную цену для каждого товара
                    document.getElementById(`min-price-${i}`).addEventListener('input', function() {
                        minPriceInputValue = parseInt(this.value, 10);
                    });
                }
            }

            renderAllItems();

            function saveUpdatedXML() {
                const serializer = new XMLSerializer();
                const updatedXML = serializer.serializeToString(xmlDoc);

                const blob = new Blob([updatedXML], { type: 'application/xml' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'updated_prices.xml';
                link.click();
            }

            const saveButton = document.createElement('button');
            saveButton.textContent = "Скачать обновленный XML файл";
            saveButton.addEventListener('click', saveUpdatedXML);
            document.body.appendChild(saveButton);

            // Функция, запускающая проверку каждые 5 минут
            function startPriceCheck() {
                setInterval(async function() {
                    checkCount++; // Увеличиваем счетчик проверок
                    document.getElementById('checkCount').textContent = `Обновления: ${checkCount}`;

                    console.log("Запуск проверки цен...");
                    for (let i = 0; i < offers.length; i++) {
                        const offer = offers[i];
                        const modelName = offer.getElementsByTagName('model')[0].textContent;
                        const sku = offer.getAttribute('sku');
                        const priceTag = offer.getElementsByTagName('price')[0];
                        let price = parseInt(priceTag.textContent, 10);

                        // Получаем минимальную цену, введенную пользователем
                        const minPriceInput = document.getElementById(`min-price-${i}`);
                        const minPrice = minPriceInput ? parseInt(minPriceInput.value, 10) : 120000; // Значение по умолчанию 120000

                        // Проверка цены на Kaspi.kz через URL товара
                        const kaspiPrice = await checkKaspiPriceByUrl(modelName, sku);

                        // Обновление цены, если нужно, и она не ниже минимальной
                        if (price > kaspiPrice && (kaspiPrice - 1) >= minPrice) {
                            priceTag.textContent = kaspiPrice - 1;
                            console.log(`Цена на ${modelName} обновлена до ${kaspiPrice - 1}`);
                        }
                    }
                    renderAllItems(); // Обновляем интерфейс
                }, 5 * 60 * 1000); // Интервал 5 минут
            }
            

            // Запуск процесса проверки каждые 5 минут
            startPriceCheck();
        };

        reader.readAsText(file);
    }
});












console.log('JavaScript работает!');

