console.log('javasscript рабоатет');
document.getElementById('fetchOffersBtn').addEventListener('click', async function() {
    const userId = document.getElementById('userId').value;
    if (!userId) {
        alert('Please enter a valid user ID');
        return;
    }

    try {
        // Отправляем запрос на сервер для получения товаров пользователя
        const response = await fetch(`/get-offers/${userId}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch offers');
        }

        const offers = await response.json();

        // Отображаем список товаров
        const offerList = document.getElementById('offerList');
        offerList.innerHTML = ''; // Очищаем список

        if (offers.length === 0) {
            offerList.innerHTML = `<p>No offers found for user ID: ${userId}</p>`;
        } else {
            offers.forEach(offer => {
                const offerDiv = document.createElement('div');
                offerDiv.classList.add('offer');
                
                offerDiv.innerHTML = `
                    <h3>Model: ${offer.model}</h3>
                    <p>SKU: ${offer.sku}</p>
                    <p>Price: ${offer.price}</p>
                    <p>Kaspi Price: ${offer.kaspi_price}</p>
                    <p>Product URL: <a href="${offer.product_url}" target="_blank">${offer.product_url}</a></p>
                `;
                offerList.appendChild(offerDiv);
            });
        }
    } catch (error) {
        console.error('Error fetching offers:', error);
        alert('Error fetching offers. Check console for more details.');
    }
});
