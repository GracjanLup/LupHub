document.getElementById('send-button').addEventListener('click', async function () {
    var userInput = document.getElementById('user-input').value;
    if (userInput.trim() !== '') {
        var chatWindow = document.getElementById('chat-window');

        // Dodaj wiadomość użytkownika
        var userMessage = document.createElement('div');
        userMessage.className = 'message user';
        userMessage.innerText = userInput;
        chatWindow.appendChild(userMessage);

        // Wyczyść pole wejściowe
        document.getElementById('user-input').value = '';

        // Dodaj wiadomość bota (ładowanie)
        var botMessage = document.createElement('div');
        botMessage.className = 'message bot';
        botMessage.innerText = "Loading...";
        chatWindow.appendChild(botMessage);

        // Scroll do dołu
        chatWindow.scrollTop = chatWindow.scrollHeight;

        // Wyślij zapytanie do backendu
        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: userInput })
            });

            if (!response.ok) {
                throw new Error("Failed to fetch response from server");
            }

            const data = await response.json();
            botMessage.innerText = data.response;
        } catch (error) {
            botMessage.innerText = "Error: Could not fetch response.";
            console.error(error);
        }
    }
});

document.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        document.getElementById('send-button').click();
    }
});

document.getElementById('prompt1').addEventListener('click', async function () {
    await handlePromptWithLoading(
        "What can I find in the Articles section?",
        "In the Articles section, you’ll find a collection of scientific articles and reports authored by Gracjan Popiółkowski, primarily focusing on artificial intelligence. Additionally, it includes a bachelor’s thesis from cognitive science studies, which examines the intriguing impact of short video formats, such as TikToks, on neurobiology and cognitive processes."
    );
});

document.getElementById('prompt2').addEventListener('click', async function () {
    const chatWindow = document.getElementById('chat-window');

    // Dodaj pytanie użytkownika
    const userMessage = document.createElement('div');
    userMessage.className = 'message user';
    userMessage.textContent = "What is machine learning?";
    chatWindow.appendChild(userMessage);

    // Dodaj wiadomość bota (ładowanie)
    const botMessage = document.createElement('div');
    botMessage.className = 'message bot';
    botMessage.textContent = "Loading...";
    chatWindow.appendChild(botMessage);

    chatWindow.scrollTop = chatWindow.scrollHeight;

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: "Short answer: What is machine learning?" })
        });

        if (!response.ok) {
            throw new Error("Failed to fetch response from server");
        }

        const data = await response.json();
        botMessage.textContent = data.response;
    } catch (error) {
        botMessage.textContent = "Error: Could not fetch response.";
        console.error(error);
    }
});

document.getElementById('prompt3').addEventListener('click', async function () {
    await handlePromptWithLoading(
        "Who is Gracjan Popiółkowski?",
        "Gracjan Popiółkowski is the creator of this website and chatbot. He is a junior specialist in artificial intelligence with a wide range of interests, detailed further in the Author section. Currently, he works at the Polish company Wano Solutions, where he focuses on integrating artificial intelligence tools into business processes. He is employed there until he embarks on his Erasmus+ internship."
    );
});

async function handlePromptWithLoading(userQuestion, botResponse) {
    const chatWindow = document.getElementById('chat-window');

    // Dodaj pytanie użytkownika
    const userMessage = document.createElement('div');
    userMessage.className = 'message user';
    userMessage.textContent = userQuestion;
    chatWindow.appendChild(userMessage);

    // Dodaj wiadomość "Loading..."
    const botMessage = document.createElement('div');
    botMessage.className = 'message bot';
    botMessage.textContent = "Loading...";
    chatWindow.appendChild(botMessage);

    chatWindow.scrollTop = chatWindow.scrollHeight;

    // Opóźnij wyświetlenie odpowiedzi
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Zaktualizuj wiadomość bota
    botMessage.textContent = botResponse;
}


function handlePromptClick(userQuestion, botResponse) {
    const chatWindow = document.getElementById('chat-window');

    // Dodaj pytanie użytkownika
    const userMessage = document.createElement('div');
    userMessage.className = 'message user';
    userMessage.textContent = userQuestion;
    chatWindow.appendChild(userMessage);

    // Dodaj odpowiedź bota
    const botMessage = document.createElement('div');
    botMessage.className = 'message bot';
    botMessage.textContent = botResponse;
    chatWindow.appendChild(botMessage);

    // Automatyczne przewinięcie na dół
    chatWindow.scrollTop = chatWindow.scrollHeight;
}



// document.getElementById('send-button').addEventListener('click', async function() {
//     var userInput = document.getElementById('user-input').value;
//     if (userInput.trim() !== '') {
//         // Dodaj wiadomość użytkownika do okna czatu
//         var userMessage = document.createElement('div');
//         userMessage.className = 'message user';
//         userMessage.innerText = userInput;
//         document.getElementById('chat-window').appendChild(userMessage);

//         // Wyczyść pole wejściowe
//         document.getElementById('user-input').value = '';

//         // Dodaj wiadomość bota (ładowanie...)
//         var botMessage = document.createElement('div');
//         botMessage.className = 'message bot';
//         botMessage.innerText = "Loading...";
//         document.getElementById('chat-window').appendChild(botMessage);

//         // Scroll do dołu
//         document.getElementById('chat-window').scrollTop = document.getElementById('chat-window').scrollHeight;

//         // Wyślij zapytanie do backendu
//         try {
//             const response = await fetch('/chat', { // Zmieniono endpoint na /chat
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify({ text: userInput }) // Zmieniono klucz na "text"
//             });

//             if (!response.ok) {
//                 throw new Error("Failed to fetch response from server");
//             }

//             const data = await response.json();
//             botMessage.innerText = data.response; // Wyświetl odpowiedź modelu
//         } catch (error) {
//             botMessage.innerText = "Error: Could not fetch response.";
//             console.error(error);
//         }
//     }
// });

