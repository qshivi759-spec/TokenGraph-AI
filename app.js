document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const statusMsg = document.getElementById('upload-status');
    const docList = document.getElementById('doc-list');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');
    const refreshGraphBtn = document.getElementById('refresh-graph');

    let currentDocId = null;
    let network = null;

    // --- Graph Visualization Setup (vis.js) ---
    const container = document.getElementById('network-container');
    const options = {
        nodes: {
            shape: 'dot',
            size: 20,
            font: { color: '#e2e8f0', size: 14, face: 'Inter' },
            borderWidth: 2,
            color: {
                background: '#1e293b',
                border: '#6366f1',
                highlight: { background: '#6366f1', border: '#a855f7' }
            }
        },
        edges: {
            width: 1.5,
            color: { color: '#475569', highlight: '#6366f1' },
            font: { color: '#94a3b8', size: 11, align: 'middle', face: 'Inter' },
            arrows: { to: { enabled: true, scaleFactor: 0.5 } },
            smooth: { type: 'continuous' }
        },
        physics: {
            barnesHut: { gravitationalConstant: -2000, springLength: 150 },
            stabilization: { iterations: 150 }
        },
        interaction: { hover: true, tooltipDelay: 200 }
    };

    // --- Event Listeners ---

    // File Upload Area
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileUpload(e.target.files[0]);
        }
    });

    // Chat Interface
    sendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });

    refreshGraphBtn.addEventListener('click', fetchAndRenderGraph);

    // --- Functions ---

    function showStatus(message, type) {
        statusMsg.textContent = message;
        statusMsg.className = `status-msg ${type}`;
    }

    async function handleFileUpload(file) {
        if (file.type !== 'application/pdf') {
            showStatus('Please upload a valid PDF file.', 'error');
            return;
        }

        showStatus('Extracting text & building Knowledge Graph...', 'loading');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                showStatus('Upload successful! Graph updated.', 'success');
                currentDocId = data.document_id;

                // Update UI
                updateDocList(data.filename);
                enableChat();
                fetchAndRenderGraph();

                // System message
                addMessage(`I've processed "${data.filename}", extracted entities, and built the knowledge graph. You can now ask questions about it!`, 'ai');
            } else {
                showStatus(data.detail || 'Upload failed.', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showStatus('Server connection failed.', 'error');
        }
    }

    function updateDocList(filename) {
        const emptyState = docList.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        const li = document.createElement('li');
        li.textContent = filename;
        docList.appendChild(li);
    }

    function enableChat() {
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.focus();
    }

    async function fetchAndRenderGraph() {
        try {
            const response = await fetch('/api/graph');
            const graphData = await response.json();

            if (graphData.nodes.length === 0) return;

            // Remove empty message
            const emptyMsg = container.querySelector('.empty-graph-msg');
            if (emptyMsg) emptyMsg.style.display = 'none';

            // Format for vis.js
            const nodes = new vis.DataSet(graphData.nodes.map(n => ({
                id: n.id,
                label: n.id,
                title: n.label // Tooltip
            })));

            const edges = new vis.DataSet(graphData.edges.map(e => ({
                from: e.source,
                to: e.target,
                label: e.label
            })));

            const data = { nodes, edges };

            if (network) {
                network.setData(data);
            } else {
                network = new vis.Network(container, data, options);
            }
        } catch (error) {
            console.error('Error fetching graph:', error);
        }
    }

    async function sendChatMessage() {
        const text = chatInput.value.trim();
        if (!text || !currentDocId) return;

        // Add user message
        addMessage(text, 'user');
        chatInput.value = '';

        // Show loading state
        const loadingId = addLoadingMessage();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, document_id: currentDocId })
            });

            const data = await response.json();

            // Remove loading
            document.getElementById(loadingId).remove();

            if (response.ok) {
                addMessage(data.answer, 'ai', data.context_used);
            } else {
                addMessage('Sorry, an error occurred while processing your query.', 'ai');
            }
        } catch (error) {
            document.getElementById(loadingId).remove();
            addMessage('Failed to connect to the server.', 'ai');
        }
    }

    function addMessage(text, sender, context = null) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}`;

        const icon = sender === 'ai' ? 'fa-robot' : 'fa-user';
        const avatarClass = sender === 'ai' ? 'ai-avatar' : 'user-avatar';

        let contextHtml = '';
        if (context && context.length > 0) {
            contextHtml = `
                <div class="context-box">
                    <div class="context-title"><i class="fa-solid fa-diagram-project"></i> Graph Context Retrieved</div>
                    ${context.map(c => `• ${c}`).join('<br>')}
                </div>
            `;
        }

        msgDiv.innerHTML = `
            <div class="avatar ${avatarClass}"><i class="fa-solid ${icon}"></i></div>
            <div class="message-content">
                <p>${text}</p>
                ${contextHtml}
            </div>
        `;

        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addLoadingMessage() {
        const id = 'loading-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.id = id;
        msgDiv.className = 'message ai';
        msgDiv.innerHTML = `
            <div class="avatar ai-avatar"><i class="fa-solid fa-robot"></i></div>
            <div class="message-content">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return id;
    }
});
